//! Minimal RLP encoder (encode-only) — enough for MPT node hashing and tx-index keys.
//!
//! Spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/

pub fn encode_bytes(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return vec![bytes[0]];
    }
    if bytes.len() <= 55 {
        let mut out = Vec::with_capacity(1 + bytes.len());
        out.push(0x80 + bytes.len() as u8);
        out.extend_from_slice(bytes);
        return out;
    }
    let len_bytes = be_bytes(bytes.len() as u64);
    let mut out = Vec::with_capacity(1 + len_bytes.len() + bytes.len());
    out.push(0xb7 + len_bytes.len() as u8);
    out.extend_from_slice(&len_bytes);
    out.extend_from_slice(bytes);
    out
}

pub fn encode_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload_len: usize = items.iter().map(|x| x.len()).sum();
    let mut out = Vec::with_capacity(payload_len + 9);
    if payload_len <= 55 {
        out.push(0xc0 + payload_len as u8);
    } else {
        let len_bytes = be_bytes(payload_len as u64);
        out.push(0xf7 + len_bytes.len() as u8);
        out.extend_from_slice(&len_bytes);
    }
    for it in items {
        out.extend_from_slice(it);
    }
    out
}

/// RLP-encode a non-negative integer as a big-endian byte string with no leading zeros.
pub fn encode_int(n: u64) -> Vec<u8> {
    if n == 0 {
        return vec![0x80];
    }
    let bytes = be_bytes(n);
    encode_bytes(&bytes)
}

fn be_bytes(mut n: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    while n > 0 {
        buf.push((n & 0xff) as u8);
        n >>= 8;
    }
    buf.reverse();
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rlp_int_canonical() {
        assert_eq!(encode_int(0), vec![0x80]);
        assert_eq!(encode_int(1), vec![0x01]);
        assert_eq!(encode_int(127), vec![0x7f]);
        assert_eq!(encode_int(128), vec![0x81, 0x80]);
        assert_eq!(encode_int(1024), vec![0x82, 0x04, 0x00]);
    }

    #[test]
    fn rlp_empty_list() {
        assert_eq!(encode_list(&[]), vec![0xc0]);
    }

    #[test]
    fn rlp_short_string() {
        // "dog" → 0x83 'd' 'o' 'g'
        assert_eq!(encode_bytes(b"dog"), vec![0x83, b'd', b'o', b'g']);
    }
}
