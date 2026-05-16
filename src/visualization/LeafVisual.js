import { VisualNode } from './VisualNode.js';
import { CONFIG } from './config.js';

export class LeafVisual extends VisualNode {
    constructor(id, mptNode) {
        super(id, 'leaf', mptNode);
        this.config = CONFIG.leaf;
        this.width = this.config.width;
        this.height = this.config.height;
    }

    render(svg) {
        const g = svg.append("g")
            .attr("transform", `translate(${this.x}, ${this.y})`)
            .attr("data-id", this.id)
            .attr("class", "mpt-node mpt-leaf");
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
            .text("LEAF");

        const keyHex = (this.mptNode.restOfKey || []).map(n => n.toString(16)).join('');
        const keyDisplay = keyHex.length > 28 ? keyHex.slice(0, 26) + '…' : keyHex;
        const valueStr = String(this.mptNode.value ?? "");
        const valDisplay = valueStr.length > 22 ? valueStr.slice(0, 20) + '…' : valueStr;

        const detail = g.append("g").attr("class", "detail");
        detail.append("text")
            .attr("x", 12).attr("y", 44)
            .attr("font-size", "10px")
            .attr("opacity", 0.6)
            .attr("fill", this.config.textColor)
            .text("key-end");
        detail.append("text")
            .attr("x", 12).attr("y", 64)
            .attr("font-family", "monospace")
            .attr("font-size", "14px")
            .attr("font-weight", 600)
            .attr("fill", this.config.textColor)
            .text(keyDisplay || "(empty)");

        detail.append("text")
            .attr("x", this.width - 12).attr("y", 44)
            .attr("text-anchor", "end")
            .attr("font-size", "10px")
            .attr("opacity", 0.6)
            .attr("fill", this.config.textColor)
            .text("value");

        detail.append("text")
            .attr("x", this.width - 12).attr("y", 64)
            .attr("text-anchor", "end")
            .attr("font-family", "monospace")
            .attr("font-size", "14px")
            .attr("font-weight", 600)
            .attr("fill", CONFIG.branch.valueColor)
            .text(valDisplay);

        // Tooltip on hover with full value if truncated
        if (valueStr.length > 22 || keyHex.length > 28) {
            g.append("title").text(`key-end: ${keyHex}\nvalue: ${valueStr}`);
        }

        return g;
    }
}
