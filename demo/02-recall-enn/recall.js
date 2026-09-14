/* Demo 2 — measure ANN recall@10 against exact (ENN) ground truth, all in MongoDB.
 * ENN (exact:true) is the answer key; ANN with a small vs large numCandidates shows the dial.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file recall.js
 */
const target = db.getSiblingDB('vsdemo');
const QUERY = target.meta.findOne({ _id: "q" }).q;
const K = 10;

const ids = (pipe) => target.items.aggregate(pipe).toArray().map(d => d.n);

// ground truth: exact nearest neighbours — no numCandidates, scans everything
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
  return hit / K;
}

print("\nExact (ENN) top-10 = ground truth:");
printjson(truth);
print(`\nANN numCandidates=10   → recall@10 = ${(recallAt(10) * 100).toFixed(0)}%`);
print(`ANN numCandidates=200  → recall@10 = ${(recallAt(200) * 100).toFixed(0)}%`);
print("\nSame index, same query. numCandidates is the recall/latency dial —");
print("and ENN handed us the answer key for free, no external tool.\n");
