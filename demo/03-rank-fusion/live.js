/* Demo 3 — load once, then drive live from the mongosh prompt.
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/live.js
 */
const vsdemo = db.getSiblingDB("vsdemo");
const meta = vsdemo.meta.findOne({ _id: "rankfusion-query" });

function vectorOnly(){
  const results = vsdemo.errors.aggregate([
    { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } },
    { $project: { _id: 0, title: 1, content: 1, score: { $meta: "vectorSearchScore" } } },
  ]).toArray();
  results.forEach((r, i) => print(`${i + 1}. ${r.title}`));
  return results;
}

function rankFusion(){
  const results = vsdemo.errors.aggregate([
    { $rankFusion: {
        input: { pipelines: {
          vector: [{ $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } }],
          text: [
            { $search: { index: "search_index", phrase: { query: meta.text, path: "content" } } },
            { $limit: 5 },
          ],
        }},
    }},
    { $limit: 5 },
    { $project: { _id: 0, title: 1, content: 1 } },
  ]).toArray();
  results.forEach((r, i) => print(`${i + 1}. ${r.title}`));
  return results;
}

print(`query text: "${meta.text}"`);
print("ready — call vectorOnly(), rankFusion()\n");
