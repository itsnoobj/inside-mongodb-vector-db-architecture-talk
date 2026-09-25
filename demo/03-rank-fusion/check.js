/* Self-check for Demo 3 — fails loudly if the miss→catch story breaks: asserts the
 * exact-code doc ranks last in vector-only search and first once $rankFusion blends in
 * BM25, so a future data/index change can't silently flatten the demo.
 *
 * Run after seed.js: mongosh "mongodb://localhost:27017/?directConnection=true" --file check.js
 */
const vsdemo = db.getSiblingDB("vsdemo");
const meta = vsdemo.meta.findOne({ _id: "rankfusion-query" });
const EXACT_TITLE = "Connection timeout troubleshooting";

const vectorOnly = vsdemo.errors.aggregate([
  { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } },
  { $project: { _id: 0, title: 1 } },
]).toArray().map(d => d.title);

const fused = vsdemo.errors.aggregate([
  { $rankFusion: { input: { pipelines: {
      vector: [{ $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } }],
      text: [{ $search: { index: "search_index", phrase: { query: meta.text, path: "content" } } }, { $limit: 5 }],
  }}}},
  { $limit: 5 },
  { $project: { _id: 0, title: 1 } },
]).toArray().map(d => d.title);

assert(vectorOnly.indexOf(EXACT_TITLE) >= 3, `expected "${EXACT_TITLE}" to rank near the bottom in vector-only, got position ${vectorOnly.indexOf(EXACT_TITLE) + 1} of ${vectorOnly.length}`);
assert(fused[0] === EXACT_TITLE, `expected "${EXACT_TITLE}" to rank #1 after rankFusion, got "${fused[0]}"`);
print(`check passed: vector-only buries it at #${vectorOnly.indexOf(EXACT_TITLE) + 1}, rankFusion promotes it to #1`);
