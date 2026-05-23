<div align="center">

# MPT Visualizer

<br/>

[![tests](https://github.com/medaymann/mpt-visualizer/actions/workflows/test.yml/badge.svg)](https://github.com/medaymann/mpt-visualizer/actions/workflows/test.yml)
[![demo](https://img.shields.io/badge/demo-live-3a6ea5)](https://medaymann.github.io/mpt-visualizer/)

### Interactively build and explore Merkle Patricia Tries<br/>and watch them restructure as you add keys

[About](#about) · [Quickstart](#quickstart) · [Running locally](#running-locally) · [Limitations](#limitations)

</div>

## About

The Merkle Patricia Trie is one of the harder Ethereum internals to picture: its branches, extensions, and leaves rearrange based on the keys you insert, and every node is tied to its parent by a hash. Reading about it rarely makes it click.

This project makes it tangible, with two modes (both backed by canonical RLP encoding and keccak hashing):

- **Custom mode :** build a trie from your own hex keys and values and watch branches, extensions, and leaves appear and split as the keys' prefixes overlap. Runs entirely in your browser. Click a node to see its keccak hash and how parents reference children, and click a leaf to trace its path back to the root.

  <div align="center">
    <img src="assets/custom-mode.png" alt="Custom mode" width="700"><br/>
    <em>A custom-built trie from hand-entered hex keys.</em>
  </div>

  <br/>
  <br/>

- **Ethereum block mode :** load any mainnet block and rebuild its transactions trie from the raw transactions. The computed root is verified against `block.transactionsRoot` in the block header, so what you see is provably the same trie the chain committed to. Every transaction type is supported (legacy through EIP-7702).

  <div align="center">
    <img src="assets/ethereum-mode.png" alt="Ethereum block mode" width="700"><br/>
    <em>The transactions trie of Ethereum block #7777777.</em>
  </div>

## Quickstart

Open the live demo: **<https://medaymann.github.io/mpt-visualizer/>**

Custom mode works immediately, nothing to install.

Ethereum block mode needs the Rust backend. Clone the repo and start the backend; the demo page then uses it automatically:

```bash
npm run backend:run        # starts on http://localhost:8081
```

Then switch to the Ethereum block tab on the live page and load a block.

## Running locally

Clone the repo, then serve the frontend (and the backend for Ethereum mode):

```bash
# terminal 1 — backend (only needed for Ethereum mode)
npm run backend:run        # http://localhost:8081

# terminal 2 — frontend
npm run serve              # http://localhost:8080
```

Open <http://localhost:8080> (Custom mode needs only the frontend; Ethereum mode needs both)

## Project layout

```
backend/                  Rust service (Ethereum mode)
  src/
    main.rs               HTTP routes, request handling, LRU cache
    rpc.rs                JSON-RPC client (hedged parallel calls)
    rlp.rs                RLP encoder
    mpt.rs                Trie insert, hex-prefix, keccak root
    tx.rs                 Canonical RLP for every transaction type
  tests/                  Integration tests against live blocks

src/
  engine/                 In-browser trie engine (custom mode)
    keccak.js             keccak-256
    rlp.js                RLP encoder (port of rlp.rs)
    mpt.js                Trie insert, hex-prefix, keccak root, view tree
  visualization/          d3/SVG rendering
    Renderer.js           Pan/zoom, drag, layout, path highlight
    LayoutEngine.js       Top-down tidy tree
    RadialLayout.js       Concentric rings for wide tries
    *Visual.js            Branch / Extension / Leaf node rendering
    ConnectionManager.js  Edges between nodes
  ui/                     Orchestration
    App.js                Boots and wires the page
    MPTVisualizer.js      Tracks state, drives the renderer
    EthereumService.js    JS engine (custom) + HTTP client (blocks)
    examples.js, recentBlocks.js, stats.js

tests/                    Frontend tests (node --test)
index.html                Page shell
```

## Limitations

Ethereum mode visualizes the **transactions trie** only, not the state or receipts tries. The state trie spans hundreds of millions of accounts and would need an archive node. Support for the other tries may come later.

Contributions are welcome.
