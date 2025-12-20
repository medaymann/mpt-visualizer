"""
Minimal subset of Ethereum's MPT specifications, adapted from
https://github.com/ethereum/execution-specs/blob/forks/amsterdam/src/ethereum/forks/osaka/trie.py,
intended for testing; RLP and hex encoding are intentionally omitted.
"""

from dataclasses import dataclass

@dataclass(frozen=True)
class LeafNode:
    rest_of_key: tuple
    value: object

@dataclass(frozen=True)
class ExtensionNode:
    key_segment: tuple
    subnode: object

@dataclass(frozen=True)
class BranchNode:
    subnodes: tuple
    value: object


def common_prefix_length(a, b):
    for i in range(len(a)):
        if i >= len(b) or a[i] != b[i]:
            return i
    return len(a)


def patricialize(obj, level=0):
    if not obj:
        return None

    arbitrary_key = next(iter(obj))

    if len(obj) == 1:
        return LeafNode(rest_of_key=arbitrary_key[level:], value=obj[arbitrary_key])

    substring = arbitrary_key[level:]
    prefix_length = len(substring)

    for key in obj:
        prefix_length = min(prefix_length, common_prefix_length(substring, key[level:]))
        if prefix_length == 0:
            break

    if prefix_length > 0:
        prefix = arbitrary_key[level:level + prefix_length]
        return ExtensionNode(key_segment=prefix, subnode=patricialize(obj, level + prefix_length))

    branches = [dict() for _ in range(16)]
    value = None

    for key, val in obj.items():
        if len(key) == level:
            value = val
        else:
            branches[key[level]][key] = val

    subnodes = tuple(patricialize(branches[i], level + 1) for i in range(16))

    return BranchNode(subnodes=subnodes, value=value)
