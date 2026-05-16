import { CONFIG } from './config.js';

/**
 * ConnectionManager
 *
 * Draws smooth cubic-bezier connectors between MPT nodes. For branch slots,
 * the start anchor sits at the bottom-center of the specific slot cell, so
 * users can visually trace which nibble routed the link.
 */
export class ConnectionManager {
    constructor(svg) {
        this.svg = svg;
        this.connections = [];
        this.layer = svg.append("g").attr("class", "connections-layer");
    }

    addConnection(fromNode, toNode, fromSlot = null) {
        const path = this.layer.append("path")
            .attr("fill", "none")
            .attr("stroke", CONFIG.connection.color)
            .attr("stroke-width", CONFIG.connection.width)
            .attr("stroke-linecap", "round")
            .attr("opacity", 0.85);

        // Slot label (the hex nibble that selected this child) — only meaningful for branches.
        let label = null;
        if (fromSlot !== null && fromSlot !== undefined) {
            label = this.layer.append("text")
                .attr("font-family", "monospace")
                .attr("font-size", "11px")
                .attr("font-weight", 700)
                .attr("fill", CONFIG.connection.activeColor)
                .attr("text-anchor", "middle")
                .text(fromSlot.toString(16));
        }

        const conn = { path, label, fromNode, toNode, fromSlot };
        this.connections.push(conn);
        this.updateConnection(conn);
        return conn;
    }

    updateConnection(conn) {
        const start = conn.fromNode.getOutputPoint(conn.fromSlot);
        const end = conn.toNode.getInputPoint();
        const dy = end.y - start.y;
        const c1y = start.y + dy * 0.5;
        const c2y = start.y + dy * 0.5;
        const d = `M ${start.x},${start.y} C ${start.x},${c1y} ${end.x},${c2y} ${end.x},${end.y}`;
        conn.path.attr("d", d);

        if (conn.label) {
            conn.label
                .attr("x", start.x)
                .attr("y", start.y + 14);
        }
    }

    updateAll() {
        this.connections.forEach(c => this.updateConnection(c));
    }

    clear() {
        this.layer.selectAll("*").remove();
        this.connections = [];
    }
}
