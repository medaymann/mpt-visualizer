/**
 * In-memory MPT — TEST INFRASTRUCTURE ONLY.
 *
 * The runtime UI builds tries via the Rust backend (POST /api/trie/build).
 * This file exists so the layout and stats unit tests can construct MPT
 * shapes without booting the backend.
 *
 * Time complexity: O(d) per insertion, where d is key depth.
 */

import { LeafNode, ExtensionNode, BranchNode } from './nodes.js';
import { Utils } from './utils.js';

export class MPT {
    constructor() {
        this.root = null;
    }

    /**
     * Insert a key-value pair into the trie
     * @param {string} key - Hex string key
     * @param {string} value - Value to store
     */
    insert(key, value) {
        if (!Utils.isValidHex(key)) {
            throw new Error(`Invalid hex key: ${key}`);
        }
        
        const nibbles = Utils.hexToNibbles(key);
        this.root = this._insertRecursive(this.root, nibbles, value, 0);
    }

    /**
     * Bulk insert from dictionary
     * @param {Object} dict - Dictionary of key-value pairs {key: value}
     * @example insertBulk({"1234": "A", "5678": "B"})
     */
    insertBulk(dict) {
        for (const [key, value] of Object.entries(dict)) {
            this.insert(key, value);
        }
    }

    /**
     * Recursively insert into trie
     * @private
     */
    _insertRecursive(node, key, value, depth) {
        // Empty node - create leaf
        if (node === null) {
            return new LeafNode(key.slice(depth), value);
        }

        // Route to appropriate insertion handler
        if (node.type === 'leaf') {
            return this._insertIntoLeaf(node, key, value, depth);
        } else if (node.type === 'extension') {
            return this._insertIntoExtension(node, key, value, depth);
        } else {
            return this._insertIntoBranch(node, key, value, depth);
        }
    }

    /**
     * Insert into a leaf node
     * @private
     */
    _insertIntoLeaf(leaf, key, value, depth) {
        const remaining = key.slice(depth);
        const existing = leaf.restOfKey;

        // Same key - update value
        if (Utils.arraysEqual(remaining, existing)) {
            return new LeafNode(existing, value);
        }

        // Different keys - need to split
        const commonLen = Utils.commonPrefixLength(existing, remaining);
        const branch = new BranchNode();

        // Insert existing leaf into branch
        if (commonLen < existing.length) {
            const oldNibble = existing[commonLen];
            const oldRest = existing.slice(commonLen + 1);
            branch.children[oldNibble] = new LeafNode(oldRest, leaf.value);
        } else {
            branch.value = leaf.value;
        }

        // Insert new value into branch
        if (commonLen < remaining.length) {
            const newNibble = remaining[commonLen];
            const newRest = remaining.slice(commonLen + 1);
            branch.children[newNibble] = new LeafNode(newRest, value);
        } else {
            branch.value = value;
        }

        // Wrap in extension if there's a common prefix
        if (commonLen > 0) {
            return new ExtensionNode(existing.slice(0, commonLen), branch);
        }

        return branch;
    }

    /**
     * Insert into an extension node
     * @private
     */
    _insertIntoExtension(ext, key, value, depth) {
        const remaining = key.slice(depth);
        const commonLen = Utils.commonPrefixLength(ext.keySegment, remaining);

        // Key matches extension completely - recurse into child
        if (commonLen === ext.keySegment.length) {
            const newChild = this._insertRecursive(ext.child, key, value, depth + commonLen);
            return new ExtensionNode(ext.keySegment, newChild);
        }

        // Key diverges in middle of extension - split it
        const branch = new BranchNode();
        
        // Old extension path
        const oldNibble = ext.keySegment[commonLen];
        const oldRest = ext.keySegment.slice(commonLen + 1);

        if (oldRest.length > 0) {
            branch.children[oldNibble] = new ExtensionNode(oldRest, ext.child);
        } else {
            branch.children[oldNibble] = ext.child;
        }

        // New insertion path
        if (commonLen < remaining.length) {
            const newNibble = remaining[commonLen];
            const newRest = remaining.slice(commonLen + 1);
            branch.children[newNibble] = new LeafNode(newRest, value);
        } else {
            branch.value = value;
        }

        // Wrap in extension if there's a common prefix
        if (commonLen > 0) {
            return new ExtensionNode(ext.keySegment.slice(0, commonLen), branch);
        }

        return branch;
    }

    /**
     * Insert into a branch node
     * @private
     */
    _insertIntoBranch(branch, key, value, depth) {
        // Key ends at this branch
        if (depth >= key.length) {
            const newBranch = new BranchNode();
            newBranch.children = [...branch.children];
            newBranch.value = value;
            return newBranch;
        }

        // Recurse into appropriate child
        const nibble = key[depth];
        const newBranch = new BranchNode();
        newBranch.children = [...branch.children];
        newBranch.children[nibble] = this._insertRecursive(
            branch.children[nibble], 
            key, 
            value, 
            depth + 1
        );
        newBranch.value = branch.value;
        return newBranch;
    }

    /**
     * Clear the trie
     */
    clear() {
        this.root = null;
    }

    /**
     * Get the root node
     * @returns {LeafNode|ExtensionNode|BranchNode|null}
     */
    getRoot() {
        return this.root;
    }

    /**
     * Check if trie is empty
     * @returns {boolean}
     */
    isEmpty() {
        return this.root === null;
    }

    /**
     * Converts the Trie to a Canonical JSON format for testing
     */
    toJSON() {
        return this._nodeToJSON(this.root);
    }

    _nodeToJSON(node) {
        if (!node) return null;

        const getPath = (p) => Array.isArray(p) ? p : Array.from(p);

        if (node.type === 'leaf') {
            return {
                type: "leaf",
                path: getPath(node.restOfKey),
                value: node.value
            };
        } 
        
        else if (node.type === 'extension') {
            return {
                type: "extension",
                path: getPath(node.keySegment),
                child: this._nodeToJSON(node.child)
            };
        } 
        
        else {
            const children = {};
            for (let i = 0; i < 16; i++) {
                if (node.children[i]) {
                    children[i.toString()] = this._nodeToJSON(node.children[i]);
                }
            }

            return {
                type: "branch",
                children: children,
                value: node.value || null
            };
        }
    }
}