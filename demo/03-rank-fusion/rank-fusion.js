/* Demo 3 — $rankFusion: blend vector (semantic) + BM25 (exact) in one query.
 * BM25 pulls the exact-code doc to the top; vector search alone couldn't.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file rank-fusion.js
 */
const vsdemo = db.getSiblingDB("vsdemo");
const meta = vsdemo.meta.findOne({ _id: "rankfusion-query" });

const results = vsdemo.errors.aggregate([
  { $rankFusion: {
      input: { pipelines: {
        vector: [
          { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } },
        ],
        text: [
          { $search: { index: "search_index", text: { query: meta.text, path: "content" } } },
          { $limit: 5 },
        ],
      }},
      scoreDetails: true,
  }},
  { $limit: 5 },
  { $addFields: { scoreDetails: { $meta: "searchScoreDetails" } } },
  { $project: { _id: 0, title: 1, content: 1, scoreDetails: 1 } },
]).toArray();

print(`\nSame query vector + text query "${meta.text}", fused with $rankFusion.\n`);
print(`Top result now:\n`);
printjson({ title: results[0].title, content: results[0].content });
print(`\nBM25 found "${meta.text}" as an exact token match and pulled it to rank 1 in the`);
print(`text pipeline; RRF combined that with the vector pipeline's ranking. Same collection,`);
print(`same indexes mongot already built — one query, no second system.\n`);
