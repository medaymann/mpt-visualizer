import { CONFIG } from './config.js';

/**
 * RadialLayout
 *
 * Concentric-ring layout for wide, shallow tries:
 *   - Root sits at the origin (0, 0).
 *   - Each subsequent depth becomes a ring at radius `ringGap * level`.
 *   - Each subtree gets an angular wedge proportional to its leaf count.
 *   - A node is centered on its wedge midpoint at its ring's radius.
 *
 * Reports rectangular positions (top-left of an axis-aligned card) so the
 * existing visual classes render unchanged. The Renderer separately reads
 * the polar metadata to anchor edges along the correct radial direction.
 */
export class RadialLayout {
    constructor() {
        // Tuned for MPT shape: branches at ~520px wide, leaves at ~280px wide.
        // Use a generous radial step so cards on adjacent rings don't crowd.
        this.ringGap = 360;
        // Minimum angular slot per leaf (radians). Smaller = denser packing.
        this.minLeafAngle = (2 * Math.PI) / 80;
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
        this._countLeaves(root);
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

    _countLeaves(treeNode) {
        if (treeNode.children.length === 0) {
            treeNode.leafCount = 1;
            return 1;
        }
        let n = 0;
        for (const c of treeNode.children) n += this._countLeaves(c);
        treeNode.leafCount = n;
        return n;
    }

    /**
     * Returns:
     *   positions: Map<mptNode, { x, y, width, polar: { r, angle } }>
     *   bbox:      { minX, minY, maxX, maxY }
     */
    calculateLayout(tree) {
        const positions = new Map();

        // Total angular budget. For large leaf counts, expand to a full circle;
        // for tiny tries, use a narrower fan so the layout doesn't look silly.
        const baseAngle = Math.min(2 * Math.PI, Math.max(this.minLeafAngle * tree.leafCount, Math.PI));

        // Place root at origin (no polar position).
        const rootW = this.nodeWidth(tree.node);
        const rootH = this.nodeHeight(tree.node);
        positions.set(tree.node, {
            x: -rootW / 2,
            y: -rootH / 2,
            width: rootW,
            height: rootH,
            polar: { r: 0, angle: -Math.PI / 2 } // pointing "up" (toward children at top)
        });

        // Root's children fan around `startAngle` (top of the diagram by convention).
        // We aim from `-PI/2 - baseAngle/2` to `-PI/2 + baseAngle/2`.
        const start = -Math.PI / 2 - baseAngle / 2;
        this._place(tree, positions, start, baseAngle, 1);

        // Bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        positions.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + p.width);
            maxY = Math.max(maxY, p.y + p.height);
        });

        return { positions, bbox: { minX, minY, maxX, maxY: maxY } };
    }

    /**
     * Distribute `treeNode.children` across the wedge [startAngle, startAngle+span]
     * at radius `level * ringGap`.
     */
    _place(treeNode, positions, startAngle, span, level) {
        if (treeNode.children.length === 0) return;
        const r = level * this.ringGap;
        const totalLeaves = treeNode.children.reduce((s, c) => s + c.leafCount, 0);
        let cursor = startAngle;

        for (const child of treeNode.children) {
            const childSpan = span * (child.leafCount / totalLeaves);
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
            this._place(child, positions, cursor, childSpan, level + 1);
            cursor += childSpan;
        }
    }
}
