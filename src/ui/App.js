/**
 * App: orchestrates the page. Wires the two-tab UI, examples, custom-mode
 * inserts, Ethereum block loading, layout toggle, and stats. Boots one
 * MPTVisualizer + one EthereumService.
 *
 * Custom mode runs entirely in-browser (JS trie engine). Ethereum-block mode
 * needs the Rust backend; when none is configured it is disabled gracefully.
 */

import { MPTVisualizer } from './MPTVisualizer.js';
import { EthereumService, HAS_BACKEND } from './EthereumService.js';
import { CUSTOM_EXAMPLES, ETH_EXAMPLES } from './examples.js';
import * as recentBlocks from './recentBlocks.js';

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
    const dbPanel = document.getElementById('db-panel');
    const tabs = document.querySelectorAll('.tab');
    const ethTab = document.querySelector('.tab[data-mode="ethereum"]');

    // Ethereum mode needs the backend. On a static deploy (no MPT_BACKEND),
    // disable the tab and explain how to enable it.
    if (!HAS_BACKEND) {
        ethTab.classList.add('disabled');
        ethTab.title = 'Needs the local Rust backend — see the README to enable Ethereum mode.';
        const note = document.getElementById('ethDisabledNote');
        if (note) note.hidden = false;
    }

    tabs.forEach(t => t.addEventListener('click', () => {
        const mode = t.dataset.mode;
        if (mode === 'ethereum' && !HAS_BACKEND) {
            showStatus('Ethereum mode needs the local backend — see the README.', 'info');
            return;
        }
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('panel-custom').hidden = mode !== 'custom';
        document.getElementById('panel-ethereum').hidden = mode !== 'ethereum';
        dbPanel.hidden = mode !== 'custom';
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
            recentBlocks.push(meta.number);
            renderRecent();
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

    // Recent-blocks chips, populated on boot and after each successful load.
    function renderRecent() {
        const wrap = document.getElementById('recentBlocksWrap');
        const row = document.getElementById('recentBlocks');
        const list = recentBlocks.load();
        if (list.length === 0) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        row.innerHTML = '';
        for (const n of list) {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.textContent = `#${formatBlockNumber(n)}`;
            chip.title = `Block ${n}`;
            chip.addEventListener('click', () => {
                document.getElementById('blockInput').value = n;
                loadBlock();
            });
            row.appendChild(chip);
        }
    }

    function formatBlockNumber(n) {
        const num = Number(n);
        if (!Number.isFinite(num)) return n;
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 2) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(0) + 'K';
        return String(num);
    }

    document.getElementById('recentBlocksClear').addEventListener('click', () => {
        recentBlocks.clear();
        renderRecent();
    });
    renderRecent();
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
        const numberLink = `<a href="https://etherscan.io/block/${m.number}" target="_blank" rel="noopener noreferrer">#${m.number}</a>`;
        const hashLink = `<a href="https://etherscan.io/block/${m.hash}" target="_blank" rel="noopener noreferrer">${m.hash}</a>`;
        el.innerHTML =
            `<div><span class="k">block</span> ${numberLink}</div>` +
            `<div><span class="k">hash</span> ${hashLink}</div>` +
            `<div><span class="k">txs</span> ${m.txCount}</div>` +
            `<div><span class="k">gasUsed</span> ${m.gasUsed.toLocaleString()}</div>` +
            `<div><span class="k">time</span> ${ts} UTC</div>` +
            `<div><span class="k">tx-root</span> ${m.transactionsRoot}</div>` +
            `<div style="margin-top:6px">${badge}</div>`;
        el.style.display = 'block';
    }

    // --- DB table (custom mode) ------------------------------------------
    const dbTableBody = document.getElementById('db-table-body');
    let activeDbKey = null;

    function setDbRowHighlight(key) {
        activeDbKey = key;
        dbTableBody.querySelectorAll('tr[data-key]').forEach(tr => {
            tr.classList.toggle('db-row-active', tr.dataset.key === key);
        });
    }

    function refreshDB() {
        const entries = viz.entries;
        dbTableBody.innerHTML = '';
        activeDbKey = null;
        if (Object.keys(entries).length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="2" style="color:var(--text-dim);text-align:center;padding:16px">Empty</td>`;
            dbTableBody.appendChild(tr);
            return;
        }
        for (const [k, v] of Object.entries(entries)) {
            const tr = document.createElement('tr');
            tr.dataset.key = k;
            tr.style.cursor = 'pointer';
            const td1 = document.createElement('td');
            td1.textContent = k;
            const td2 = document.createElement('td');
            td2.textContent = v;
            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.addEventListener('click', () => {
                if (activeDbKey === k) {
                    viz.renderer.clearHighlight();
                } else {
                    viz.highlightLeafByKey(k);
                    setDbRowHighlight(k);
                }
            });
            dbTableBody.appendChild(tr);
        }
    }

    viz.onLeafHighlight(key => setDbRowHighlight(key));

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
                    `<div style="margin-top:4px"><span style="color:var(--text-dim)">computed by backend (nothing external to verify against)</span></div>`;
                rootEl.style.display = 'block';
            } else {
                rootEl.style.display = 'none';
            }
        }
    }
    viz.onChange(() => { refresh(); refreshDB(); });

    // --- Canvas controls -------------------------------------------------
    document.getElementById('fitButton').addEventListener('click', () => viz.render());

    document.getElementById('layoutToggle').addEventListener('click', e => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        document.querySelectorAll('#layoutToggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        viz.setLayoutMode(btn.dataset.mode);
    });

    const hashToggle = document.getElementById('hashToggle');
    let showHashes = false;
    hashToggle.addEventListener('click', () => {
        showHashes = !showHashes;
        viz.setShowHashes(showHashes);
        hashToggle.classList.toggle('active', showHashes);
        hashToggle.textContent = showHashes ? 'Hide hashes' : 'Show hashes';
    });

    // Clicking any hash label shows the full keccak hash in the status toast.
    viz.onHashClick(fullHash => {
        showStatus('keccak: 0x' + fullHash, 'info', true);
    });

    // --- DB toggle -------------------------------------------------------
    const dbToggle = document.getElementById('dbToggle');
    const dbTableWrap = dbPanel.querySelector('.db-table-wrap');
    let dbVisible = true;
    function setDbVisible(visible) {
        dbVisible = visible;
        dbTableWrap.hidden = !visible;
        dbPanel.classList.toggle('collapsed', !visible);
        dbToggle.classList.toggle('collapsed', !visible);
        requestAnimationFrame(() => { viz.handleResize(); viz.render(); });
    }
    dbToggle.addEventListener('click', () => setDbVisible(!dbVisible));

    // --- Boot with the first custom example so the canvas isn't empty ----
    dbPanel.hidden = false;
    trapError(viz.insertBulk(CUSTOM_EXAMPLES[0].dict));

    ['keyInput', 'valueInput'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('addButton').click();
        });
    });
}
