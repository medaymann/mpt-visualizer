import { VisualNode } from './VisualNode.js';
import { CONFIG } from './config.js';

export class ExtensionVisual extends VisualNode {
    constructor(id, mptNode) {
        super(id, 'extension', mptNode);
        this.config = CONFIG.extension;
        this.width = this.config.width;
        this.height = this.config.height;
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

        return g;
    }
}
