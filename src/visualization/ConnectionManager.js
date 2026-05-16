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
        const { from, to } = conn.polar;
        const start = anchorOnRect(conn.fromNode, from.x, from.y, to.x, to.y);
        const end = anchorOnRect(conn.toNode, to.x, to.y, from.x, from.y);
        const midAngle = (from.angle + to.angle) / 2;
        const midR = (from.r + to.r) / 2;
        const cx = Math.cos(midAngle) * midR;
        const cy = Math.sin(midAngle) * midR;
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
