/**
 * Utility Functions for MPT
 * 
 * Helper functions for key conversion, comparison, and manipulation
 */

export class Utils {
    /**
     * Convert hex string to array of nibbles (0-15)
     * @param {string} hex - Hex string (e.g., "1a2b" or "0x1a2b")
     * @returns {number[]} Array of nibbles
     */
    static hexToNibbles(hex) {
        const clean = hex.replace(/^0x/, '').toLowerCase();
        const nibbles = [];
        for (let char of clean) {
            const nibble = parseInt(char, 16);
            if (isNaN(nibble)) {
                throw new Error(`Invalid hex character: ${char}`);
            }
            nibbles.push(nibble);
        }
        return nibbles;
    }

    /**
     * Convert array of nibbles to hex string
     * @param {number[]} nibbles - Array of nibbles (0-15)
     * @returns {string} Hex string
     */
    static nibblesToHex(nibbles) {
        return nibbles.map(n => n.toString(16)).join('');
    }

    /**
     * Find the length of the common prefix between two arrays
     * @param {number[]} a - First array
     * @param {number[]} b - Second array
     * @returns {number} Length of common prefix
     */
    static commonPrefixLength(a, b) {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++;
        }
        return i;
    }

    /**
     * Check if two arrays are equal
     * @param {number[]} a - First array
     * @param {number[]} b - Second array
     * @returns {boolean} True if arrays are equal
     */
    static arraysEqual(a, b) {
        return a.length === b.length && a.every((val, i) => val === b[i]);
    }

    /**
     * Validate hex string
     * @param {string} hex - Hex string to validate
     * @returns {boolean} True if valid hex
     */
    static isValidHex(hex) {
        const clean = hex.replace(/^0x/, '');
        return /^[0-9a-fA-F]*$/.test(clean);
    }
}