declare class TrieNode {
    children: Record<string, TrieNode>;
    isEndOfWord: boolean;
}
/**
 * Prefix matching datastructure for holding paths and seeing if any match a given incoming path
 **/
export declare class PathTrie {
    root: TrieNode;
    seen: Set<string>;
    insert(path: string): void;
    /**
     * Has the incoming path been inserted into the trie?
     */
    contains(path: string): boolean;
    /**
     * Do any paths in the trie start with the given prefix?
     */
    anyStartsWith(prefix: string): boolean;
}
export {};
