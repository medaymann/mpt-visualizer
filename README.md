# MPT Visualizer

An interactive Merkle Patricia Trie explorer with two modes:

- **Custom** — build a trie from your own key/value pairs and watch how
  branches, extensions, and leaves form as you insert.
- **Ethereum block** — load any block from Ethereum mainnet, rebuild its
  transactions trie, and verify the computed root matches
  `block.transactionsRoot`.

The rendered structure is the real thing — not a sketch. For every block
loaded, the backend cryptographically verifies that the trie we built
hashes to the exact root committed in the block header.

---

## Running

You need both a **frontend static server** and the **Rust backend**.

```bash
# terminal 1 — backend (default http://localhost:8081)
npm run backend:build      # one-time
npm run backend:run

# terminal 2 — frontend (default http://localhost:8080)
npm run serve
```

Then open <http://localhost:8080>.

The Custom tab works without the backend. The Ethereum tab needs the
backend running because RLP encoding + keccak hashing happen in Rust.

---

## Testing

```bash
npm test                  # 40 frontend tests (layout, stats, rlp/block-id helpers)
npm run backend:test      # 12 backend unit tests (rlp, mpt, rpc)
npm run backend:verify    # 6 integration tests fetching real blocks and asserting root match
```

`backend:verify` requires internet access and currently exercises:
genesis, block 4M (legacy txs), 12.2M (Berlin / EIP-2930), 15M
(EIP-1559), 18M (post-merge), and latest.

---

## How verification works

Both modes go through the Rust backend so the displayed trie is always
backed by canonical RLP + keccak.

**Ethereum mode** (`GET /api/block/:id`)

1. The backend re-encodes each transaction as canonical RLP. Every tx
   type is supported: legacy, EIP-2930 (0x01), EIP-1559 (0x02),
   EIP-4844 blob (0x03), EIP-7702 set-code (0x04).
2. The pair `(RLP(tx_index), tx_envelope_bytes)` is inserted into a
   Merkle Patricia Trie.
3. The trie's keccak root is computed and compared to
   `block.transactionsRoot` from the block header.
4. If the roots don't match, the API returns HTTP 422 and the
   visualization refuses to render.

**Custom mode** (`POST /api/trie/build`)

Same trie engine, fed by arbitrary hex-keyed entries. The keccak root
is returned but there's nothing external to compare it to — it's shown
as "keccak-verified by backend" so users can see the structure produced
real bytes that hashed to a real value.

---

## Project layout

```
backend/                Rust service (Axum)
  src/
    main.rs             HTTP routes, request handling
    rpc.rs              JSON-RPC client with public-endpoint failover
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
    Renderer.js         Pan/zoom, layout selection, level-of-detail
    LayoutEngine.js     Top-down tidy tree (default for small tries)
    RadialLayout.js     Concentric rings (default for tries > 30 nodes)
    BranchVisual.js, ExtensionVisual.js, LeafVisual.js
    ConnectionManager.js
    config.js
  ui/                   Orchestration
    App.js              Boots everything, wires the page
    MPTVisualizer.js    Tracks state, delegates trie construction to backend
    EthereumService.js  HTTP client for the Rust backend (block + build)
    examples.js         Preset key/value sets shown as chips

tests/                  Frontend test suite (node --test)
index.html              Page shell
```

---

## Tech

- **Frontend**: plain ES modules, d3 v7 from CDN, no build step
- **Backend**: Rust (axum, tokio, reqwest, tiny-keccak)
- **Layout**: two-pass tidy tree for small tries, concentric radial for
  wide ones. Pan/zoom uses d3.zoom with requestAnimationFrame
  coalescing and zoom-threshold level-of-detail.

---

## Limitations

- Only the **transactions trie** is visualized, not the state or receipts
  trie. The transactions trie is rebuilt per block from `txs[0..n]`, so
  it's small and self-contained. The state trie spans hundreds of
  millions of accounts and would need an archive node.
- Backend fans out to four public RPC endpoints (llamarpc, publicnode,
  ankr, cloudflare). If they all rate-limit you, supply your own.
