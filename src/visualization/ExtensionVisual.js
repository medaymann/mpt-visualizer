import { VisualNode, shortHash, makeHashClickable } from './VisualNode.js';
import { CONFIG } from './config.js';

export class ExtensionVisual extends VisualNode {
    constructor(id, mptNode) {
        super(id, 'extension', mptNode);
        this.config = CONFIG.extension;
        this.width = this.config.width;
        this.height = this.config.height;
    }

    // When hashes are shown, the child pointer leaves from the right side at the
    // "value" row (mirroring where a leaf's value sits) — the extension stores
    // its child's hash there. Otherwise it leaves from the bottom-center.
    getOutputPoint(slot = null) {
        if (this.showHashes) {
            return { x: this.x + this.width, y: this.y + this.height * 0.6 };
        }
        return { x: this.x + this.width / 2, y: this.y + this.height };
    }

    render(svg) {
        const g = svg.append("g")
            .attr("transform", `translate(${this.x}, ${this.y})`)
            .attr("data-id", this.id)
            .attr("class", "mpt-node mpt-extension");
        this.group = g;

        g.append("rect")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("rx", 8)
            .attr("fill", this.config.color)
            .attr("stroke", this.config.accent)
            .attr("stroke-width", 1.5);

        g.append("text")
            .attr("x", 12).attr("y", 22)
            .attr("font-size", "12px")
            .attr("font-weight", 700)
            .attr("letter-spacing", "1.5px")
            .attr("fill", this.config.accent)
            .text("EXTENSION");

        const detail = g.append("g").attr("class", "detail");
        detail.append("text")
            .attr("x", 12).attr("y", 44)
            .attr("font-size", "11px")
            .attr("fill", this.config.textColor)
            .attr("opacity", 0.7)
            .text("shared nibbles");

        const seg = (this.mptNode.keySegment || []).map(n => n.toString(16)).join('');
        const display = seg.length > 24 ? seg.slice(0, 22) + '…' : seg;
        detail.append("text")
            .attr("x", 12).attr("y", 72)
            .attr("font-family", "monospace")
            .attr("font-size", "18px")
            .attr("font-weight", 600)
            .attr("fill", this.config.textColor)
            .text(display || "(empty)");

        detail.append("text")
            .attr("x", this.width - 12).attr("y", 72)
            .attr("text-anchor", "end")
            .attr("font-size", "10px")
            .attr("fill", this.config.textColor)
            .attr("opacity", 0.5)
            .text(`${seg.length} nibble${seg.length === 1 ? '' : 's'}`);

        // "value" anchor shown only with hashes: marks where the child pointer
        // (the child's hash) leaves the node — mirroring a leaf's value slot.
        const childHash = this.mptNode.child && this.mptNode.child.hash;
        if (childHash) {
            const anchor = g.append("g").attr("class", "hash-badge");
            anchor.append("text")
                .attr("x", this.width - 12).attr("y", this.height * 0.6 - 8)
                .attr("text-anchor", "end")
                .attr("font-size", "9px")
                .attr("fill", this.config.textColor)
                .attr("opacity", 0.6)
                .text("value (child hash)");
            const childHashText = anchor.append("text")
                .attr("x", this.width - 12).attr("y", this.height * 0.6 + 6)
                .attr("text-anchor", "end")
                .attr("font-family", "monospace")
                .attr("font-size", "11px")
                .attr("font-weight", 600)
                .attr("fill", CONFIG.connection.hashColor)
                .text(shortHash(childHash));
            makeHashClickable(childHashText, childHash);
        }

        this.appendHashBadge(g);
        return g;
    }
}
