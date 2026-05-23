/**
 * keccak-256 (the pre-NIST Keccak used by Ethereum, NOT SHA3-256).
 *
 * Self-contained ES module: no dependencies, runs in the browser and under
 * `node --test`. Implements the Keccak-f[1600] permutation with rate 1088 bits
 * (136 bytes) and the 0x01 domain pad used by Ethereum's keccak256.
 *
 * Input/output are byte arrays (Uint8Array or number[]). Returns 32 bytes.
 */

const RND = 24;

// Round constants (low, high) 32-bit halves for the 64-bit RC[i].
const RC = [
    [0x00000001, 0x00000000], [0x00008082, 0x00000000],
    [0x0000808a, 0x80000000], [0x80008000, 0x80000000],
    [0x0000808b, 0x00000000], [0x80000001, 0x00000000],
    [0x80008081, 0x80000000], [0x00008009, 0x80000000],
    [0x0000008a, 0x00000000], [0x00000088, 0x00000000],
    [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
    [0x8000808b, 0x00000000], [0x0000008b, 0x80000000],
    [0x00008089, 0x80000000], [0x00008003, 0x80000000],
    [0x00008002, 0x80000000], [0x00000080, 0x80000000],
    [0x0000800a, 0x00000000], [0x8000000a, 0x80000000],
    [0x80008081, 0x80000000], [0x00008080, 0x80000000],
    [0x80000001, 0x00000000], [0x80008008, 0x80000000],
];

// Rotation offsets per lane (in bits).
const ROT = [
    0, 1, 62, 28, 27,
    36, 44, 6, 55, 20,
    3, 10, 43, 25, 39,
    41, 45, 15, 21, 8,
    18, 2, 61, 56, 14,
];

// Rotate a 64-bit lane (lo, hi) left by n bits, returning [lo, hi].
function rotl64(lo, hi, n) {
    n &= 63;
    if (n === 0) return [lo >>> 0, hi >>> 0];
    if (n < 32) {
        const nlo = ((lo << n) | (hi >>> (32 - n))) >>> 0;
        const nhi = ((hi << n) | (lo >>> (32 - n))) >>> 0;
        return [nlo, nhi];
    }
    const m = n - 32;
    if (m === 0) return [hi >>> 0, lo >>> 0];
    const nlo = ((hi << m) | (lo >>> (32 - m))) >>> 0;
    const nhi = ((lo << m) | (hi >>> (32 - m))) >>> 0;
    return [nlo, nhi];
}

// Keccak-f[1600] permutation over a 25-lane state. Each lane is two 32-bit
// words stored as s[2*i] = low, s[2*i+1] = high.
function keccakF(s) {
    const C = new Array(10);
    const D = new Array(10);
    const B = new Array(50);

    for (let round = 0; round < RND; round++) {
        // Theta
        for (let x = 0; x < 5; x++) {
            const x2 = x * 2;
            C[x2] = s[x2] ^ s[x2 + 10] ^ s[x2 + 20] ^ s[x2 + 30] ^ s[x2 + 40];
            C[x2 + 1] = s[x2 + 1] ^ s[x2 + 11] ^ s[x2 + 21] ^ s[x2 + 31] ^ s[x2 + 41];
        }
        for (let x = 0; x < 5; x++) {
            const a = (x + 4) % 5;
            const b = (x + 1) % 5;
            const [rlo, rhi] = rotl64(C[b * 2], C[b * 2 + 1], 1);
            D[x * 2] = (C[a * 2] ^ rlo) >>> 0;
            D[x * 2 + 1] = (C[a * 2 + 1] ^ rhi) >>> 0;
        }
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                const i = (x + 5 * y) * 2;
                s[i] = (s[i] ^ D[x * 2]) >>> 0;
                s[i + 1] = (s[i + 1] ^ D[x * 2 + 1]) >>> 0;
            }
        }

        // Rho + Pi
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                const src = (x + 5 * y);
                const dst = (y + 5 * ((2 * x + 3 * y) % 5));
                const [rlo, rhi] = rotl64(s[src * 2], s[src * 2 + 1], ROT[src]);
                B[dst * 2] = rlo;
                B[dst * 2 + 1] = rhi;
            }
        }

        // Chi
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const i = (x + 5 * y) * 2;
                const b0 = B[i], b0h = B[i + 1];
                const b1 = B[(((x + 1) % 5) + 5 * y) * 2];
                const b1h = B[(((x + 1) % 5) + 5 * y) * 2 + 1];
                const b2 = B[(((x + 2) % 5) + 5 * y) * 2];
                const b2h = B[(((x + 2) % 5) + 5 * y) * 2 + 1];
                s[i] = (b0 ^ ((~b1) & b2)) >>> 0;
                s[i + 1] = (b0h ^ ((~b1h) & b2h)) >>> 0;
            }
        }

        // Iota
        s[0] = (s[0] ^ RC[round][0]) >>> 0;
        s[1] = (s[1] ^ RC[round][1]) >>> 0;
    }
}

/**
 * keccak256: returns a 32-byte Uint8Array digest of the input bytes.
 * @param {Uint8Array|number[]} input
 * @returns {Uint8Array}
 */
export function keccak256(input) {
    const RATE = 136; // bytes (1088 bits)
    const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);

    // State: 25 lanes × 2 words = 50 32-bit words.
    const s = new Array(50).fill(0);

    // Absorb full-rate blocks.
    let offset = 0;
    const len = bytes.length;
    const blocks = Math.floor(len / RATE);
    for (let b = 0; b < blocks; b++) {
        absorbBlock(s, bytes, offset, RATE);
        keccakF(s);
        offset += RATE;
    }

    // Final block with padding (0x01 ... 0x80), Keccak (not SHA3) domain.
    const rem = len - offset;
    const last = new Uint8Array(RATE);
    last.set(bytes.subarray(offset, len));
    last[rem] ^= 0x01;
    last[RATE - 1] ^= 0x80;
    absorbBlock(s, last, 0, RATE);
    keccakF(s);

    // Squeeze 32 bytes (fits in the first rate block).
    // Each lane holds 8 bytes: lo word = bytes 0..3, hi word = bytes 4..7.
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        const lane = Math.floor(i / 8);
        const within = i % 8;
        const w = within < 4 ? s[lane * 2] : s[lane * 2 + 1];
        out[i] = (w >>> ((within % 4) * 8)) & 0xff;
    }
    return out;
}

function absorbBlock(s, bytes, offset, rate) {
    for (let i = 0; i < rate; i += 8) {
        const lane = i / 8;
        let lo = 0, hi = 0;
        lo = (bytes[offset + i] | (bytes[offset + i + 1] << 8) |
              (bytes[offset + i + 2] << 16) | (bytes[offset + i + 3] << 24)) >>> 0;
        hi = (bytes[offset + i + 4] | (bytes[offset + i + 5] << 8) |
              (bytes[offset + i + 6] << 16) | (bytes[offset + i + 7] << 24)) >>> 0;
        s[lane * 2] = (s[lane * 2] ^ lo) >>> 0;
        s[lane * 2 + 1] = (s[lane * 2 + 1] ^ hi) >>> 0;
    }
}

/** keccak256 returning a lowercase hex string (no 0x prefix). */
export function keccak256Hex(input) {
    const d = keccak256(input);
    let out = '';
    for (let i = 0; i < d.length; i++) out += d[i].toString(16).padStart(2, '0');
    return out;
}
