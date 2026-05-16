//! JSON-RPC client with public-endpoint failover.

use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::{json, Value};

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

pub async fn call(client: &reqwest::Client, method: &str, params: Value) -> Result<Value> {
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    let mut last_err: Option<anyhow::Error> = None;
    for url in ENDPOINTS {
        match client.post(*url).json(&body).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<RpcResponse>().await {
                    Ok(rpc) => {
                        if let Some(err) = rpc.error {
                            last_err = Some(anyhow!("RPC error from {url}: {}", err.message));
                            continue;
                        }
                        if let Some(v) = rpc.result {
                            return Ok(v);
                        }
                        last_err = Some(anyhow!("Empty result from {url}"));
                    }
                    Err(e) => last_err = Some(anyhow!("Parse error from {url}: {e}")),
                }
            }
            Ok(resp) => last_err = Some(anyhow!("HTTP {} from {url}", resp.status())),
            Err(e) => last_err = Some(anyhow!("Network error from {url}: {e}")),
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
