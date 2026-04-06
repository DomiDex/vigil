import type { Database } from "bun:sqlite";

// ── Semantic Index (TF-IDF Cosine Similarity) ──
// Pure-JS semantic search for the memory system.
// Works alongside FTS5 keyword search to find semantically related observations.

// Common English stopwords to filter out during tokenization
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "this",
  "that",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "then",
  "else",
  "when",
  "where",
  "how",
  "what",
  "which",
  "who",
  "whom",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "than",
  "too",
  "very",
  "just",
  "about",
  "above",
  "after",
  "again",
  "also",
  "any",
  "because",
  "before",
  "between",
  "into",
  "out",
  "over",
  "own",
  "same",
  "these",
  "those",
  "through",
  "under",
  "until",
  "up",
  "while",
  "here",
  "there",
  "now",
  "only",
  "its",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "him",
  "his",
  "she",
  "her",
  "they",
  "them",
  "their",
  "as",
  "once",
]);

export interface SemanticResult {
  memoryId: string;
  score: number;
}

export class SemanticIndex {
  private db: Database;
  private idfCache: Map<string, number> = new Map();
  private totalDocs = 0;

  constructor(db: Database) {
    this.db = db;
  }

  /** Create the semantic_vectors table if it doesn't exist. */
  init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS semantic_vectors (
        memory_id TEXT PRIMARY KEY,
        terms TEXT NOT NULL DEFAULT '{}',
        magnitude REAL NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);
    this.rebuildIdfCache();
  }

  /** Index a memory entry's content for semantic search. */
  index(memoryId: string, content: string): void {
    const tokens = tokenize(content);
    if (tokens.length === 0) return;

    const tf = computeTF(tokens);
    const magnitude = computeMagnitude(tf);

    this.db.run(
      `INSERT OR REPLACE INTO semantic_vectors (memory_id, terms, magnitude, updated_at)
       VALUES (?, ?, ?, ?)`,
      [memoryId, JSON.stringify(Object.fromEntries(tf)), magnitude, Date.now()],
    );

    // Invalidate IDF cache since document set changed
    this.idfCache.clear();
    this.totalDocs = 0;
  }

  /** Batch-index memories that don't have semantic vectors yet. */
  indexUnindexed(): number {
    const rows = this.db
      .query(
        `SELECT id, content FROM memories
         WHERE id NOT IN (SELECT memory_id FROM semantic_vectors)`,
      )
      .all() as { id: string; content: string }[];

    for (const row of rows) {
      this.index(row.id, row.content);
    }
    return rows.length;
  }

  /** Search for semantically similar content using TF-IDF cosine similarity. */
  search(query: string, limit = 5): SemanticResult[] {
    this.ensureIdfCache();

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryTF = computeTF(queryTokens);
    const queryWeights = new Map<string, number>();
    for (const [term, tf] of queryTF) {
      const idf = this.idfCache.get(term) ?? 0;
      queryWeights.set(term, tf * idf);
    }
    const queryMag = Math.sqrt([...queryWeights.values()].reduce((sum, w) => sum + w * w, 0));
    if (queryMag === 0) return [];

    // Scan all vectors and compute cosine similarity
    const rows = this.db.query(`SELECT memory_id, terms, magnitude FROM semantic_vectors`).all() as {
      memory_id: string;
      terms: string;
      magnitude: number;
    }[];

    const scored: SemanticResult[] = [];
    for (const row of rows) {
      if (row.magnitude === 0) continue;
      const docTerms: Record<string, number> = JSON.parse(row.terms);

      let dotProduct = 0;
      for (const [term, queryWeight] of queryWeights) {
        const docTF = docTerms[term];
        if (docTF !== undefined) {
          const idf = this.idfCache.get(term) ?? 0;
          dotProduct += queryWeight * (docTF * idf);
        }
      }

      if (dotProduct === 0) continue;
      const score = dotProduct / (queryMag * row.magnitude);
      scored.push({ memoryId: row.memory_id, score });
    }

    // Sort by score descending and return top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /** Rebuild the IDF cache from the current document set. */
  rebuildIdfCache(): void {
    const countRow = this.db.query(`SELECT COUNT(*) as cnt FROM semantic_vectors`).get() as {
      cnt: number;
    } | null;
    this.totalDocs = countRow?.cnt ?? 0;
    if (this.totalDocs === 0) return;

    this.idfCache.clear();

    // Count documents containing each term
    const termDocCounts = new Map<string, number>();
    const rows = this.db.query(`SELECT terms FROM semantic_vectors`).all() as { terms: string }[];

    for (const row of rows) {
      const terms: Record<string, number> = JSON.parse(row.terms);
      for (const term of Object.keys(terms)) {
        termDocCounts.set(term, (termDocCounts.get(term) ?? 0) + 1);
      }
    }

    // IDF = log(N / df) where N = total docs, df = docs containing term
    for (const [term, df] of termDocCounts) {
      this.idfCache.set(term, Math.log(this.totalDocs / df));
    }
  }

  private ensureIdfCache(): void {
    if (this.idfCache.size === 0 || this.totalDocs === 0) {
      this.rebuildIdfCache();
    }
  }
}

// ── Tokenization ──

/** Tokenize text: lowercase, split on non-alpha, remove stopwords, min length 2. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Compute term frequency (normalized by document length). */
export function computeTF(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const tf = new Map<string, number>();
  for (const [term, count] of counts) {
    tf.set(term, count / tokens.length);
  }
  return tf;
}

/** Compute vector magnitude from TF values. */
export function computeMagnitude(tf: Map<string, number>): number {
  let sum = 0;
  for (const v of tf.values()) {
    sum += v * v;
  }
  return Math.sqrt(sum);
}
