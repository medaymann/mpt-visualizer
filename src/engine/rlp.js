/**
 * Minimal RLP encoder (encode-only). Direct port of the Rust backend's rlp.rs.
 * All functions take and return byte arrays (number[] of 0..255).
 *
 * Spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 */

export function encodeBytes(bytes) {
    if (bytes.length === 1 && bytes[0] < 0x80) {
        return [bytes[0]];
    }
    if (bytes.length <= 55) {
        return [0x80 + bytes.length, ...bytes];
    }
    const lenBytes = beBytes(bytes.length);
    return [0xb7 + lenBytes.length, ...lenBytes, ...bytes];
}

export function encodeList(items) {
    const payloadLen = items.reduce((acc, x) => acc + x.length, 0);
    let out;
    if (payloadLen <= 55) {
        out = [0xc0 + payloadLen];
    } else {
        const lenBytes = beBytes(payloadLen);
        out = [0xf7 + lenBytes.length, ...lenBytes];
    }
    for (const it of items) out.push(...it);
    return out;
}

/** RLP-encode a non-negative integer as a big-endian byte string, no leading zeros. */
export function encodeInt(n) {
    if (n === 0) return [0x80];
    return encodeBytes(beBytes(n));
}

function beBytes(n) {
    const buf = [];
    while (n > 0) {
        buf.push(n & 0xff);
        n = Math.floor(n / 256);
    }
    buf.reverse();
    return buf;
}
