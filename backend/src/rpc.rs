//! JSON-RPC client with hedged requests across public endpoints.
//!
//! We fire the same request to every endpoint in parallel and return the
//! first successful response. Slow or unresponsive endpoints no longer block
//! the user — the others race ahead. Losers' futures are dropped when this
//! function returns, which cancels their in-flight reqwest calls.

use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::task::JoinSet;

const ENDPOINTS: &[&str] = &[
    "https://eth.llamarpc.com",
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
];

#[derive(Debug, Deserialize)]
struct RpcResponse {
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    message: String,
}

async fn try_endpoint(
    client: reqwest::Client,
    url: &'static str,
    body: Value,
) -> Result<Value> {
    let resp = client.post(url).json(&body).send().await
        .map_err(|e| anyhow!("Network error from {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!("HTTP {} from {url}", resp.status()));
    }
    let rpc: RpcResponse = resp.json().await
        .map_err(|e| anyhow!("Parse error from {url}: {e}"))?;
    if let Some(err) = rpc.error {
        return Err(anyhow!("RPC error from {url}: {}", err.message));
    }
    rpc.result.ok_or_else(|| anyhow!("Empty result from {url}"))
}

pub async fn call(client: &reqwest::Client, method: &str, params: Value) -> Result<Value> {
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });

    let mut set = JoinSet::new();
    for url in ENDPOINTS {
        let client = client.clone();
        let body = body.clone();
        set.spawn(async move { try_endpoint(client, url, body).await });
    }

    let mut last_err: Option<anyhow::Error> = None;
    while let Some(res) = set.join_next().await {
        match res {
            Ok(Ok(value)) => {
                // First success wins; abort the rest so they don't keep sucking bandwidth.
                set.abort_all();
                return Ok(value);
            }
            Ok(Err(e)) => last_err = Some(e),
            Err(e) if e.is_cancelled() => {} // ignore aborted siblings
            Err(e) => last_err = Some(anyhow!("task error: {e}")),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("All endpoints failed")))
}

/// Normalize a user-supplied block identifier into an RPC-friendly form,
/// returning (param_value, is_hash).
pub fn normalize_block_id(input: &str) -> Result<(String, bool)> {
    let s = input.trim();
    if s.is_empty() {
        return Err(anyhow!("Empty block identifier"));
    }
    match s {
        "latest" | "earliest" | "pending" | "finalized" | "safe" => Ok((s.to_string(), false)),
        _ => {
            if s.starts_with("0x") && s.len() == 66 {
                return Ok((s.to_string(), true));
            }
            let n: u64 = if let Some(stripped) = s.strip_prefix("0x") {
                u64::from_str_radix(stripped, 16)
                    .map_err(|_| anyhow!("Invalid hex block number: {s}"))?
            } else {
                s.parse::<u64>()
                    .map_err(|_| anyhow!("Invalid block number: {s}"))?
            };
            Ok((format!("0x{:x}", n), false))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tags() {
        for tag in ["latest", "earliest", "pending", "finalized", "safe"] {
            let (v, is_hash) = normalize_block_id(tag).unwrap();
            assert_eq!(v, tag);
            assert!(!is_hash);
        }
    }

    #[test]
    fn normalize_decimal() {
        let (v, is_hash) = normalize_block_id("18000000").unwrap();
        assert_eq!(v, "0x112a880");
        assert!(!is_hash);
    }

    #[test]
    fn normalize_hash() {
        let h = format!("0x{}", "a".repeat(64));
        let (v, is_hash) = normalize_block_id(&h).unwrap();
        assert_eq!(v, h);
        assert!(is_hash);
    }

    #[test]
    fn normalize_invalid() {
        assert!(normalize_block_id("").is_err());
        assert!(normalize_block_id("nonsense").is_err());
    }
}
