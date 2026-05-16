/**
 * Counts node types in an MPT subtree.
 * @param {object|null} root - MPT root node
 * @returns {{ leaves: number, branches: number, extensions: number, total: number }}
 */
export function countNodes(root) {
    let leaves = 0, branches = 0, extensions = 0;
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf') { leaves++; return; }
        if (n.type === 'extension') { extensions++; walk(n.child); return; }
        branches++;
        n.children.forEach(c => walk(c));
    };
    walk(root);
    return { leaves, branches, extensions, total: leaves + branches + extensions };
}
