//! mpt-backend
//!
//! HTTP service that fetches an Ethereum block via public JSON-RPC, builds the
//! transactions Merkle Patricia Trie (canonical RLP + keccak), and returns it
//! as JSON ready for the frontend renderer.
//!
//! Endpoints:
//!   GET  /api/block/:id   — id may be a decimal/hex block number, a block hash, or "latest"
//!   POST /api/trie/build  — body {"entries": {"hexKey": "value", ...}} returns {root, computed_root}
//!   GET  /healthz         — liveness probe

mod rlp;
mod mpt;
mod rpc;
mod tx;

use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    http: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<()> {
    let state = AppState {
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?,
    };

    let cors = CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_origin(Any);

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/block/:id", get(block_handler))
        .route("/api/trie/build", post(build_handler))
        .with_state(Arc::new(state))
        .layer(cors);

    let addr = "0.0.0.0:8081";
    println!("mpt-backend listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[derive(Serialize)]
struct BlockMeta {
    number: u64,
    hash: String,
    tx_count: usize,
    gas_used: u64,
    timestamp: u64,
    transactions_root: String,
}

#[derive(Serialize)]
struct BlockResponse {
    meta: BlockMeta,
    root: Option<mpt::ViewNode>,
    /// keccak root of the trie we built (hex, with 0x prefix).
    computed_root: String,
    /// true iff computed_root == meta.transactions_root.
    verified: bool,
}

async fn block_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<BlockResponse>, ApiError> {
    let (norm, is_hash) = rpc::normalize_block_id(&id).map_err(ApiError::bad_request)?;
    let method = if is_hash { "eth_getBlockByHash" } else { "eth_getBlockByNumber" };
    // Fetch full tx objects (second param = true) so we can re-RLP each
    // transaction and compute the canonical transactions-trie root.
    let block = rpc::call(&state.http, method, json!([norm, true]))
        .await
        .map_err(ApiError::upstream)?;

    if block.is_null() {
        return Err(ApiError::not_found(format!("Block {id} not found")));
    }

    let number = parse_hex_u64(block.get("number")).unwrap_or(0);
    let hash = block.get("hash").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let gas_used = parse_hex_u64(block.get("gasUsed")).unwrap_or(0);
    let timestamp = parse_hex_u64(block.get("timestamp")).unwrap_or(0);
    let tx_root = block
        .get("transactionsRoot")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let tx_objs: Vec<serde_json::Value> = block
        .get("transactions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::with_capacity(tx_objs.len());
    let mut tx_hashes: Vec<String> = Vec::with_capacity(tx_objs.len());
    for (i, tx) in tx_objs.iter().enumerate() {
        let value = tx::encode_tx(tx)
            .map_err(|e| ApiError::upstream(format!("tx {i}: {e}")))?;
        let key = rlp::encode_int(i as u64);
        entries.push((key, value));
        tx_hashes.push(
            tx.get("hash").and_then(|v| v.as_str()).unwrap_or("").to_string()
        );
    }

    let trie = mpt::build(&entries);
    let computed = mpt::root_hash(&trie);
    let computed_hex = format!("0x{}", hex::encode(computed));
    let verified = computed_hex.eq_ignore_ascii_case(&tx_root);

    if !verified {
        return Err(ApiError::verification_failed(format!(
            "Computed transactionsRoot {computed_hex} does not match block.transactionsRoot {tx_root}"
        )));
    }

    // Map raw RLP(tx) bytes → short tx-hash preview for display.
    let hash_by_value: std::collections::HashMap<Vec<u8>, String> = entries
        .iter()
        .zip(tx_hashes.iter())
        .map(|((_, v), h)| (v.clone(), h.clone()))
        .collect();
    let view = mpt::to_view(&trie, &|v| {
        match hash_by_value.get(v) {
            Some(h) if h.len() >= 12 => format!("{}…", &h[..12]),
            Some(h) => h.clone(),
            None => "(?)".to_string(),
        }
    });

    Ok(Json(BlockResponse {
        meta: BlockMeta {
            number,
            hash,
            tx_count: tx_objs.len(),
            gas_used,
            timestamp,
            transactions_root: tx_root,
        },
        root: view,
        computed_root: computed_hex,
        verified,
    }))
}

#[derive(Deserialize)]
struct BuildRequest {
    /// hex-encoded key (with or without 0x prefix) → UTF-8 string value
    entries: BTreeMap<String, String>,
}

#[derive(Serialize)]
struct BuildResponse {
    root: Option<mpt::ViewNode>,
    computed_root: String,
    node_count: usize,
}

async fn build_handler(
    Json(req): Json<BuildRequest>,
) -> Result<Json<BuildResponse>, ApiError> {
    let mut entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::with_capacity(req.entries.len());
    for (k, v) in &req.entries {
        let key_bytes = decode_hex_key(k).map_err(ApiError::bad_request)?;
        entries.push((key_bytes, v.as_bytes().to_vec()));
    }

    let trie = mpt::build(&entries);
    let computed = mpt::root_hash(&trie);
    let computed_hex = format!("0x{}", hex::encode(computed));

    // Pair raw value bytes back to their original UTF-8 string for display.
    let value_lookup: std::collections::HashMap<Vec<u8>, String> = req
        .entries
        .values()
        .map(|s| (s.as_bytes().to_vec(), s.clone()))
        .collect();
    let view = mpt::to_view(&trie, &|v| {
        value_lookup.get(v).cloned().unwrap_or_else(|| {
            // Fallback: try UTF-8, else hex.
            String::from_utf8(v.to_vec()).unwrap_or_else(|_| format!("0x{}", hex::encode(v)))
        })
    });

    let node_count = count_nodes(&trie);
    Ok(Json(BuildResponse { root: view, computed_root: computed_hex, node_count }))
}

fn decode_hex_key(s: &str) -> Result<Vec<u8>, anyhow::Error> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.is_empty() {
        return Ok(Vec::new());
    }
    // Allow odd-length hex by left-padding with a zero — matches the frontend's
    // historical behavior of treating "abc" as nibble path [a,b,c].
    let padded;
    let s = if s.len() % 2 == 1 {
        padded = format!("0{s}");
        padded.as_str()
    } else {
        s
    };
    hex::decode(s).map_err(|e| anyhow::anyhow!("invalid hex key '{s}': {e}"))
}

fn count_nodes(node: &mpt::Node) -> usize {
    use mpt::Node::*;
    match node {
        Empty => 0,
        Leaf { .. } => 1,
        Extension { child, .. } => 1 + count_nodes(child),
        Branch { children, .. } => {
            1 + children.iter().flatten().map(|c| count_nodes(c)).sum::<usize>()
        }
    }
}

fn parse_hex_u64(v: Option<&serde_json::Value>) -> Option<u64> {
    let s = v?.as_str()?;
    let s = s.strip_prefix("0x").unwrap_or(s);
    u64::from_str_radix(s, 16).ok()
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request<E: std::fmt::Display>(e: E) -> Self {
        Self { status: StatusCode::BAD_REQUEST, message: e.to_string() }
    }
    fn upstream<E: std::fmt::Display>(e: E) -> Self {
        Self { status: StatusCode::BAD_GATEWAY, message: e.to_string() }
    }
    fn not_found(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::NOT_FOUND, message: msg.into() }
    }
    fn verification_failed(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::UNPROCESSABLE_ENTITY, message: msg.into() }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}
