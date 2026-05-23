import { CONFIG } from './config.js';

/**
 * Shorten a keccak hash for display. Always appends an ellipsis so every hash
 * looks the same and signals "click for full value".
 */
export function shortHash(hash, n = 12) {
    return '0x' + hash.slice(0, n) + '…';
}

/**
 * Make an SVG <text> selection behave as a clickable hash: pointer cursor,
 * native tooltip, and a click that surfaces the full hash via the shared
 * VisualNode.onHashClick callback (set by the Renderer).
 */
export function makeHashClickable(textSel, fullHash) {
    textSel
        .style('cursor', 'pointer')
        .on('click', (event) => {
            event.stopPropagation();
            if (VisualNode.onHashClick) VisualNode.onHashClick(fullHash);
        });
    textSel.append('title').text(fullHash);
}

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
        this.showHashes = false;
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

    /**
     * Draw the node's keccak hash at the top-right of the node, mirroring the
     * type label on the top-left. Hidden by default; revealed when '.world'
     * carries the 'show-hashes' class. This is the value a parent stores to
     * reference this node by hash.
     *
     * @param {number} y baseline for the hash text (defaults to the header row).
     */
    appendHashBadge(g, y = 22) {
        const hash = this.mptNode && this.mptNode.hash;
        if (!hash) return;

        // A node's OWN hash gets a bordered orange pill so it reads as a hash
        // but is visually distinct from the plain orange reference-pointer text.
        const badge = g.append("g").attr("class", "hash-badge");
        const label = shortHash(hash);
        const pillW = label.length * 6.2 + 14;
        const pillH = 17;
        const right = this.width - 10;
        const left = right - pillW;
        const top = y - 12;

        badge.append("rect")
            .attr("x", left).attr("y", top)
            .attr("width", pillW).attr("height", pillH)
            .attr("rx", pillH / 2)
            .attr("fill", CONFIG.connection.idHashFill)
            .attr("stroke", CONFIG.connection.hashColor)
            .attr("stroke-width", 1);

        const text = badge.append("text")
            .attr("x", left + pillW / 2)
            .attr("y", top + 12)
            .attr("text-anchor", "middle")
            .attr("font-family", "monospace")
            .attr("font-size", "10px")
            .attr("font-weight", 600)
            .attr("fill", CONFIG.connection.hashColor)
            .text(label);
        makeHashClickable(text, hash);
        makeHashClickable(badge.select("rect"), hash);
    }

    render(svg) {}
}
