//! Transaction RLP encoding.
//!
//! Reconstructs canonical wire-format bytes for an Ethereum transaction so the
//! resulting transactions trie hashes to the block's transactionsRoot.
//!
//! Tx types (EIP-2718 envelopes):
//!   - Legacy (no type byte):   RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
//!   - 0x01 (EIP-2930):         0x01 || RLP([chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, yParity, r, s])
//!   - 0x02 (EIP-1559):         0x02 || RLP([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList, yParity, r, s])
//!   - 0x03 (EIP-4844 blob):    0x03 || RLP([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes, yParity, r, s])
//!   - 0x04 (EIP-7702 set-code):0x04 || RLP([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList, authList, yParity, r, s])
//!
//! In all typed variants the "trie value" stored at the leaf is the envelope
//! bytes themselves (type byte prefixed), NOT another RLP wrap.

use anyhow::{anyhow, Context, Result};
use serde_json::Value;

use crate::rlp;

pub fn encode_tx(tx: &Value) -> Result<Vec<u8>> {
    let ty = tx
        .get("type")
        .and_then(|v| v.as_str())
        .map(parse_hex_u64)
        .transpose()?
        .unwrap_or(0);

    match ty {
        0 => encode_legacy(tx),
        1 => encode_typed(tx, 0x01, TxKind::Eip2930),
        2 => encode_typed(tx, 0x02, TxKind::Eip1559),
        3 => encode_typed(tx, 0x03, TxKind::Eip4844),
        4 => encode_typed(tx, 0x04, TxKind::Eip7702),
        n => Err(anyhow!("unsupported tx type 0x{:x}", n)),
    }
}

enum TxKind { Eip2930, Eip1559, Eip4844, Eip7702 }

fn encode_legacy(tx: &Value) -> Result<Vec<u8>> {
    // Legacy tx: [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
    let items = vec![
        rlp_uint(tx, "nonce")?,
        rlp_uint(tx, "gasPrice")?,
        rlp_uint(tx, "gas")?,
        rlp_addr(tx, "to")?,
        rlp_uint(tx, "value")?,
        rlp_bytes_field(tx, "input")?,
        rlp_uint(tx, "v")?,
        rlp_uint(tx, "r")?,
        rlp_uint(tx, "s")?,
    ];
    Ok(rlp::encode_list(&items))
}

fn encode_typed(tx: &Value, type_byte: u8, kind: TxKind) -> Result<Vec<u8>> {
    let mut items: Vec<Vec<u8>> = Vec::new();
    items.push(rlp_uint(tx, "chainId")?);
    items.push(rlp_uint(tx, "nonce")?);

    match kind {
        TxKind::Eip2930 => {
            items.push(rlp_uint(tx, "gasPrice")?);
        }
        _ => {
            items.push(rlp_uint(tx, "maxPriorityFeePerGas")?);
            items.push(rlp_uint(tx, "maxFeePerGas")?);
        }
    }

    items.push(rlp_uint(tx, "gas")?);
    items.push(rlp_addr(tx, "to")?);
    items.push(rlp_uint(tx, "value")?);
    items.push(rlp_bytes_field(tx, "input")?);
    items.push(rlp_access_list(tx)?);

    if let TxKind::Eip4844 = kind {
        items.push(rlp_uint(tx, "maxFeePerBlobGas")?);
        items.push(rlp_blob_versioned_hashes(tx)?);
    }
    if let TxKind::Eip7702 = kind {
        items.push(rlp_authorization_list(tx)?);
    }

    items.push(rlp_uint(tx, "yParity").or_else(|_| rlp_uint(tx, "v"))?);
    items.push(rlp_uint(tx, "r")?);
    items.push(rlp_uint(tx, "s")?);

    let payload = rlp::encode_list(&items);
    let mut out = Vec::with_capacity(1 + payload.len());
    out.push(type_byte);
    out.extend_from_slice(&payload);
    Ok(out)
}

// --- field helpers -----------------------------------------------------------

fn parse_hex_u64(s: &str) -> Result<u64> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.is_empty() { return Ok(0); }
    u64::from_str_radix(s, 16).with_context(|| format!("invalid hex u64: {s}"))
}

fn hex_to_bytes(s: &str) -> Result<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.is_empty() { return Ok(Vec::new()); }
    // Pad odd-length strings with a leading zero (RPCs sometimes return "0x1" for 1).
    let padded;
    let s = if s.len() % 2 == 1 {
        padded = format!("0{}", s);
        padded.as_str()
    } else {
        s
    };
    hex::decode(s).with_context(|| format!("invalid hex: {s}"))
}

/// Strip leading zero bytes — required by RLP for unsigned integers.
fn strip_leading_zeros(mut b: Vec<u8>) -> Vec<u8> {
    let n = b.iter().take_while(|x| **x == 0).count();
    b.drain(..n);
    b
}

fn rlp_uint(tx: &Value, field: &str) -> Result<Vec<u8>> {
    let s = tx.get(field).and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("missing field {field}"))?;
    let bytes = strip_leading_zeros(hex_to_bytes(s)?);
    Ok(rlp::encode_bytes(&bytes))
}

fn rlp_bytes_field(tx: &Value, field: &str) -> Result<Vec<u8>> {
    let s = tx.get(field).and_then(|v| v.as_str()).unwrap_or("0x");
    let bytes = hex_to_bytes(s)?;
    Ok(rlp::encode_bytes(&bytes))
}

fn rlp_addr(tx: &Value, field: &str) -> Result<Vec<u8>> {
    match tx.get(field).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() && s != "0x" => {
            let bytes = hex_to_bytes(s)?;
            Ok(rlp::encode_bytes(&bytes))
        }
        _ => Ok(rlp::encode_bytes(&[])), // contract creation
    }
}

fn rlp_access_list(tx: &Value) -> Result<Vec<u8>> {
    let arr = match tx.get("accessList").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(rlp::encode_list(&[])),
    };
    let mut entries: Vec<Vec<u8>> = Vec::with_capacity(arr.len());
    for entry in arr {
        let addr = entry.get("address").and_then(|v| v.as_str()).unwrap_or("0x");
        let storage = entry.get("storageKeys").and_then(|v| v.as_array());
        let addr_bytes = hex_to_bytes(addr)?;
        let mut keys: Vec<Vec<u8>> = Vec::new();
        if let Some(keys_arr) = storage {
            for k in keys_arr {
                let k_str = k.as_str().unwrap_or("0x");
                keys.push(rlp::encode_bytes(&hex_to_bytes(k_str)?));
            }
        }
        let entry_rlp = rlp::encode_list(&[
            rlp::encode_bytes(&addr_bytes),
            rlp::encode_list(&keys),
        ]);
        entries.push(entry_rlp);
    }
    Ok(rlp::encode_list(&entries))
}

fn rlp_blob_versioned_hashes(tx: &Value) -> Result<Vec<u8>> {
    let arr = match tx.get("blobVersionedHashes").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(rlp::encode_list(&[])),
    };
    let mut items: Vec<Vec<u8>> = Vec::with_capacity(arr.len());
    for h in arr {
        let s = h.as_str().unwrap_or("0x");
        items.push(rlp::encode_bytes(&hex_to_bytes(s)?));
    }
    Ok(rlp::encode_list(&items))
}

fn rlp_authorization_list(tx: &Value) -> Result<Vec<u8>> {
    let arr = match tx.get("authorizationList").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(rlp::encode_list(&[])),
    };
    let mut entries: Vec<Vec<u8>> = Vec::with_capacity(arr.len());
    for auth in arr {
        let items = vec![
            rlp_uint(auth, "chainId")?,
            rlp_addr(auth, "address")?,
            rlp_uint(auth, "nonce")?,
            rlp_uint(auth, "yParity").or_else(|_| rlp_uint(auth, "v"))?,
            rlp_uint(auth, "r")?,
            rlp_uint(auth, "s")?,
        ];
        entries.push(rlp::encode_list(&items));
    }
    Ok(rlp::encode_list(&entries))
}
