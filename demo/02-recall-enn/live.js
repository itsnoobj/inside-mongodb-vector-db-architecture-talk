/* Demo 2 — load once, then drive live from the mongosh prompt.
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/live.js
 */
const target = db.getSiblingDB('vsdemo');
const QUERY = target.meta.findOne({ _id: "q" }).q;
const K = 10;

const ids = (pipe) => target.items.aggregate(pipe).toArray().map(d => d.n);

const truth = ids([
  { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY, exact: true, limit: K } },
  { $project: { _id: 0, n: 1 } }
]);

function recallAt(numCandidates){
  const got = ids([
    { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY, numCandidates, limit: K } },
    { $project: { _id: 0, n: 1 } }
  ]);
  const hit = got.filter(n => truth.includes(n)).length;
  const bar = "█".repeat(hit * 2).padEnd(20, "░");
  print(`numCandidates=${numCandidates}  ${bar}  recall@10=${hit * 10}%`);
  return got;
}

print("truth (exact, ENN):"); printjson(truth);
print("\nready — call recallAt(10), recallAt(150), recallAt(500), recallAt(5000), ...\n");
