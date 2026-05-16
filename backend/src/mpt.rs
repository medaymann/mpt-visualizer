//! Canonical Ethereum Merkle Patricia Trie.
//!
//! Builds a hashed trie from (key_bytes, value_bytes) pairs and produces:
//!   - the 32-byte keccak root (matches block.transactionsRoot)
//!   - a structural view tree for the frontend renderer

use serde::Serialize;
use tiny_keccak::{Hasher, Keccak};

use crate::rlp;

#[derive(Debug, Clone)]
pub enum Node {
    Empty,
    Leaf { path: Vec<u8>, value: Vec<u8> },
    Extension { path: Vec<u8>, child: Box<Node> },
    Branch { children: [Option<Box<Node>>; 16], value: Option<Vec<u8>> },
}

impl Default for Node {
    fn default() -> Self { Node::Empty }
}

/// Convert a byte slice to its nibble representation (high nibble first).
pub fn to_nibbles(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(b >> 4);
        out.push(b & 0x0f);
    }
    out
}

fn common_prefix_len(a: &[u8], b: &[u8]) -> usize {
    a.iter().zip(b.iter()).take_while(|(x, y)| x == y).count()
}

/// Build the trie by repeated insertion. Inputs are raw key bytes; we convert
/// to nibbles internally.
pub fn build(entries: &[(Vec<u8>, Vec<u8>)]) -> Node {
    let mut root = Node::Empty;
    for (k, v) in entries {
        let nibbles = to_nibbles(k);
        root = insert(root, &nibbles, v.clone());
    }
    root
}

fn insert(node: Node, key: &[u8], value: Vec<u8>) -> Node {
    match node {
        Node::Empty => Node::Leaf { path: key.to_vec(), value },

        Node::Leaf { path, value: existing_val } => {
            if path == key {
                return Node::Leaf { path, value };
            }
            let cpl = common_prefix_len(&path, key);
            let mut branch_children: [Option<Box<Node>>; 16] = Default::default();
            let mut branch_value: Option<Vec<u8>> = None;

            if cpl < path.len() {
                let nib = path[cpl] as usize;
                let rest = path[cpl + 1..].to_vec();
                branch_children[nib] = Some(Box::new(Node::Leaf { path: rest, value: existing_val }));
            } else {
                branch_value = Some(existing_val);
            }
            if cpl < key.len() {
                let nib = key[cpl] as usize;
                let rest = key[cpl + 1..].to_vec();
                branch_children[nib] = Some(Box::new(Node::Leaf { path: rest, value }));
            } else {
                branch_value = Some(value);
            }
            let branch = Node::Branch { children: branch_children, value: branch_value };

            if cpl > 0 {
                Node::Extension { path: path[..cpl].to_vec(), child: Box::new(branch) }
            } else {
                branch
            }
        }

        Node::Extension { path, child } => {
            let cpl = common_prefix_len(&path, key);
            if cpl == path.len() {
                let new_child = insert(*child, &key[cpl..], value);
                return Node::Extension { path, child: Box::new(new_child) };
            }
            // Diverge mid-extension: split into branch.
            let mut branch_children: [Option<Box<Node>>; 16] = Default::default();
            let mut branch_value: Option<Vec<u8>> = None;

            let old_nib = path[cpl] as usize;
            let old_rest = path[cpl + 1..].to_vec();
            let old_subtree = if old_rest.is_empty() {
                *child
            } else {
                Node::Extension { path: old_rest, child }
            };
            branch_children[old_nib] = Some(Box::new(old_subtree));

            if cpl < key.len() {
                let new_nib = key[cpl] as usize;
                let new_rest = key[cpl + 1..].to_vec();
                branch_children[new_nib] = Some(Box::new(Node::Leaf { path: new_rest, value }));
            } else {
                branch_value = Some(value);
            }
            let branch = Node::Branch { children: branch_children, value: branch_value };
            if cpl > 0 {
                Node::Extension { path: path[..cpl].to_vec(), child: Box::new(branch) }
            } else {
                branch
            }
        }

        Node::Branch { mut children, value: branch_value } => {
            let mut new_value = branch_value;
            if key.is_empty() {
                new_value = Some(value);
                return Node::Branch { children, value: new_value };
            }
            let nib = key[0] as usize;
            let rest = &key[1..];
            let child = children[nib].take().map(|b| *b).unwrap_or(Node::Empty);
            children[nib] = Some(Box::new(insert(child, rest, value)));
            Node::Branch { children, value: new_value }
        }
    }
}

// --- Hashing -----------------------------------------------------------------

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    let mut out = [0u8; 32];
    k.update(data);
    k.finalize(&mut out);
    out
}

/// Hex-prefix encoding: encodes a nibble path + leaf-flag into a byte string.
/// See Ethereum yellow paper, appendix C.
fn hex_prefix(nibbles: &[u8], is_leaf: bool) -> Vec<u8> {
    let odd = nibbles.len() % 2 == 1;
    let flag: u8 = if is_leaf { 2 } else { 0 } | if odd { 1 } else { 0 };
    let mut out = Vec::with_capacity(nibbles.len() / 2 + 1);
    if odd {
        out.push((flag << 4) | nibbles[0]);
        for chunk in nibbles[1..].chunks(2) {
            out.push((chunk[0] << 4) | chunk[1]);
        }
    } else {
        out.push(flag << 4);
        for chunk in nibbles.chunks(2) {
            out.push((chunk[0] << 4) | chunk[1]);
        }
    }
    out
}

/// Returns the *encoding* of a node as it appears in a parent: either the raw RLP
/// (if < 32 bytes) or RLP(keccak(rlp_of_node)).
fn encode_for_parent(node: &Node) -> Vec<u8> {
    if matches!(node, Node::Empty) {
        return rlp::encode_bytes(&[]);
    }
    let raw = rlp_of_node(node);
    if raw.len() < 32 {
        return raw;
    }
    rlp::encode_bytes(&keccak256(&raw))
}

fn rlp_of_node(node: &Node) -> Vec<u8> {
    match node {
        Node::Empty => rlp::encode_bytes(&[]),
        Node::Leaf { path, value } => {
            let hp = hex_prefix(path, true);
            rlp::encode_list(&[rlp::encode_bytes(&hp), rlp::encode_bytes(value)])
        }
        Node::Extension { path, child } => {
            let hp = hex_prefix(path, false);
            rlp::encode_list(&[rlp::encode_bytes(&hp), encode_for_parent(child)])
        }
        Node::Branch { children, value } => {
            let mut items: Vec<Vec<u8>> = Vec::with_capacity(17);
            for c in children.iter() {
                match c {
                    Some(cn) => items.push(encode_for_parent(cn)),
                    None => items.push(rlp::encode_bytes(&[])),
                }
            }
            items.push(rlp::encode_bytes(value.as_deref().unwrap_or(&[])));
            rlp::encode_list(&items)
        }
    }
}

/// 32-byte keccak root of the trie.
pub fn root_hash(node: &Node) -> [u8; 32] {
    if matches!(node, Node::Empty) {
        return keccak256(&rlp::encode_bytes(&[]));
    }
    keccak256(&rlp_of_node(node))
}

// --- Public view tree (frontend-friendly) -----------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ViewNode {
    Leaf { path: String, value: String },
    Extension { path: String, child: Box<ViewNode> },
    Branch {
        children: Vec<Option<ViewNode>>, // length 16
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
}

fn nibbles_to_hex(nibbles: &[u8]) -> String {
    nibbles.iter().map(|n| format!("{:x}", n)).collect()
}

/// Convert internal Node → ViewNode. `value_render(raw_value_bytes)` lets the
/// caller decide how to display leaf values (e.g., hex tx hash preview).
pub fn to_view<F>(node: &Node, value_render: &F) -> Option<ViewNode>
where
    F: Fn(&[u8]) -> String,
{
    match node {
        Node::Empty => None,
        Node::Leaf { path, value } => Some(ViewNode::Leaf {
            path: nibbles_to_hex(path),
            value: value_render(value),
        }),
        Node::Extension { path, child } => {
            let child_view = to_view(child, value_render)
                .unwrap_or(ViewNode::Leaf { path: String::new(), value: String::new() });
            Some(ViewNode::Extension {
                path: nibbles_to_hex(path),
                child: Box::new(child_view),
            })
        }
        Node::Branch { children, value } => {
            let kids: Vec<Option<ViewNode>> = children
                .iter()
                .map(|c| c.as_ref().and_then(|cn| to_view(cn, value_render)))
                .collect();
            Some(ViewNode::Branch {
                children: kids,
                value: value.as_ref().map(|v| value_render(v)),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String { hex::encode(bytes) }

    #[test]
    fn empty_trie_root_matches_spec() {
        // The well-known empty trie root.
        let root = root_hash(&Node::Empty);
        assert_eq!(
            hex(&root),
            "56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
        );
    }

    #[test]
    fn single_insert_yields_leaf() {
        let entries = vec![(b"do".to_vec(), b"verb".to_vec())];
        let root = build(&entries);
        match root {
            Node::Leaf { .. } => {}
            other => panic!("expected leaf, got {:?}", other),
        }
    }

    #[test]
    fn update_overwrites_value() {
        let entries = vec![
            (b"k".to_vec(), b"v1".to_vec()),
            (b"k".to_vec(), b"v2".to_vec()),
        ];
        let root = build(&entries);
        match root {
            Node::Leaf { value, .. } => assert_eq!(value, b"v2"),
            _ => panic!("expected leaf"),
        }
    }

    #[test]
    fn divergent_keys_create_branch() {
        let entries = vec![
            (b"a".to_vec(), b"1".to_vec()),
            (b"b".to_vec(), b"2".to_vec()),
        ];
        let root = build(&entries);
        // 'a' = 0x61, 'b' = 0x62 — diverge in the low nibble of the first byte,
        // so we expect: Extension(0x6) → Branch{1: leaf, 2: leaf}
        match root {
            Node::Extension { ref path, .. } => assert_eq!(path, &vec![6u8]),
            _ => panic!("expected extension at root, got {:?}", root),
        }
    }

    #[test]
    fn root_is_deterministic() {
        let a = build(&[(b"x".to_vec(), b"1".to_vec()), (b"y".to_vec(), b"2".to_vec())]);
        let b = build(&[(b"y".to_vec(), b"2".to_vec()), (b"x".to_vec(), b"1".to_vec())]);
        assert_eq!(root_hash(&a), root_hash(&b));
    }
}
