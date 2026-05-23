export const CONFIG = {
    branch: {
        width: 520,
        height: 110,
        color: '#2d4a6e',
        accent: '#5b8fd9',
        textColor: '#e8f1ff',
        slotCount: 16,
        slotActiveColor: '#5b8fd9',
        slotEmptyColor: '#1a2a40',
        valueColor: '#f5a623'
    },
    extension: {
        width: 240,
        height: 90,
        color: '#2e5d4a',
        accent: '#5fc299',
        textColor: '#e8fff4'
    },
    leaf: {
        width: 280,
        height: 90,
        color: '#5a3a6e',
        accent: '#b07fd9',
        textColor: '#f5ecff'
    },
    layout: {
        levelHeight: 170,
        siblingGap: 40,
        subtreeGap: 60
    },
    connection: {
        color: '#7aa7d9',
        width: 2,
        activeColor: '#f5a623',
        hashColor: '#e0863a',     // reference pointers (edge labels, child-hash)
        hashColorDark: '#a85e1f', // darker orange for hashes on light/gold fills
        idHashFill: '#2a1c0a'     // pill background behind a node's own hash
    },
    canvas: {
        background: '#0f1620',
        padding: 80
    }
};
