import { BranchVisual } from './BranchVisual.js';
import { ExtensionVisual } from './ExtensionVisual.js';
import { LeafVisual } from './LeafVisual.js';
import { ConnectionManager } from './ConnectionManager.js';
import { LayoutEngine } from './LayoutEngine.js';
import { RadialLayout } from './RadialLayout.js';
import { CONFIG } from './config.js';

export class Renderer {
    constructor(containerSel) {
        this.containerSel = containerSel;
        const container = d3.select(containerSel);
        container.selectAll("*").remove();

        // Compute available size from the DOM element.
        const rect = container.node().getBoundingClientRect();
        this.viewW = rect.width || 1200;
        this.viewH = rect.height || 800;

        this.svg = container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${this.viewW} ${this.viewH}`)
            .style("background", CONFIG.canvas.background)
            .style("display", "block");

        // Background grid for spatial reference.
        const defs = this.svg.append("defs");
        const pattern = defs.append("pattern")
            .attr("id", "grid")
            .attr("width", 40).attr("height", 40)
            .attr("patternUnits", "userSpaceOnUse");
        pattern.append("circle")
            .attr("cx", 20).attr("cy", 20).attr("r", 1)
            .attr("fill", "#1f2a3a");

        this.bgRect = this.svg.append("rect")
            .attr("width", this.viewW)
            .attr("height", this.viewH)
            .attr("fill", "url(#grid)");

        this.world = this.svg.append("g")
            .attr("class", "world")
            .style("will-change", "transform");
        this.connectionManager = new ConnectionManager(this.world);
        this.treeLayout = new LayoutEngine();
        this.radialLayout = new RadialLayout();
        // 'auto' picks per-render based on leaf count; user can override.
        this.layoutMode = 'auto';
        this._lastRoot = null;
        this.visualNodes = new Map(); // mptNode -> VisualNode

        // Pan/zoom: coalesce events to one transform write per animation frame.
        // d3.zoom fires per wheel tick, which can be 100+/s on trackpads; writing
        // an SVG transform attr that often causes layout thrash.
        this.currentTransform = d3.zoomIdentity;
        this._pendingTransform = null;
        this._rafScheduled = false;
        this.detailScale = 0.55; // below this zoom level, hide fine internals
        this._detailOn = true;

        const self = this;
        const applyTransform = () => {
            self._rafScheduled = false;
            const t = self._pendingTransform;
            if (!t) return;
            self.currentTransform = t;
            self.world.attr("transform", t.toString());
            self._updateDetail(t.k);
        };

        this.zoom = d3.zoom()
            .scaleExtent([0.05, 4])
            .on("zoom", (event) => {
                self._pendingTransform = event.transform;
                if (!self._rafScheduled) {
                    self._rafScheduled = true;
                    requestAnimationFrame(applyTransform);
                }
            });
        this.svg.call(this.zoom);

        window.addEventListener('resize', () => this.handleResize());
    }

    _updateDetail(scale) {
        const shouldShowDetail = scale >= this.detailScale;
        if (shouldShowDetail === this._detailOn) return;
        this._detailOn = shouldShowDetail;
        this.world.classed('low-detail', !shouldShowDetail);
    }

    handleResize() {
        const rect = d3.select(this.containerSel).node().getBoundingClientRect();
        this.viewW = rect.width;
        this.viewH = rect.height;
        this.svg.attr("viewBox", `0 0 ${this.viewW} ${this.viewH}`);
        this.bgRect.attr("width", this.viewW).attr("height", this.viewH);
    }

    createVisualNode(mptNode, id) {
        if (mptNode.type === 'branch') return new BranchVisual(id, mptNode);
        if (mptNode.type === 'extension') return new ExtensionVisual(id, mptNode);
        return new LeafVisual(id, mptNode);
    }

    setLayoutMode(mode) {
        // mode: 'auto' | 'tree' | 'radial'
        this.layoutMode = mode;
        if (this._lastRoot) this.render(this._lastRoot);
    }

    _resolveMode(tree) {
        if (this.layoutMode === 'tree' || this.layoutMode === 'radial') return this.layoutMode;
        // Auto: switch to radial once the trie outgrows what tree layout shows comfortably.
        // Use total node count as proxy — radial pays off past ~30.
        let nodeCount = 0;
        const walk = (t) => { nodeCount++; t.children.forEach(walk); };
        walk(tree);
        return nodeCount > 30 ? 'radial' : 'tree';
    }

    render(mptRoot) {
        this._lastRoot = mptRoot;
        this.world.selectAll("*").remove();
        this.connectionManager = new ConnectionManager(this.world);
        this.visualNodes.clear();

        if (!mptRoot) {
            this.world.append("text")
                .attr("x", this.viewW / 2)
                .attr("y", this.viewH / 2)
                .attr("text-anchor", "middle")
                .attr("fill", "#5a6a82")
                .attr("font-size", "18px")
                .text("Empty trie — add some key/value pairs to get started.");
            return;
        }

        // Pick layout (compute the tree once on either engine — both buildTreeStructure
        // walks are equivalent — but we let each engine annotate its own tree).
        const probeTree = this.treeLayout.buildTreeStructure(mptRoot);
        const mode = this._resolveMode(probeTree);
        const engine = mode === 'radial' ? this.radialLayout : this.treeLayout;
        const tree = engine.buildTreeStructure(mptRoot);
        const { positions, bbox } = engine.calculateLayout(tree);

        // Render visuals
        let i = 0;
        positions.forEach((pos, mptNode) => {
            const visual = this.createVisualNode(mptNode, `n${i++}`);
            visual.setPosition(pos.x, pos.y);
            visual.render(this.world);
            this.visualNodes.set(mptNode, visual);
        });

        // Connections
        const drawEdges = (treeNode) => {
            const parentVis = this.visualNodes.get(treeNode.node);
            const parentPos = positions.get(treeNode.node);
            treeNode.children.forEach(child => {
                const childVis = this.visualNodes.get(child.node);
                const childPos = positions.get(child.node);
                if (mode === 'radial') {
                    const polar = {
                        from: {
                            x: parentPos.x + parentPos.width / 2,
                            y: parentPos.y + parentPos.height / 2,
                            r: parentPos.polar.r,
                            angle: parentPos.polar.angle
                        },
                        to: {
                            x: childPos.x + childPos.width / 2,
                            y: childPos.y + childPos.height / 2,
                            r: childPos.polar.r,
                            angle: childPos.polar.angle
                        }
                    };
                    this.connectionManager.addConnection(parentVis, childVis, child.parentSlot, 'radial', polar);
                } else {
                    this.connectionManager.addConnection(parentVis, childVis, child.parentSlot);
                }
                drawEdges(child);
            });
        };
        drawEdges(tree);

        this.lastMode = mode;
        this.fitToView(bbox);
    }

    fitToView(bbox) {
        const pad = CONFIG.canvas.padding;
        const minY = bbox.minY ?? 0;
        const w = (bbox.maxX - bbox.minX) + pad * 2;
        const h = (bbox.maxY - minY) + pad * 2;
        const scale = Math.min(this.viewW / w, this.viewH / h, 1);
        // Center the bbox in the viewport.
        const tx = (this.viewW - (bbox.maxX + bbox.minX) * scale) / 2;
        const ty = (this.viewH - (bbox.maxY + minY) * scale) / 2;
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        this.svg.transition().duration(400).call(this.zoom.transform, transform);
    }

    resetView() {
        this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
    }
}
