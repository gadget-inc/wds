import { describe, expect, it } from "vitest";
import { PathTrie } from "../src/PathTrie.js";

describe("PathTrie", () => {
  it("should insert and search for paths", () => {
    const trie = new PathTrie();
    trie.insert("foo/bar");
    expect(trie.contains("foo/bar")).toBe(true);
    expect(trie.contains("foo/baz")).toBe(false);
  });

  it("should check if any paths in the trie start with a given prefix", () => {
    const trie = new PathTrie();
    trie.insert("foo/bar");
    trie.insert("foo/baz");
    trie.insert("foo/qux/corge");
    expect(trie.anyStartsWith("foo")).toBe(true);
    expect(trie.anyStartsWith("foo/bar")).toBe(true);
    expect(trie.anyStartsWith("foo/corge")).toBe(false);
    expect(trie.anyStartsWith("qux")).toBe(false);
    expect(trie.anyStartsWith("foo/qux")).toBe(true);
    expect(trie.anyStartsWith("foo/qux/corge")).toBe(true);
  });
});
