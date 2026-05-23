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
        this._renderToken = 0; // bumped per render; chunked renders abort if superseded
        this.visualNodes = new Map();      // mptNode -> VisualNode
        this._parentByChild = new Map();   // mptNode (child) -> mptNode (parent)
        this._connByPair = new Map();      // `${parentId}|${childId}` -> connection record
        this._activeLeaf = null;
        this.onLeafHighlight = null;       // optional callback(entryKey | null)

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
            // Floor low enough that even very wide tries (thousands of nodes)
            // can be fitted in the viewport via scroll-out. The auto-fit path
            // computes whatever scale is needed and will respect this extent.
            .scaleExtent([0.001, 4])
            .on("zoom", (event) => {
                self._pendingTransform = event.transform;
                if (!self._rafScheduled) {
                    self._rafScheduled = true;
                    requestAnimationFrame(applyTransform);
                }
            });
        this.svg.call(this.zoom);

        // Click on empty canvas clears any active path highlight. We use the
        // background rect (not the svg) so clicks on actual nodes don't bubble
        // up and clear themselves.
        this.bgRect.on('click', () => this.clearHighlight());

        // Shared drag behaviour reused per-visual. We bind each visual to its
        // <g> via .datum(visual) so the drag subject() can read its current
        // position and d3 tracks pointer-to-subject offsets correctly across
        // the world's pan/zoom transform.
        this.dragBehavior = d3.drag()
            .clickDistance(3) // <= 3px movement still fires click (for leaf highlight)
            .subject(function (event, visual) {
                return { x: visual.x, y: visual.y, _visual: visual };
            })
            .on('start', (event) => {
                event.sourceEvent.stopPropagation();
            })
            .on('drag', (event) => {
                const visual = event.subject._visual;
                visual.setPosition(event.x, event.y);
                this.connectionManager.updateAll();
            });

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
        const prevMode = this.layoutMode;
        this.layoutMode = mode;
        if (!this._lastRoot) return;
        if (prevMode === mode || !this.visualNodes.size) {
            this.render(this._lastRoot);
            return;
        }
        this._animateLayoutSwitch();
    }

    /**
     * Recompute positions for the new mode and animate existing visuals from
     * their old positions to the new ones. Edges are redrawn at the end of the
     * transition (mode-specific anchors mean an in-flight tween would look
     * inconsistent).
     */
    _animateLayoutSwitch() {
        const root = this._lastRoot;
        const probeTree = this.treeLayout.buildTreeStructure(root);
        const mode = this._resolveMode(probeTree);
        const engine = mode === 'radial' ? this.radialLayout : this.treeLayout;
        const tree = engine.buildTreeStructure(root);
        const { positions, bbox } = engine.calculateLayout(tree);

        const TRANSITION_MS = 450;
        // Move each existing visual to its new position.
        positions.forEach((pos, mptNode) => {
            const visual = this.visualNodes.get(mptNode);
            if (!visual) return;
            const targetX = pos.x;
            const targetY = pos.y;
            visual.x = targetX;
            visual.y = targetY;
            visual.group
                .transition()
                .duration(TRANSITION_MS)
                .ease(d3.easeCubicInOut)
                .attr("transform", `translate(${targetX}, ${targetY})`);
        });

        // Fade out current connections in parallel, then rebuild them in new mode.
        this.connectionManager.layer
            .transition()
            .duration(TRANSITION_MS / 2)
            .style("opacity", 0)
            .on("end", () => {
                this.connectionManager.clear();
                this._drawEdges(tree, positions, mode);
                this.connectionManager.layer
                    .style("opacity", 0)
                    .transition()
                    .duration(TRANSITION_MS / 2)
                    .style("opacity", 1);
            });

        this.lastMode = mode;
        // Re-fit after the transition completes.
        setTimeout(() => this.fitToView(bbox), TRANSITION_MS);
    }

    /** Extracted so layout switch and initial render share the same edge code. */
    _drawEdges(tree, positions, mode) {
        // Each rebuild starts fresh; layout-switch clears and re-runs us.
        this._parentByChild.clear();
        this._connByPair.clear();
        const walk = (treeNode) => {
            const parentVis = this.visualNodes.get(treeNode.node);
            const parentPos = positions.get(treeNode.node);
            treeNode.children.forEach(child => {
                const childVis = this.visualNodes.get(child.node);
                const childPos = positions.get(child.node);
                let conn;
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
                    conn = this.connectionManager.addConnection(parentVis, childVis, child.parentSlot, 'radial', polar);
                } else {
                    conn = this.connectionManager.addConnection(parentVis, childVis, child.parentSlot);
                }
                this._parentByChild.set(child.node, treeNode.node);
                this._connByPair.set(`${parentVis.id}|${childVis.id}`, conn);
                walk(child);
            });
        };
        walk(tree);
    }

    // --- Path highlighting --------------------------------------------------

    toggleHighlight(leafMptNode) {
        if (this._activeLeaf === leafMptNode) {
            this.clearHighlight();
        } else {
            this.highlightPath(leafMptNode);
        }
    }

    highlightPath(leafMptNode) {
        // Reset any prior highlight state first.
        this._clearActiveAttrs();

        // Walk parent map back to root, collecting nodes along the way.
        const chain = [];
        let cur = leafMptNode;
        while (cur) {
            chain.push(cur);
            cur = this._parentByChild.get(cur);
        }

        // Mark each node in the chain as active.
        chain.forEach(mpt => {
            const v = this.visualNodes.get(mpt);
            if (v && v.group) v.group.attr('data-active', 'true');
        });

        // Mark each edge along the chain as active.
        for (let i = 0; i < chain.length - 1; i++) {
            const childVis = this.visualNodes.get(chain[i]);
            const parentVis = this.visualNodes.get(chain[i + 1]);
            if (!childVis || !parentVis) continue;
            const conn = this._connByPair.get(`${parentVis.id}|${childVis.id}`);
            if (conn) {
                conn.path.attr('data-active', 'true');
                if (conn.label) conn.label.attr('data-active', 'true');
            }
        }

        this.world.classed('path-mode', true);
        this._activeLeaf = leafMptNode;
        if (this.onLeafHighlight) this.onLeafHighlight(leafMptNode.entryKey ?? null);
    }

    clearHighlight() {
        if (!this._activeLeaf) return;
        this._clearActiveAttrs();
        this.world.classed('path-mode', false);
        this._activeLeaf = null;
        if (this.onLeafHighlight) this.onLeafHighlight(null);
    }

    _clearActiveAttrs() {
        this.world.selectAll('[data-active="true"]').attr('data-active', null);
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
        this._renderToken++; // any in-flight chunked render from before is now stale
        this.world.selectAll("*").remove();
        this.world.classed('path-mode', false);
        this.connectionManager = new ConnectionManager(this.world);
        this.visualNodes.clear();
        this._parentByChild.clear();
        this._connByPair.clear();
        this._activeLeaf = null;

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

        // Render visuals. For large tries, paint in rAF-paced chunks so the
        // page stays responsive while the trie comes in. For small tries do it
        // all synchronously — the chunked path adds a perceptible flash.
        const entries = Array.from(positions.entries());
        const CHUNK_THRESHOLD = 80;
        const CHUNK_SIZE = 50;
        if (entries.length <= CHUNK_THRESHOLD) {
            for (let i = 0; i < entries.length; i++) {
                this._addVisualAt(entries[i], i);
            }
            this._drawEdges(tree, positions, mode);
            this.lastMode = mode;
            this.fitToView(bbox);
        } else {
            const total = entries.length;
            const renderToken = this._renderToken; // already bumped at render() entry
            let i = 0;
            const step = () => {
                if (renderToken !== this._renderToken) return; // a newer render superseded this one
                const end = Math.min(i + CHUNK_SIZE, total);
                for (; i < end; i++) this._addVisualAt(entries[i], i);
                if (i < total) {
                    requestAnimationFrame(step);
                } else {
                    this._drawEdges(tree, positions, mode);
                    this.lastMode = mode;
                    this.fitToView(bbox);
                }
            };
            requestAnimationFrame(step);
        }
    }

    _addVisualAt(entry, i) {
        const [mptNode, pos] = entry;
        const visual = this.createVisualNode(mptNode, `n${i}`);
        visual.setPosition(pos.x, pos.y);
        visual.render(this.world);
        this.visualNodes.set(mptNode, visual);

        // Every node is draggable. d3.drag distinguishes a click (<3px movement)
        // from a drag, so the leaf-click highlight still works.
        //
        // We MUST stop pointerdown from reaching d3.zoom — otherwise zoom grabs
        // the gesture as a pan before d3.drag's clickDistance threshold has
        // been crossed, and you end up panning the whole canvas instead of
        // moving just the node.
        visual.group
            .datum(visual)
            .style('cursor', 'grab')
            .on('pointerdown', (event) => event.stopPropagation())
            .call(this.dragBehavior);

        // Leaves are clickable for path highlighting.
        if (mptNode.type === 'leaf') {
            visual.group.on('click', (event) => {
                event.stopPropagation();
                this.toggleHighlight(mptNode);
            });
        }
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
