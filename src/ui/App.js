/**
 * App: orchestrates the page. Wires the two-tab UI, examples, custom-mode
 * inserts, Ethereum block loading, layout toggle, and stats. Boots one
 * MPTVisualizer + one EthereumService.
 *
 * All trie construction goes through the Rust backend so both modes display
 * a cryptographically grounded root hash.
 */

import { MPTVisualizer } from './MPTVisualizer.js';
import { EthereumService } from './EthereumService.js';
import { CUSTOM_EXAMPLES, ETH_EXAMPLES } from './examples.js';

export function boot() {
    const eth = new EthereumService();
    const viz = new MPTVisualizer('#canvas', eth);

    // --- Status toast ----------------------------------------------------
    const statusEl = document.getElementById('status');
    let statusTimer = null;
    function showStatus(msg, kind = 'info', persist = false) {
        statusEl.textContent = msg;
        statusEl.className = 'status show ' + (kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : '');
        clearTimeout(statusTimer);
        if (!persist) {
            statusTimer = setTimeout(() => statusEl.classList.remove('show'), 3500);
        }
    }
    function clearStatus() {
        clearTimeout(statusTimer);
        statusEl.classList.remove('show');
    }

    function trapError(promise) {
        return promise.catch(e => showStatus(e.message || String(e), 'error'));
    }

    // --- Tabs ------------------------------------------------------------
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const mode = t.dataset.mode;
        document.getElementById('panel-custom').hidden = mode !== 'custom';
        document.getElementById('panel-ethereum').hidden = mode !== 'ethereum';
        viz.clear();
        document.getElementById('blockMeta').style.display = 'none';
        clearStatus();
    }));

    // --- Custom mode -----------------------------------------------------
    document.getElementById('addButton').addEventListener('click', () => {
        const key = document.getElementById('keyInput').value.trim();
        const value = document.getElementById('valueInput').value.trim();
        if (!key) { showStatus('Enter a hex key', 'error'); return; }
        trapError(viz.insert(key, value || '(empty)').then(() => {
            document.getElementById('keyInput').value = '';
            document.getElementById('valueInput').value = '';
        }));
    });

    document.getElementById('clearButton').addEventListener('click', () => {
        viz.clear();
    });

    document.getElementById('bulkButton').addEventListener('click', () => {
        const text = document.getElementById('bulkInput').value.trim();
        if (!text) return;
        let dict = {};
        try {
            if (text.startsWith('{')) {
                dict = JSON.parse(text);
            } else {
                for (const line of text.split('\n')) {
                    const s = line.trim();
                    if (!s) continue;
                    const eq = s.indexOf('=');
                    if (eq < 0) throw new Error(`Line missing '=': ${s}`);
                    dict[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
                }
            }
        } catch (e) {
            showStatus('Bulk parse error: ' + e.message, 'error');
            return;
        }
        trapError(viz.insertBulk(dict).then(() => {
            showStatus(`Inserted ${Object.keys(dict).length} entries`, 'ok');
        }));
    });

    const examplesEl = document.getElementById('examples');
    CUSTOM_EXAMPLES.forEach(ex => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = ex.name;
        chip.addEventListener('click', () => {
            viz.clear();
            trapError(viz.insertBulk(ex.dict).then(() => {
                showStatus(`Loaded "${ex.name}"`, 'ok');
            }));
        });
        examplesEl.appendChild(chip);
    });

    // --- Ethereum mode ---------------------------------------------------
    const ethExamplesEl = document.getElementById('ethExamples');
    ETH_EXAMPLES.forEach(ex => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = ex.name;
        chip.addEventListener('click', () => {
            document.getElementById('blockInput').value = ex.id;
            loadBlock();
        });
        ethExamplesEl.appendChild(chip);
    });

    async function loadBlock() {
        const id = document.getElementById('blockInput').value.trim();
        if (!id) { showStatus('Enter a block id', 'error'); return; }
        const btn = document.getElementById('loadBlockButton');
        btn.disabled = true;
        showStatus('Fetching block ' + id + '...', 'info', true);
        try {
            const { root, meta, computedRoot, verified } = await eth.getBlock(id);
            viz.setRoot(root, computedRoot);
            renderBlockMeta(meta, computedRoot, verified);
            if (meta.txCount === 0) {
                showStatus(`Block #${meta.number} has 0 transactions (empty trie)`, 'info');
            } else {
                showStatus(`Loaded block #${meta.number} (${meta.txCount} txs)`, 'ok');
            }
        } catch (e) {
            showStatus('Failed: ' + e.message, 'error', true);
        } finally {
            btn.disabled = false;
        }
    }
    document.getElementById('loadBlockButton').addEventListener('click', loadBlock);
    document.getElementById('blockInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') loadBlock();
    });
    document.getElementById('clearEthButton').addEventListener('click', () => {
        viz.clear();
        document.getElementById('blockMeta').style.display = 'none';
    });

    function renderBlockMeta(m, computedRoot, verified) {
        const el = document.getElementById('blockMeta');
        const ts = new Date(m.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19);
        const badge = verified
            ? `<span style="color:var(--ok)">✓ computed root matches block.transactionsRoot</span>`
            : `<span style="color:var(--danger)">✗ root mismatch — trie may be wrong</span>`;
        el.innerHTML =
            `<div><span class="k">block</span> #${m.number}</div>` +
            `<div><span class="k">hash</span> ${m.hash}</div>` +
            `<div><span class="k">txs</span> ${m.txCount}</div>` +
            `<div><span class="k">gasUsed</span> ${m.gasUsed.toLocaleString()}</div>` +
            `<div><span class="k">time</span> ${ts} UTC</div>` +
            `<div><span class="k">tx-root</span> ${m.transactionsRoot}</div>` +
            `<div style="margin-top:6px">${badge}</div>`;
        el.style.display = 'block';
    }

    // --- Stats + root ----------------------------------------------------
    function refresh() {
        const s = viz.getStats();
        for (const id of ['statLeaves', 'statLeaves2']) document.getElementById(id).textContent = s.leaves;
        for (const id of ['statBranches', 'statBranches2']) document.getElementById(id).textContent = s.branches;
        for (const id of ['statExtensions', 'statExtensions2']) document.getElementById(id).textContent = s.extensions;
        for (const id of ['statTotal', 'statTotal2']) document.getElementById(id).textContent = s.total;

        // Custom-mode root display.
        const rootEl = document.getElementById('customRoot');
        if (rootEl) {
            const r = viz.getComputedRoot();
            if (r) {
                rootEl.innerHTML =
                    `<div><span class="k">root</span> ${r}</div>` +
                    `<div style="margin-top:4px"><span style="color:var(--ok)">✓ keccak-verified by backend</span></div>`;
                rootEl.style.display = 'block';
            } else {
                rootEl.style.display = 'none';
            }
        }
    }
    viz.onChange(refresh);

    // --- Canvas controls -------------------------------------------------
    document.getElementById('fitButton').addEventListener('click', () => viz.render());
    document.getElementById('resetButton').addEventListener('click', () => viz.resetView());

    document.getElementById('layoutToggle').addEventListener('click', e => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        document.querySelectorAll('#layoutToggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        viz.setLayoutMode(btn.dataset.mode);
    });

    // --- Boot with the first custom example so the canvas isn't empty ----
    trapError(viz.insertBulk(CUSTOM_EXAMPLES[0].dict));

    ['keyInput', 'valueInput'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('addButton').click();
        });
    });
}
