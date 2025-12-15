import { MPT } from "./mpt.js";
import { LeafNode } from "./nodes.js";


const trie = new MPT();
trie.insertBulk({
    "1a2b": "Value1",
    "1a2c": "Value2",
    "3f4e": "Value3",
    "abcd": "Value4"
});
// console.log(trie);
console.log(trie._insertRecursive({ type: 'leaf', restOfKey: [ 1, 10, 2, 11 ], value: 'Value1' }, [1, 10, 2, 12], "Value2", 0));