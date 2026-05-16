import { CONFIG } from './config.js';

/**
 * RadialLayout
 *
 * Concentric-ring layout that adapts to actual fan-out instead of just to
 * leaf count. The key trick is that a node placed at radius r with width w
 * occupies an angular arc of (w + gap) / r — so densely-populated inner
 * rings need a wider ring spacing than sparse outer ones.
 *
 * Algorithm:
 *   1. Recursively compute each subtree's *minimum angular need* — the
 *      smallest wedge it can fit into without overlapping nodes, given a
 *      candidate ringGap.
 *   2. If the root's children together need more than ~2π, scale ringGap up
 *      proportionally. Angular need scales linearly with 1/r, so doubling
 *      ringGap halves the total need.
 *   3. Place each subtree at the centre of its allocated wedge.
 */
export class RadialLayout {
    constructor() {
        // Initial ring spacing; the algorithm will grow this if any ring needs
        // more space to fit its fan-out without overlap.
        this.baseRingGap = 360;
        // Minimum tangential gap between sibling nodes (px).
        this.tangentialGap = 30;
        // Fraction of 2π we're willing to use (leave a sliver so the diagram
        // doesn't quite close on itself; reads better visually).
        this.maxAngularBudget = 2 * Math.PI * 0.95;
    }

    nodeWidth(mptNode) {
        if (!mptNode) return 0;
        if (mptNode.type === 'branch') return CONFIG.branch.width;
        if (mptNode.type === 'extension') return CONFIG.extension.width;
        return CONFIG.leaf.width;
    }
    nodeHeight(mptNode) {
        if (!mptNode) return 0;
        if (mptNode.type === 'branch') return CONFIG.branch.height;
        if (mptNode.type === 'extension') return CONFIG.extension.height;
        return CONFIG.leaf.height;
    }

    buildTreeStructure(mptRoot) {
        const root = { node: mptRoot, children: [], level: 0, parentSlot: null };
        this._traverse(mptRoot, root, 0);
        return root;
    }

    _traverse(mptNode, treeNode, level) {
        if (!mptNode) return;
        if (mptNode.type === 'branch') {
            mptNode.children.forEach((child, index) => {
                if (child) {
                    const tn = { node: child, children: [], level: level + 1, parentSlot: index };
                    treeNode.children.push(tn);
                    this._traverse(child, tn, level + 1);
                }
            });
        } else if (mptNode.type === 'extension') {
            if (mptNode.child) {
                const tn = { node: mptNode.child, children: [], level: level + 1, parentSlot: null };
                treeNode.children.push(tn);
                this._traverse(mptNode.child, tn, level + 1);
            }
        }
    }

    /**
     * Returns:
     *   positions: Map<mptNode, { x, y, width, height, polar: { r, angle } }>
     *   bbox:      { minX, minY, maxX, maxY }
     */
    calculateLayout(tree) {
        // First, decide ringGap. Try the base value, then scale up if the
        // root's children together demand more angle than we have.
        let ringGap = this.baseRingGap;
        const need = this._subtreeNeed(tree, ringGap);
        if (need > this.maxAngularBudget) {
            ringGap *= need / this.maxAngularBudget;
        }

        const positions = new Map();

        // Place root at origin.
        const rootW = this.nodeWidth(tree.node);
        const rootH = this.nodeHeight(tree.node);
        positions.set(tree.node, {
            x: -rootW / 2,
            y: -rootH / 2,
            width: rootW,
            height: rootH,
            polar: { r: 0, angle: -Math.PI / 2 }
        });

        // The root's children fan around the top of the diagram.
        // Use as much of the angular budget as the subtree actually needs;
        // for tiny tries this naturally produces a tighter fan.
        const totalNeed = tree.children.reduce(
            (s, c) => s + this._subtreeNeed(c, ringGap), 0
        );
        const span = Math.min(totalNeed, this.maxAngularBudget);
        const start = -Math.PI / 2 - span / 2;

        this._place(tree, positions, start, span, 1, ringGap);

        // Bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        positions.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + p.width);
            maxY = Math.max(maxY, p.y + p.height);
        });

        return { positions, bbox: { minX, minY, maxX, maxY } };
    }

    /**
     * Minimum angular wedge this subtree needs in order to lay out without
     * any of its descendants overlapping. Computed for the *node itself* on
     * a ring of radius `r` and recursively for its children at the next ring.
     */
    _subtreeNeed(treeNode, ringGap) {
        // For the root (level 0, no radius), we still want a sensible answer
        // for sizing children. The root itself doesn't need angular space —
        // it sits at the origin.
        const myR = treeNode.level === 0 ? 0 : treeNode.level * ringGap;
        const myAngle = myR === 0
            ? 0
            : (this.nodeWidth(treeNode.node) + this.tangentialGap) / myR;

        if (treeNode.children.length === 0) {
            return myAngle;
        }
        let childrenAngle = 0;
        for (const c of treeNode.children) {
            childrenAngle += this._subtreeNeed(c, ringGap);
        }
        return Math.max(myAngle, childrenAngle);
    }

    /**
     * Distribute `treeNode.children` across the wedge [startAngle, startAngle+span]
     * at radius `level * ringGap`, proportionally to each child's angular need.
     */
    _place(treeNode, positions, startAngle, span, level, ringGap) {
        if (treeNode.children.length === 0) return;
        const r = level * ringGap;

        const needs = treeNode.children.map(c => this._subtreeNeed(c, ringGap));
        const totalNeed = needs.reduce((s, n) => s + n, 0);
        // Distribute the parent's allocated span proportionally to each
        // child's minimum need. If `totalNeed > span` (can happen at deeply
        // crowded inner levels even after scaling — rare), we just use the
        // raw shares and let the layout overflow gracefully.
        const scale = totalNeed > 0 ? span / totalNeed : 0;

        let cursor = startAngle;
        for (let i = 0; i < treeNode.children.length; i++) {
            const child = treeNode.children[i];
            const childSpan = needs[i] * scale;
            const angle = cursor + childSpan / 2;
            const w = this.nodeWidth(child.node);
            const h = this.nodeHeight(child.node);
            const cx = Math.cos(angle) * r;
            const cy = Math.sin(angle) * r;
            positions.set(child.node, {
                x: cx - w / 2,
                y: cy - h / 2,
                width: w,
                height: h,
                polar: { r, angle }
            });
            this._place(child, positions, cursor, childSpan, level + 1, ringGap);
            cursor += childSpan;
        }
    }
}
