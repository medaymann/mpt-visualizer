import { VisualNode } from './VisualNode.js';
import { CONFIG } from './config.js';

const HEX = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];

export class BranchVisual extends VisualNode {
    constructor(id, mptNode) {
        super(id, 'branch', mptNode);
        this.config = CONFIG.branch;
        this.width = this.config.width;
        this.height = this.config.height;
        this.slotWidth = this.width / this.config.slotCount;
        this.slotsRowY = 55;
        this.slotsRowHeight = this.height - this.slotsRowY;
    }

    getOutputPoint(slot) {
        if (slot === null || slot === undefined) {
            return { x: this.x + this.width / 2, y: this.y + this.height };
        }
        return {
            x: this.x + slot * this.slotWidth + this.slotWidth / 2,
            y: this.y + this.height
        };
    }

    render(svg) {
        const g = svg.append("g")
            .attr("transform", `translate(${this.x}, ${this.y})`)
            .attr("data-id", this.id)
            .attr("class", "mpt-node mpt-branch");
        this.group = g;

        g.append("rect")
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("rx", 8)
            .attr("fill", this.config.color)
            .attr("stroke", this.config.accent)
            .attr("stroke-width", 1.5);

        // Header
        g.append("text")
            .attr("x", 12)
            .attr("y", 22)
            .attr("font-size", "12px")
            .attr("font-weight", 700)
            .attr("letter-spacing", "1.5px")
            .attr("fill", this.config.accent)
            .text("BRANCH");

        // Optional terminal value
        if (this.mptNode.value !== null && this.mptNode.value !== undefined) {
            g.append("text")
                .attr("x", this.width - 12)
                .attr("y", 22)
                .attr("text-anchor", "end")
                .attr("font-size", "11px")
                .attr("font-family", "monospace")
                .attr("fill", this.config.valueColor)
                .text(`◆ value: ${String(this.mptNode.value).slice(0, 20)}`);
        }

        // Slot row separator
        g.append("line")
            .attr("x1", 0).attr("y1", this.slotsRowY - 6)
            .attr("x2", this.width).attr("y2", this.slotsRowY - 6)
            .attr("stroke", this.config.accent)
            .attr("stroke-opacity", 0.3);

        // High-detail: individual slot rects + nibble labels.
        const detail = g.append("g").attr("class", "detail slots");
        for (let i = 0; i < this.config.slotCount; i++) {
            const isActive = this.mptNode.children[i] !== null && this.mptNode.children[i] !== undefined;
            const sx = i * this.slotWidth;
            detail.append("rect")
                .attr("x", sx + 2)
                .attr("y", this.slotsRowY)
                .attr("width", this.slotWidth - 4)
                .attr("height", this.slotsRowHeight - 8)
                .attr("rx", 4)
                .attr("fill", isActive ? this.config.slotActiveColor : this.config.slotEmptyColor)
                .attr("stroke", isActive ? this.config.accent : "transparent")
                .attr("stroke-width", 1);
            detail.append("text")
                .attr("x", sx + this.slotWidth / 2)
                .attr("y", this.slotsRowY + this.slotsRowHeight / 2 - 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("font-family", "monospace")
                .attr("font-size", "13px")
                .attr("font-weight", isActive ? 700 : 400)
                .attr("fill", isActive ? "#0f1620" : "#5a6a82")
                .text(HEX[i]);
        }

        // Low-detail fallback: one filled stripe per active slot, no text.
        const lowDetail = g.append("g").attr("class", "low-detail-only");
        for (let i = 0; i < this.config.slotCount; i++) {
            const isActive = this.mptNode.children[i] !== null && this.mptNode.children[i] !== undefined;
            if (!isActive) continue;
            const sx = i * this.slotWidth;
            lowDetail.append("rect")
                .attr("x", sx)
                .attr("y", this.slotsRowY)
                .attr("width", this.slotWidth)
                .attr("height", this.slotsRowHeight - 8)
                .attr("fill", this.config.slotActiveColor);
        }

        return g;
    }
}
