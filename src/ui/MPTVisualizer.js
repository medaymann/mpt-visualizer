import { Renderer } from '../visualization/Renderer.js';
import { EthereumService } from './EthereumService.js';
import { countNodes } from './stats.js';

/**
 * MPTVisualizer
 *
 * Holds the current trie state and a renderer. All trie construction —
 * including custom mode — happens on the Rust backend so the displayed
 * structure is always backed by canonical RLP + keccak. The frontend just
 * tracks the entries dictionary and replays it through `buildTrie` on
 * every change.
 */
export class MPTVisualizer {
    constructor(containerSel, service = new EthereumService()) {
        this.service = service;
        this.renderer = new Renderer(containerSel);
        this.root = null;            // backend-derived MPT view
        this.computedRoot = '';
        this.entries = {};           // hex_key -> value (custom mode only)
        this._rebuildPending = false;
        this._onChange = null;
        this.render();
    }

    /** Notify-on-change hook used by the UI to refresh stats / root display. */
    onChange(fn) { this._onChange = fn; }

    /** Called with entryKey (hex string) when a leaf is highlighted, null when cleared. */
    onLeafHighlight(fn) { this.renderer.onLeafHighlight = fn; }

    // --- Custom mode ---------------------------------------------------------

    async insert(key, value) {
        if (!/^[0-9a-fA-F]+$/.test(key.replace(/^0x/, ''))) {
            throw new Error(`Invalid hex key: ${key}`);
        }
        this.entries[key.replace(/^0x/, '').toLowerCase()] = value;
        await this._rebuild();
    }

    async insertBulk(dict) {
        for (const [k, v] of Object.entries(dict)) {
            if (!/^[0-9a-fA-F]+$/.test(k.replace(/^0x/, ''))) {
                throw new Error(`Invalid hex key: ${k}`);
            }
            this.entries[k.replace(/^0x/, '').toLowerCase()] = v;
        }
        await this._rebuild();
    }

    async clear() {
        this.entries = {};
        this.root = null;
        this.computedRoot = '';
        this.render();
        if (this._onChange) this._onChange();
    }

    async _rebuild() {
        if (this._rebuildPending) return; // coalesce — last call wins
        this._rebuildPending = true;
        try {
            const snapshot = { ...this.entries };
            const { root, computedRoot } = await this.service.buildTrie(snapshot);
            this.root = root;
            this.computedRoot = computedRoot;
            // The backend left-pads odd-length hex keys with a leading zero
            // before building, so a leaf's reconstructed entryKey may not match
            // the key the user typed (e.g. "abcd1" -> "0abcd1"). Re-map each
            // leaf's entryKey back to the actual DB key so highlight sync works.
            this._reconcileLeafKeys(this.root, Object.keys(snapshot));
            this.render();
            if (this._onChange) this._onChange();
        } finally {
            this._rebuildPending = false;
        }
    }

    _reconcileLeafKeys(node, dbKeys) {
        if (!node) return;
        if (node.type === 'leaf') {
            if (!dbKeys.includes(node.entryKey)) {
                const stripped = node.entryKey.replace(/^0+/, '');
                const match = dbKeys.find(k => k === stripped || k.replace(/^0+/, '') === stripped);
                if (match) node.entryKey = match;
            }
            return;
        }
        if (node.type === 'extension') return this._reconcileLeafKeys(node.child, dbKeys);
        if (node.type === 'branch') node.children.forEach(c => this._reconcileLeafKeys(c, dbKeys));
    }

    // --- Ethereum / setRoot path --------------------------------------------

    /** Replace the entire trie with a precomputed root from the backend. */
    setRoot(root, computedRoot = '') {
        this.entries = {};
        this.root = root;
        this.computedRoot = computedRoot;
        this.render();
        if (this._onChange) this._onChange();
    }

    // --- View controls -------------------------------------------------------

    /** Highlight the trie path for a given entry key (hex string). */
    highlightLeafByKey(key) {
        const leaf = this._findLeaf(this.root, key);
        if (leaf) this.renderer.highlightPath(leaf);
        else this.renderer.clearHighlight();
    }

    _findLeaf(node, key) {
        if (!node) return null;
        if (node.type === 'leaf') return node.entryKey === key ? node : null;
        if (node.type === 'extension') return this._findLeaf(node.child, key);
        if (node.type === 'branch') {
            for (const c of node.children) {
                const found = this._findLeaf(c, key);
                if (found) return found;
            }
        }
        return null;
    }

    resetView() { this.renderer.resetView(); }
    setLayoutMode(mode) { this.renderer.setLayoutMode(mode); }
    setShowHashes(on) { this.renderer.setShowHashes(on); }
    onHashClick(fn) { this.renderer.setOnHashClick(fn); }
    handleResize() { this.renderer.handleResize(); }
    render() { this.renderer.render(this.root); }

    getStats() { return countNodes(this.root); }
    getComputedRoot() { return this.computedRoot; }
}
