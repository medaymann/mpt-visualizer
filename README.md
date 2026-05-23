# MPT Visualizer

[![tests](https://github.com/medaymann/mpt-visualizer/actions/workflows/test.yml/badge.svg)](https://github.com/medaymann/mpt-visualizer/actions/workflows/test.yml)

An interactive Merkle Patricia Trie explorer with two modes:

- **Custom** — build a trie from your own hex-keyed entries and watch
  how branches, extensions, and leaves form. Runs **entirely in your
  browser** (JS trie engine), so it works on the static demo with no
  setup.
- **Ethereum block** — load any block from Ethereum mainnet, rebuild
  its transactions trie, and verify the computed root against
  `block.transactionsRoot` from the block header. This mode needs the
  **Rust backend** (RPC fetch + canonical RLP for every tx type).

The custom-mode JS engine and the Rust backend implement the same
canonical RLP + keccak trie and produce byte-identical roots — the
test suite locks the two together.

## Live demo

**<https://medaymann.github.io/mpt-visualizer/>** — custom mode, no setup.

Ethereum mode needs the backend, so it's only available when running
locally (see [Running](#running)).

---

## Screenshots

**Custom mode** — small trie built from hand-entered hex keys.

<img src="assets/custom-mode.png" alt="Custom mode" width="600">

**Ethereum block mode** — transactions trie for block 7,777,777, verified against the on-chain root.

<img src="assets/ethereum-mode.png" alt="Ethereum block mode" width="600">

---

## Running

### Custom mode only (no backend)

Custom mode runs fully in-browser. Just serve the static files:

```bash
npm run serve              # http://localhost:8080
```

This is exactly what the hosted demo does.

### Both modes (with the Rust backend)

To enable Ethereum-block mode, also run the backend:

```bash
# terminal 1 — backend on http://localhost:8081
npm run backend:build      # one-time
npm run backend:run

# terminal 2 — frontend on http://localhost:8080
npm run serve
```

Open <http://localhost:8080>. On `localhost` the frontend assumes the
backend is on `:8081` and enables Ethereum mode automatically. To point
at a different backend (e.g. a deployed one), set `window.MPT_BACKEND`
before the app boots:

```html
<script>window.MPT_BACKEND = 'https://your-backend.example.com';</script>
```

When no backend is configured (a plain static host), the Ethereum tab
is disabled and explains how to enable it; custom mode keeps working.

---

## Testing

```bash
npm test                  # frontend tests: JS keccak, rlp, trie engine, block-id helpers
npm run backend:test      # backend unit tests (rlp, mpt, rpc)
npm run backend:verify    # integration tests fetching real blocks
```

The frontend suite asserts the in-browser JS engine produces the same
keccak roots as the Rust backend (the expected roots in
`tests/mpt-engine.test.js` were captured from the backend), so the two
implementations can't silently drift apart.

`backend:verify` requires internet access and runs the trie against
several real blocks spanning every transaction-type era: genesis,
legacy, EIP-2930, EIP-1559, post-merge, and latest. Each test asserts
that the computed root matches the on-chain `transactionsRoot`.

---

## How verification works

**Custom mode** builds the trie in the browser via `src/engine`
(canonical RLP + keccak, a direct port of the Rust `mpt.rs`/`rlp.rs`).
There's nothing external to verify against, so it just displays the
computed root.

**Ethereum mode** (`GET /api/block/:id`) goes through the Rust backend:

1. Re-encode each transaction as canonical RLP. Every tx type is
   supported: legacy, EIP-2930 (0x01), EIP-1559 (0x02), EIP-4844 blob
   (0x03), EIP-7702 set-code (0x04).
2. Insert `(RLP(tx_index), tx_envelope_bytes)` into a Merkle Patricia
   Trie.
3. Compute the trie's keccak root and compare to
   `block.transactionsRoot`.
4. If the roots don't match, the API returns HTTP 422 and the
   frontend refuses to render.

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
  engine/               In-browser trie engine (custom mode)
    keccak.js           keccak-256 (Keccak-f[1600])
    rlp.js              RLP encoder (port of rlp.rs)
    mpt.js              Trie insert, hex-prefix, keccak root, view tree
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
    MPTVisualizer.js    Tracks state; custom mode builds via the JS engine
    EthereumService.js  JS engine for custom mode; HTTP client for blocks
    stats.js            countNodes() for the sidebar stats panel
    examples.js         Preset key/value sets shown as chips
    recentBlocks.js     localStorage-backed history of recently loaded blocks

tests/                  Frontend test suite (node --test)
index.html              Page shell
```

---

## Limitations

- In Ethereum mode, only the **transactions trie** is visualized, not the state or
  receipts trie. The transactions trie is rebuilt per block from
  `txs[0..n]` and is small and self-contained. The state trie spans
  hundreds of millions of accounts and would need an archive node.
