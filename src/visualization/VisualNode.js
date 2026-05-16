import { CONFIG } from './config.js';

export class VisualNode {
    constructor(id, type, mptNode) {
        this.id = id;
        this.type = type;
        this.mptNode = mptNode;
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.group = null;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        if (this.group) {
            this.group.attr("transform", `translate(${x}, ${y})`);
        }
    }

    // Anchor used as the *incoming* edge end (top-center).
    getInputPoint() {
        return { x: this.x + this.width / 2, y: this.y };
    }

    // Anchor used as the *outgoing* edge start. Override per-type.
    getOutputPoint(slot = null) {
        return { x: this.x + this.width / 2, y: this.y + this.height };
    }

    render(svg) {}
}
