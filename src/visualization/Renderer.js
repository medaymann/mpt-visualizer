import { BranchVisual } from './BranchVisual.js';
import { ExtensionVisual } from './ExtensionVisual.js';
import { LeafVisual } from './LeafVisual.js';
import { ConnectionManager } from './ConnectionManager.js';
import { LayoutEngine } from './LayoutEngine.js';
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

        this.world = this.svg.append("g").attr("class", "world");
        this.connectionManager = new ConnectionManager(this.world);
        this.layoutEngine = new LayoutEngine();
        this.visualNodes = new Map(); // mptNode -> VisualNode

        // Pan/zoom
        const self = this;
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (event) => {
                self.world.attr("transform", event.transform);
                self.currentTransform = event.transform;
            });
        this.svg.call(this.zoom);
        this.currentTransform = d3.zoomIdentity;

        // Re-measure on resize.
        window.addEventListener('resize', () => this.handleResize());
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

    render(mptRoot) {
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

        const tree = this.layoutEngine.buildTreeStructure(mptRoot);
        const { positions, bbox } = this.layoutEngine.calculateLayout(tree);

        // Render visuals
        let i = 0;
        positions.forEach((pos, mptNode) => {
            const visual = this.createVisualNode(mptNode, `n${i++}`);
            visual.setPosition(pos.x, pos.y);
            visual.render(this.world);
            this.visualNodes.set(mptNode, visual);
        });

        // Connections, with traversal preserving branch slots.
        const drawEdges = (treeNode) => {
            const parentVis = this.visualNodes.get(treeNode.node);
            treeNode.children.forEach(child => {
                const childVis = this.visualNodes.get(child.node);
                this.connectionManager.addConnection(parentVis, childVis, child.parentSlot);
                drawEdges(child);
            });
        };
        drawEdges(tree);

        this.fitToView(bbox);
    }

    fitToView(bbox) {
        const pad = CONFIG.canvas.padding;
        const w = bbox.maxX - bbox.minX + pad * 2;
        const h = bbox.maxY + pad * 2;
        const scale = Math.min(this.viewW / w, this.viewH / h, 1);
        const tx = (this.viewW - (bbox.maxX + bbox.minX) * scale) / 2;
        const ty = pad * scale;
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        this.svg.transition().duration(400).call(this.zoom.transform, transform);
    }

    resetView() {
        this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
    }
}
