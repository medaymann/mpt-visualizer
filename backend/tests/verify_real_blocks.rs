//! Integration test: fetch real Ethereum blocks via JSON-RPC, build the
//! transactions trie, and assert the computed root matches block.transactionsRoot.
//!
//! Requires network access — run with `cargo test --test verify_real_blocks -- --ignored`.

use serde_json::json;

#[path = "../src/rlp.rs"] mod rlp;
#[path = "../src/mpt.rs"] mod mpt;
#[path = "../src/rpc.rs"] mod rpc;
#[path = "../src/tx.rs"] mod tx;

async fn verify_block(client: &reqwest::Client, block_id: &str) {
    let (norm, is_hash) = rpc::normalize_block_id(block_id).unwrap();
    let method = if is_hash { "eth_getBlockByHash" } else { "eth_getBlockByNumber" };
    let block = rpc::call(client, method, json!([norm, true]))
        .await
        .expect("rpc failed");
    assert!(!block.is_null(), "block {block_id} not found");

    let tx_root = block.get("transactionsRoot").and_then(|v| v.as_str()).unwrap().to_string();
    let tx_objs = block.get("transactions").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::with_capacity(tx_objs.len());
    for (i, t) in tx_objs.iter().enumerate() {
        let value = tx::encode_tx(t).expect("encode_tx");
        let key = rlp::encode_int(i as u64);
        entries.push((key, value));
    }
    let trie = mpt::build(&entries);
    let computed = format!("0x{}", hex::encode(mpt::root_hash(&trie)));
    assert_eq!(
        computed.to_lowercase(),
        tx_root.to_lowercase(),
        "block {block_id} ({} txs): computed root mismatch",
        tx_objs.len()
    );
}

#[tokio::test]
#[ignore]
async fn verify_genesis() {
    let client = reqwest::Client::new();
    verify_block(&client, "0").await;
}

#[tokio::test]
#[ignore]
async fn verify_legacy_era() {
    let client = reqwest::Client::new();
    verify_block(&client, "4000000").await;
}

#[tokio::test]
#[ignore]
async fn verify_eip2930_era() {
    let client = reqwest::Client::new();
    verify_block(&client, "12244000").await; // shortly after Berlin
}

#[tokio::test]
#[ignore]
async fn verify_eip1559_era() {
    let client = reqwest::Client::new();
    verify_block(&client, "15000000").await;
}

#[tokio::test]
#[ignore]
async fn verify_post_merge() {
    let client = reqwest::Client::new();
    verify_block(&client, "18000000").await;
}

#[tokio::test]
#[ignore]
async fn verify_latest() {
    let client = reqwest::Client::new();
    verify_block(&client, "latest").await;
}
