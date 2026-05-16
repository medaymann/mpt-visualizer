"""
Generates JSON fixtures (fixtures.json) containing test scenarios and their expected trie
structures, derived from a specification-based implementation (trie_spec.py).
"""


import json
from trie_spec import patricialize, LeafNode, ExtensionNode, BranchNode
from ethereum_types.bytes import Bytes
from ethereum_types.numeric import Uint


def node_to_json(node):
    if node is None: return None
    if isinstance(node, LeafNode):
        return {"type": "leaf", "path": list(node.rest_of_key), "value": node.value.decode('utf-8')}
    if isinstance(node, ExtensionNode):
        return {"type": "extension", "path": list(node.key_segment), "child": node_to_json(node.subnode)}
    if isinstance(node, BranchNode):
        children = {str(i): node_to_json(child) for i, child in enumerate(node.subnodes) if child}
        return {"type": "branch", "children": children, "value": node.value.decode('utf-8') if node.value else None}


scenarios = {
    "leaf_update": {"a1": "val1", "a1": "val2"},
    "leaf_split_existing_shorter_with_prefix": {"a1": "val1", "a1b": "val2"},
    "leaf_split_new_shorter_with_prefix": {"a1b": "val1", "a1": "val2"},
    "leaf_split_standard": {"a1": "val1", "a2": "val2"},
    "leaf_split_root_collision": {"1": "val1", "2": "val2"},
    "ext_passthrough": {"aa": "val1", "aab": "val2"},
    "ext_split_inner": {"aa1": "val1", "aa2": "val2"}, 
    "ext_split_demonstration": {"aaa": "val1", "aab": "val2", "ac": "val3"},
    "ext_split_value_stop": {"abc": "val1", "ab": "val2"},
    "ext_diverge": {"a1": "val1", "b1": "val2"},
    "ext_simple_split": {"aa": "val1", "ab": "val2"},
    "ext_split_value_insert": {"abc": "val1", "a": "val2"},
    "branch_value_injection": {"abc": "val1", "abd": "val2", "ab": "val3"},
    "branch_recurse": {"a": "val1", "b": "val2", "c": "val3"}
}


output = {}
for name, data in scenarios.items():
    spec_input = {Bytes([int(c, 16) for c in k]): v.encode('utf-8') for k, v in data.items()}
    root = patricialize(spec_input, 0)
    output[name] = {"input": data, "expected": node_to_json(root)}


with open('tests/fixtures.json', 'w') as f:
    json.dump(output, f, indent=2)