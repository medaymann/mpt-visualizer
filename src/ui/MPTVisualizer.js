import { Renderer } from '../visualization/Renderer.js';
import { MPT } from '../core/mpt.js';
import { countNodes } from '../core/stats.js';

export class MPTVisualizer {
    constructor(containerSel) {
        this.mpt = new MPT();
        this.renderer = new Renderer(containerSel);
        this.render();
    }

    insert(key, value) {
        this.mpt.insert(key, value);
        this.render();
    }

    insertBulk(dict) {
        this.mpt.insertBulk(dict);
        this.render();
    }

    clear() {
        this.mpt.clear();
        this.render();
    }

    /** Replace the entire trie with a precomputed root (e.g., from the backend). */
    setRoot(root) {
        this.mpt.root = root;
        this.render();
    }

    resetView() {
        this.renderer.resetView();
    }

    render() {
        this.renderer.render(this.mpt.getRoot());
    }

    getStats() {
        return countNodes(this.mpt.getRoot());
    }
}
