class TrieNode {
    constructor() {
        this.children = {};
        this.isEndOfWord = false;
    }
}
/**
 * Prefix matching datastructure for holding paths and seeing if any match a given incoming path
 **/
export class PathTrie {
    constructor() {
        this.root = new TrieNode();
        this.seen = new Set();
    }
    insert(path) {
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
    contains(path) {
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
    anyStartsWith(prefix) {
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
//# sourceMappingURL=PathTrie.js.map