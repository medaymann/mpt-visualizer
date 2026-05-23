import { VisualNode, makeHashClickable } from './VisualNode.js';
import { CONFIG } from './config.js';

const HEX = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];

export class BranchVisual extends VisualNode {
    constructor(id, mptNode) {
        super(id, 'branch', mptNode);
        this.config = CONFIG.branch;
        this.hasValue = mptNode.value !== null && mptNode.value !== undefined;
        // 16 child slots are evenly sized off the base width; a value box (when
        // present) is appended at the end as a wider 17th cell, extending width.
        this.slotWidth = this.config.width / this.config.slotCount;
        this.valueBoxWidth = this.hasValue ? 120 : 0;
        this.width = this.config.width + this.valueBoxWidth;
        this.height = this.config.height;
        // Leave a strip above the boxes for the small index labels.
        this.slotsRowY = 62;
        this.indexRowY = 50;
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


        // Slot row separator
        g.append("line")
            .attr("x1", 0).attr("y1", this.slotsRowY - 6)
            .attr("x2", this.width).attr("y2", this.slotsRowY - 6)
            .attr("stroke", this.config.accent)
            .attr("stroke-opacity", 0.3);

        // High-detail: small index labels ABOVE each box, box content below.
        const detail = g.append("g").attr("class", "detail slots");
        for (let i = 0; i < this.config.slotCount; i++) {
            const child = this.mptNode.children[i];
            const isActive = child !== null && child !== undefined;
            const sx = i * this.slotWidth;

            // Index label sitting above every box — small, so it reads as a
            // slot index (0-f) rather than box content. All 16 shown.
            detail.append("text")
                .attr("x", sx + this.slotWidth / 2)
                .attr("y", this.indexRowY)
                .attr("text-anchor", "middle")
                .attr("font-family", "monospace")
                .attr("font-size", "9px")
                .attr("font-weight", 600)
                .attr("fill", this.config.accent)
                .text(HEX[i]);

            detail.append("rect")
                .attr("x", sx + 2)
                .attr("y", this.slotsRowY)
                .attr("width", this.slotWidth - 4)
                .attr("height", this.slotsRowHeight - 8)
                .attr("rx", 4)
                .attr("fill", isActive ? this.config.slotActiveColor : this.config.slotEmptyColor)
                .attr("stroke", isActive ? this.config.accent : "transparent")
                .attr("stroke-width", 1);

            // Active slots: a tiny clickable hash preview inside the box. The
            // box holds the child's hash (the pointer), shown only with hashes.
            if (isActive && child.hash) {
                const preview = detail.append("text")
                    .attr("class", "hash-edge-label")
                    .attr("x", sx + this.slotWidth / 2)
                    .attr("y", this.slotsRowY + this.slotsRowHeight / 2 - 1)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .attr("font-family", "monospace")
                    .attr("font-size", "10px")
                    .attr("font-weight", 700)
                    .attr("fill", CONFIG.connection.hashColorDark)
                    .text(child.hash.slice(0, 4) + '…');
                makeHashClickable(preview, child.hash);
            }
        }

        // Value box: a 17th cell at the end of the slot row, styled like a
        // leaf's value (grey "value" label above, orange value below). Present
        // only when a key ends exactly at this branch.
        if (this.hasValue) {
            const vx = this.config.slotCount * this.slotWidth + 4;
            const vw = this.valueBoxWidth - 8;
            const vy = this.slotsRowY;
            const vh = this.slotsRowHeight - 8;
            detail.append("text")
                .attr("x", vx + vw / 2)
                .attr("y", this.indexRowY)
                .attr("text-anchor", "middle")
                .attr("font-size", "9px")
                .attr("font-weight", 600)
                .attr("fill", this.config.valueColor)
                .attr("opacity", 0.7)
                .text("value");
            detail.append("rect")
                .attr("x", vx).attr("y", vy)
                .attr("width", vw).attr("height", vh)
                .attr("rx", 4)
                .attr("fill", "#1a2a40")
                .attr("stroke", this.config.valueColor)
                .attr("stroke-width", 1);
            const valStr = String(this.mptNode.value);
            const valDisplay = valStr.length > 14 ? valStr.slice(0, 12) + '…' : valStr;
            const valText = detail.append("text")
                .attr("x", vx + vw / 2)
                .attr("y", vy + vh / 2 + 1)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("font-family", "monospace")
                .attr("font-size", "13px")
                .attr("font-weight", 600)
                .attr("fill", this.config.valueColor)
                .text(valDisplay);
            if (valStr.length > 14) valText.append("title").text(valStr);
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

        // Place the node's own-hash pill in the header. With a value field
        // present it would collide, so the field is narrowed above to leave the
        // top-right corner for the pill.
        this.appendHashBadge(g, 22);
        return g;
    }
}
