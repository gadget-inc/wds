class TrieNode {
  children: Record<string, TrieNode> = {};
  isEndOfWord = false;
}

/**
 * Prefix matching datastructure for holding paths and seeing if any match a given incoming path
 **/
export class PathTrie {
  root = new TrieNode();
  seen = new Set<string>();

  insert(path: string) {
    if (this.seen.has(path)) {
      return;
    }
    let node = this.root;
    const segments = path.split("/");
    for (const segment of segments) {
      if (!node.children[segment]) {
        node.children[segment] = new TrieNode();
      }
      node = node.children[segment];
    }
    this.seen.add(path);
    node.isEndOfWord = true;
  }

  /**
   * Has the incoming path been inserted into the trie?
   */
  contains(path: string) {
    let node = this.root;
    const segments = path.split("/");
    for (const segment of segments) {
      if (!node.children[segment]) {
        return false;
      }
      node = node.children[segment];
    }
    return node.isEndOfWord;
  }

  /**
   * Do any paths in the trie start with the given prefix?
   */
  anyStartsWith(prefix: string) {
    let node = this.root;
    const segments = prefix.split("/");
    for (const segment of segments) {
      if (!node.children[segment]) {
        return false;
      }
      node = node.children[segment];
    }
    return true;
  }
}
