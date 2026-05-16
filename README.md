# MPT Visualizer

An interactive Merkle Patricia Trie explorer with two modes:

- **Custom** — build a trie from your own key/value pairs and watch how
  branches, extensions, and leaves form as you insert.
- **Ethereum block** — load any block from Ethereum mainnet, rebuild its
  transactions trie, and verify the computed root matches
  `block.transactionsRoot`.

The rendered structure is the real thing — not a sketch. Tries are built
in Rust, hashed with keccak, and (for blocks) checked against the root
committed in the block header.

---

## Running

You need both the **Rust backend** and a **static server** for the
frontend.

```bash
# terminal 1 — backend (http://localhost:8081)
npm run backend:build      # one-time
npm run backend:run

# terminal 2 — frontend (http://localhost:8080)
npm run serve
```

Then open <http://localhost:8080>. Both modes call the backend, so it
must be running.

---

## Using it

- **Pan** by dragging the canvas, **zoom** with the scroll wheel.
- **Drag a node** to move it; edges follow live. Layout is recomputed
  on re-render, so drags don't persist across mode switches.
- **Click a leaf** to highlight its path back to the root; everything
  else dims. Click the empty canvas to clear.
- **Layout toggle** (top-right): Auto / Tree / Radial. Auto picks
  radial when the trie has more than ~30 nodes. Switching modes
  smoothly tweens nodes to their new positions.
- **Recent blocks** appear as chips below the Ethereum input after
  successful loads. Persists across reloads.

---

## Testing

```bash
npm test                  # 40 frontend tests (layout, stats, rlp/block-id helpers)
npm run backend:test      # 12 backend unit tests (rlp, mpt, rpc)
npm run backend:verify    # 6 integration tests fetching real blocks and asserting root match
```

`backend:verify` requires internet access and exercises every tx-type
era: genesis, block 4M (legacy), 12.2M (Berlin / EIP-2930), 15M
(EIP-1559), 18M (post-merge), and latest.

---

## How verification works

Both modes go through the Rust backend so the displayed trie is always
backed by canonical RLP + keccak.

**Ethereum mode** (`GET /api/block/:id`)

1. Re-encode each transaction as canonical RLP. Every tx type is
   supported: legacy, EIP-2930 (0x01), EIP-1559 (0x02), EIP-4844 blob
   (0x03), EIP-7702 set-code (0x04).
2. Insert `(RLP(tx_index), tx_envelope_bytes)` into a Merkle Patricia
   Trie.
3. Compute the trie's keccak root and compare it to
   `block.transactionsRoot`.
4. If the roots don't match, the API returns HTTP 422 and the
   frontend refuses to render.

**Custom mode** (`POST /api/trie/build`)

Same trie engine, fed by arbitrary hex-keyed entries. The keccak root
is returned and displayed (no external value to compare against — it's
shown as "keccak-verified by backend").

---

## Performance

- **Hedged RPC fetch**: every request races all four public endpoints
  in parallel; the first successful response wins. Slow or hung
  endpoints can't drag down cold loads.
- **LRU cache**: block responses (concrete numbers and hashes only) are
  cached in-memory, capped at 64 entries. Repeat loads of the same
  block return in ~10ms.
- **Chunked render**: for tries above 80 nodes, visuals paint in
  requestAnimationFrame-paced batches so the page stays responsive.
- **Level-of-detail**: when zoomed out past a threshold, branch slot
  internals, edge nibble labels, and secondary text fade out so the
  shape stays readable instead of becoming a wall of dots.

Measured cold fetch of block 18M dropped from ~16s (sequential
failover, slow endpoint) to ~450ms. Repeat fetches: ~10ms.

---

## Project layout

```
backend/                Rust service (Axum)
  src/
    main.rs             HTTP routes, request handling, LRU cache
    rpc.rs              JSON-RPC client with hedged parallel calls
    rlp.rs              RLP encoder
    mpt.rs              Trie insert, hex-prefix encoding, keccak root, JSON view
    tx.rs               Canonical RLP for every tx type
  tests/
    verify_real_blocks.rs   Integration tests against live blocks

src/
  core/                 Test-only in-memory MPT (lets layout/stats tests
                        construct trie shapes without booting the backend)
    mpt.js, nodes.js, utils.js
    stats.js            countNodes() — used by UI and tests
  visualization/        d3/SVG rendering
    Renderer.js         Pan/zoom, drag, layout selection, level-of-detail,
                        path highlight, layout-switch animation
    LayoutEngine.js     Top-down tidy tree (default for small tries)
    RadialLayout.js     Concentric rings (default for tries > 30 nodes)
    BranchVisual.js, ExtensionVisual.js, LeafVisual.js
    ConnectionManager.js
    config.js
  ui/                   Orchestration
    App.js              Boots everything, wires the page
    MPTVisualizer.js    Tracks state, delegates trie construction to backend
    EthereumService.js  HTTP client for the Rust backend
    examples.js         Preset key/value sets shown as chips
    recentBlocks.js     localStorage-backed history of recently loaded blocks

tests/                  Frontend test suite (node --test)
index.html              Page shell
```

---

## Tech

- **Frontend**: plain ES modules, d3 v7 from CDN, no build step
- **Backend**: Rust (axum, tokio, reqwest, tiny-keccak)
- **Layout**: two-pass tidy tree for small tries, concentric radial for
  wide ones
- **Interaction**: d3.zoom for pan/zoom with rAF-coalesced updates;
  d3.drag for nodes (click vs drag distinguished by movement threshold)

---

## Limitations

- Only the **transactions trie** is visualized, not the state or
  receipts trie. The transactions trie is rebuilt per block from
  `txs[0..n]` and is small and self-contained. The state trie spans
  hundreds of millions of accounts and would need an archive node.
- Backend fans out to four public RPC endpoints (llamarpc, publicnode,
  ankr, cloudflare). If they all rate-limit you, supply your own.
