import { CONFIG } from './config.js';

/**
 * LayoutEngine
 *
 * Two-pass tidy tree layout:
 *  1. buildTreeStructure() — walks the MPT producing { node, children, parentSlot, level }
 *  2. calculateLayout()    — post-order pass computes each subtree's width, then a
 *                            pre-order pass assigns absolute x positions so subtrees
 *                            never overlap regardless of fan-out (branches up to 16).
 */
export class LayoutEngine {
    constructor() {
        this.levelHeight = CONFIG.layout.levelHeight;
        this.siblingGap = CONFIG.layout.siblingGap;
    }

    nodeWidth(mptNode) {
        if (!mptNode) return 0;
        if (mptNode.type === 'branch') return CONFIG.branch.width;
        if (mptNode.type === 'extension') return CONFIG.extension.width;
        return CONFIG.leaf.width;
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
     * Returns Map<mptNode, { x, y, width }> where (x,y) is the top-left of the rendered node.
     */
    calculateLayout(tree) {
        this._computeSubtreeWidth(tree);
        const positions = new Map();
        this._assignPositions(tree, 0, 0, positions);
        // Center the whole layout horizontally on 0 (caller can translate).
        // Compute bbox.
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        positions.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x + p.width);
            maxY = Math.max(maxY, p.y);
        });
        return { positions, bbox: { minX, maxX, maxY: maxY + this.levelHeight } };
    }

    _computeSubtreeWidth(treeNode) {
        const myWidth = this.nodeWidth(treeNode.node);
        if (treeNode.children.length === 0) {
            treeNode.subtreeWidth = myWidth;
            return;
        }
        treeNode.children.forEach(c => this._computeSubtreeWidth(c));
        const childrenWidth = treeNode.children.reduce((acc, c, i) => {
            return acc + c.subtreeWidth + (i > 0 ? this.siblingGap : 0);
        }, 0);
        treeNode.subtreeWidth = Math.max(myWidth, childrenWidth);
    }

    _assignPositions(treeNode, leftX, y, positions) {
        const myWidth = this.nodeWidth(treeNode.node);
        const subtreeLeft = leftX;
        const subtreeCenter = subtreeLeft + treeNode.subtreeWidth / 2;
        const myX = subtreeCenter - myWidth / 2;
        positions.set(treeNode.node, { x: myX, y, width: myWidth });

        if (treeNode.children.length === 0) return;

        // Place children left-to-right inside the subtree band.
        const totalChildrenWidth = treeNode.children.reduce((acc, c, i) => {
            return acc + c.subtreeWidth + (i > 0 ? this.siblingGap : 0);
        }, 0);
        let cursor = subtreeCenter - totalChildrenWidth / 2;
        const childY = y + this.levelHeight;
        treeNode.children.forEach(c => {
            this._assignPositions(c, cursor, childY, positions);
            cursor += c.subtreeWidth + this.siblingGap;
        });
    }
}
