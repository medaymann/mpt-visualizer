import { CONFIG } from './config.js';

/**
 * ConnectionManager
 *
 * Draws smooth connectors between MPT nodes. Supports two modes:
 *  - 'tree'   : cubic-bezier from bottom-center to top-center
 *  - 'radial' : quadratic curve along the radial direction, anchored on the
 *               edge of each rect facing its peer
 */
export class ConnectionManager {
    constructor(svg) {
        this.svg = svg;
        this.connections = [];
        this.layer = svg.append("g").attr("class", "connections-layer");
    }

    /**
     * @param fromNode VisualNode
     * @param toNode   VisualNode
     * @param fromSlot int|null — which branch slot routed the connection
     * @param mode     'tree' (default) or 'radial'
     * @param polar    optional { from: {x,y,r,angle}, to: {x,y,r,angle} } — required for radial
     */
    addConnection(fromNode, toNode, fromSlot = null, mode = 'tree', polar = null) {
        const path = this.layer.append("path")
            .attr("fill", "none")
            .attr("stroke", CONFIG.connection.color)
            .attr("stroke-width", CONFIG.connection.width)
            .attr("stroke-linecap", "round")
            .attr("opacity", 0.85);

        let label = null;
        if (fromSlot !== null && fromSlot !== undefined) {
            label = this.layer.append("text")
                .attr("class", "detail edge-label")
                .attr("font-family", "monospace")
                .attr("font-size", "11px")
                .attr("font-weight", 700)
                .attr("fill", CONFIG.connection.activeColor)
                .attr("text-anchor", "middle")
                .text(fromSlot.toString(16));
        }

        const conn = { path, label, fromNode, toNode, fromSlot, mode, polar };
        this.connections.push(conn);
        this.updateConnection(conn);
        return conn;
    }

    updateConnection(conn) {
        if (conn.mode === 'radial' && conn.polar) {
            this._updateRadial(conn);
        } else {
            this._updateTree(conn);
        }
    }

    _updateTree(conn) {
        const start = conn.fromNode.getOutputPoint(conn.fromSlot);
        const end = conn.toNode.getInputPoint();
        const dy = end.y - start.y;
        const c1y = start.y + dy * 0.5;
        const c2y = start.y + dy * 0.5;
        conn.path.attr("d", `M ${start.x},${start.y} C ${start.x},${c1y} ${end.x},${c2y} ${end.x},${end.y}`);
        if (conn.label) conn.label.attr("x", start.x).attr("y", start.y + 14);
    }

    _updateRadial(conn) {
        // Read current centers from the visuals so dragged nodes carry their
        // edges. The originally-baked polar (r, angle) is only used as a hint
        // for the control point when nothing has been dragged.
        const fromCx = conn.fromNode.x + conn.fromNode.width / 2;
        const fromCy = conn.fromNode.y + conn.fromNode.height / 2;
        const toCx = conn.toNode.x + conn.toNode.width / 2;
        const toCy = conn.toNode.y + conn.toNode.height / 2;
        const start = anchorOnRect(conn.fromNode, fromCx, fromCy, toCx, toCy);
        const end = anchorOnRect(conn.toNode, toCx, toCy, fromCx, fromCy);

        // Control point: prefer the layout-derived polar midpoint, but if a
        // node has been dragged off its ring the polar midpoint will be in the
        // wrong place — detect that and fall back to a straight midpoint.
        let cx, cy;
        if (conn.polar) {
            const polarFromCx = conn.polar.from.x;
            const polarFromCy = conn.polar.from.y;
            const polarToCx = conn.polar.to.x;
            const polarToCy = conn.polar.to.y;
            const dragged =
                Math.abs(fromCx - polarFromCx) > 1 || Math.abs(fromCy - polarFromCy) > 1 ||
                Math.abs(toCx - polarToCx) > 1 || Math.abs(toCy - polarToCy) > 1;
            if (dragged) {
                cx = (fromCx + toCx) / 2;
                cy = (fromCy + toCy) / 2;
            } else {
                const midAngle = (conn.polar.from.angle + conn.polar.to.angle) / 2;
                const midR = (conn.polar.from.r + conn.polar.to.r) / 2;
                cx = Math.cos(midAngle) * midR;
                cy = Math.sin(midAngle) * midR;
            }
        } else {
            cx = (fromCx + toCx) / 2;
            cy = (fromCy + toCy) / 2;
        }

        conn.path.attr("d", `M ${start.x},${start.y} Q ${cx},${cy} ${end.x},${end.y}`);
        if (conn.label) conn.label.attr("x", (start.x + cx) / 2).attr("y", (start.y + cy) / 2);
    }

    updateAll() {
        this.connections.forEach(c => this.updateConnection(c));
    }

    clear() {
        this.layer.selectAll("*").remove();
        this.connections = [];
    }
}

/**
 * Project the ray (cx,cy) → (tx,ty) onto the axis-aligned rect of `visual`
 * (centered at cx,cy). Returns the intersection with the edge facing the target.
 */
function anchorOnRect(visual, cx, cy, tx, ty) {
    const halfW = visual.width / 2;
    const halfH = visual.height / 2;
    const dx = tx - cx, dy = ty - cy;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 && ady === 0) return { x: cx, y: cy };
    if (adx * halfH > ady * halfW) {
        return { x: cx + Math.sign(dx) * halfW, y: cy + dy * (halfW / adx) };
    }
    return { x: cx + dx * (halfH / ady), y: cy + Math.sign(dy) * halfH };
}
