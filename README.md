# MPT Visualizer

An interactive Merkle Patricia Trie explorer with two modes:

- **Custom** — build a trie from your own hex-keyed entries and watch
  how branches, extensions, and leaves form.
- **Ethereum block** — load any block from Ethereum mainnet, rebuild
  its transactions trie, and verify the computed root against
  `block.transactionsRoot` from the block header.

Tries are built in Rust, hashed with keccak, and (for blocks) checked
against the on-chain root. If the roots don't match, the API refuses
to render.

---

## Running

You need both the **Rust backend** and a **static server** for the
frontend.

```bash
# terminal 1 — backend on http://localhost:8081
npm run backend:build      # one-time
npm run backend:run

# terminal 2 — frontend on http://localhost:8080
npm run serve
```

Open <http://localhost:8080>. Both modes call the backend, so it must
be running.

---

## Using it

- **Pan** by dragging the canvas; **zoom** with the scroll wheel.
- **Drag a node** to move it; edges follow live. Drags don't persist
  across mode switches — the layout is recomputed on every re-render.
- **Click a leaf** to highlight its path back to the root; everything
  else dims. Click empty canvas to clear.
- **Layout toggle** (top-right): Auto / Tree / Radial. Auto picks
  radial once the trie grows beyond a small handful of nodes.
  Switching layouts tweens nodes to their new positions.
- **Fit / Reset zoom** buttons sit next to the layout toggle.
- **Recent blocks** appear as chips below the Ethereum input and
  persist via localStorage. Click one to reload it instantly.

---

## Testing

```bash
npm test                  # frontend unit tests (rlp + block-id helpers)
npm run backend:test      # backend unit tests (rlp, mpt, rpc)
npm run backend:verify    # integration tests fetching real blocks
```

`backend:verify` requires internet access and runs the trie against
several real blocks spanning every transaction-type era: genesis,
legacy, EIP-2930, EIP-1559, post-merge, and latest. Each test asserts
that the computed root matches the on-chain `transactionsRoot`.

---

## How verification works

Both modes go through the Rust backend so the displayed trie is
always backed by canonical RLP + keccak.

**Ethereum mode** (`GET /api/block/:id`)

1. Re-encode each transaction as canonical RLP. Every tx type is
   supported: legacy, EIP-2930 (0x01), EIP-1559 (0x02), EIP-4844 blob
   (0x03), EIP-7702 set-code (0x04).
2. Insert `(RLP(tx_index), tx_envelope_bytes)` into a Merkle Patricia
   Trie.
3. Compute the trie's keccak root and compare to
   `block.transactionsRoot`.
4. If the roots don't match, the API returns HTTP 422 and the
   frontend refuses to render.

**Custom mode** (`POST /api/trie/build`)

Same trie engine, fed by arbitrary hex-keyed entries. The keccak root
is returned and shown next to the structure — useful as a sanity
signal that the structure on screen came from real bytes that hashed
to a real value.

---

## Performance

- **Hedged RPC fetch** — every backend RPC call races multiple public
  endpoints in parallel; the first successful response wins. Slow or
  hung endpoints can't drag down cold loads.
- **Block cache** — block responses are kept in an in-memory LRU.
  Re-loading the same block returns in single-digit milliseconds.
- **Chunked render** — large tries paint in animation-frame-paced
  batches so the page stays responsive while drawing.
- **Level-of-detail** — when zoomed out far enough, branch slot
  internals, edge labels, and secondary text fade so the trie's shape
  stays readable instead of becoming a wall of tiny glyphs.

---

## Project layout

```
backend/                Rust service (Axum)
  src/
    main.rs             HTTP routes, request handling, LRU cache
    rpc.rs              JSON-RPC client with hedged parallel calls
    rlp.rs              RLP encoder
    mpt.rs              Trie insert, hex-prefix encoding, keccak root
    tx.rs               Canonical RLP for every transaction type
  tests/
    verify_real_blocks.rs   Integration tests against live blocks

src/
  styles.css            Page styles
  visualization/        d3/SVG rendering
    Renderer.js         Pan/zoom, drag, layout selection, level-of-detail,
                        path highlight, layout-switch animation
    LayoutEngine.js     Top-down tidy tree
    RadialLayout.js     Concentric rings (used when the trie is wide)
    BranchVisual.js, ExtensionVisual.js, LeafVisual.js, VisualNode.js
    ConnectionManager.js
    config.js
  ui/                   Orchestration
    App.js              Boots everything, wires the page
    MPTVisualizer.js    Tracks state, delegates trie construction to backend
    EthereumService.js  HTTP client for the Rust backend
    stats.js            countNodes() for the sidebar stats panel
    examples.js         Preset key/value sets shown as chips
    recentBlocks.js     localStorage-backed history of recently loaded blocks

tests/                  Frontend test suite (node --test)
index.html              Page shell
```

---

## Tech

- **Frontend**: plain ES modules, d3 from CDN, no build step
- **Backend**: Rust (axum, tokio, reqwest, tiny-keccak)
- **Layout**: tidy tree for small tries, concentric radial for wide
  ones. Radial spacing is adaptive — ring radii grow when fan-out
  demands more angular space.
- **Interaction**: d3.zoom for pan/zoom (rAF-coalesced); d3.drag for
  nodes (click vs drag distinguished by a movement threshold)

---

## Limitations

- Only the **transactions trie** is visualized, not the state or
  receipts trie. The transactions trie is rebuilt per block from
  `txs[0..n]` and is small and self-contained. The state trie spans
  hundreds of millions of accounts and would need an archive node.
- The backend talks to public RPC endpoints. If they all rate-limit
  you, supply your own.
