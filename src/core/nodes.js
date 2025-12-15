/**
 * MPT Node Data Structures
 * 
 * Defines the three types of nodes in a Merkle Patricia Trie:
 * - LeafNode: Terminal node containing key suffix and value
 * - ExtensionNode: Intermediate node compressing common key prefixes
 * - BranchNode: Node with up to 16 children (one per hex nibble)
 */

export class LeafNode {
    /**
     * Create a leaf node
     * @param {number[]} restOfKey - Remaining nibbles of the key
     * @param {string} value - The value stored at this key
     */
    constructor(restOfKey, value) {
        this.type = 'leaf';
        this.restOfKey = restOfKey;
        this.value = value;
    }
}

export class ExtensionNode {
    /**
     * Create an extension node
     * @param {number[]} keySegment - Common prefix nibbles
     * @param {LeafNode|ExtensionNode|BranchNode} child - Child node
     */
    constructor(keySegment, child) {
        this.type = 'extension';
        this.keySegment = keySegment;
        this.child = child;
    }
}

export class BranchNode {
    /**
     * Create a branch node with 16 potential children
     */
    constructor() {
        this.type = 'branch';
        this.children = new Array(16).fill(null);
        this.value = null; // Value if a key terminates at this node
    }
}