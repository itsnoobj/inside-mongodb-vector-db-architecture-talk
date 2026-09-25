/* Demo 3 — Vector Misses the Exact Code, BM25 Catches It (seed).
 *
 * Seeds documents about error handling. One doc mentions the EXACT error code
 * the query asks for; several "decoy" docs are semantically close (all about
 * timeouts/connection errors) but reference a DIFFERENT code. An embedding
 * can't tell "ERR-4521" from "ERR-4522" apart — they're both just "error code"
 * in vector space. BM25 can, because it matches the literal token.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file seed.js
 */

const DIM = 8;
const EXACT_CODE = "ERR-4521";
const DECOY_CODE = "ERR-4522";
const INDEX_BUILD_TIMEOUT_SECONDS = 90;

// Deterministic RNG (mulberry32) so every run of the demo produces identical data on stage.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(11);
const noise = () => (rng() - 0.5) * 0.1;

// All docs sit near the same axis (same general topic) — that's the point: an embedding
// alone can't separate "the right code" from "a similar-sounding wrong code." The exact
// doc gets an extra deliberate nudge AWAY from the query on axis 1: same topic, but
// measurably the worst vector match of the five — so vector-only demonstrably buries it,
// not just "might rank it lower by noise."
function vectorNearAxis(axis, drift = 0) {
  const vector = Array.from({ length: DIM }, () => noise());
  vector[axis] += 1;
  vector[1] += drift;
  return vector;
}

const vsdemo = db.getSiblingDB("vsdemo");
vsdemo.errors.drop();

const docs = [
  {
    title: "Connection timeout troubleshooting",
    content: `If you see ${EXACT_CODE}, the connection pool exhausted its retries. Increase the timeout or pool size.`,
    embedding: vectorNearAxis(0, 0.4),   // exact-code doc: deliberately the worst vector match
  },
  {
    title: "Retry logic for network errors",
    content: `${DECOY_CODE} indicates a transient network blip. Retrying with backoff usually resolves it.`,
    embedding: vectorNearAxis(0),
  },
  {
    title: "Connection pool sizing guide",
    content: "General guidance on sizing connection pools to avoid exhaustion under load.",
    embedding: vectorNearAxis(0),
  },
  {
    title: "Network blip recovery patterns",
    content: "Transient network errors are common in distributed systems; use exponential backoff.",
    embedding: vectorNearAxis(0),
  },
  {
    title: "Timeout configuration reference",
    content: "Reference for all timeout-related configuration options across the connection stack.",
    embedding: vectorNearAxis(0),
  },
];

vsdemo.errors.insertMany(docs);
print(`inserted ${vsdemo.errors.countDocuments()} docs, all semantically about "timeouts/connection errors"`);
print(`only one doc contains the exact code "${EXACT_CODE}" — the other 4 are decoys or unrelated to a specific code`);

// vectorSearch index for semantic search
vsdemo.errors.createSearchIndex("vsindex", "vectorSearch", {
  fields: [{ type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" }],
});

// search index (dynamic mapping) for BM25 keyword search — required for $rankFusion's text pipeline
vsdemo.errors.createSearchIndex("search_index", { mappings: { dynamic: true } });

function waitForSearchIndex(collection, indexName, timeoutSeconds) {
  print(`waiting for index "${indexName}" to build...`);
  for (let i = 0; i < timeoutSeconds; i++) {
    const index = collection.getSearchIndexes(indexName)[0];
    if (index && index.queryable) return true;
    sleep(1000);
  }
  return false;
}

const vectorReady = waitForSearchIndex(vsdemo.errors, "vsindex", INDEX_BUILD_TIMEOUT_SECONDS);
const searchReady = waitForSearchIndex(vsdemo.errors, "search_index", INDEX_BUILD_TIMEOUT_SECONDS);
print(vectorReady && searchReady ? "both indexes ready ✅" : "index NOT ready ❌ (is mongot running?)");

// stash the query vector (same axis as all docs — a pure vector search can't tell them apart)
vsdemo.meta.replaceOne(
  { _id: "rankfusion-query" },
  { _id: "rankfusion-query", q: vectorNearAxis(0), text: EXACT_CODE },
  { upsert: true }
);
print(`query vector stashed; text query = "${EXACT_CODE}"`);
