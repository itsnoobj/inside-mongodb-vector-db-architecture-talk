/* Self-check for Demo 2 — fails loudly if the recall sweep goes flat (the bug this
 * fixes): asserts recall@10 at the smallest numCandidates is below 100% and the largest
 * reaches 100%, so a future data/index change can't silently make the demo boring again
 * without breaking this check.
 *
 * Note: mongot's HNSW graph build has run-to-run randomness, so the exact recall% at a
 * fixed low numCandidates varies between index rebuilds — this check only asserts
 * "clearly not 100%" at the low end, not a specific number.
 *
 * Run after seed.js: mongosh "mongodb://localhost:27017/?directConnection=true" --file check.js
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
  return got.filter(n => truth.includes(n)).length / K;
}

const low = recallAt(10);
const high = recallAt(5000);

assert(low < 1, `expected low numCandidates=10 recall < 100% (demo would be flat/boring), got ${low * 100}%`);
assert(high === 1, `expected numCandidates=5000 recall = 100% (ground truth reachable), got ${high * 100}%`);
print(`check passed: recall@10 climbs from ${(low * 100).toFixed(0)}% (numCandidates=10) to ${(high * 100).toFixed(0)}% (numCandidates=5000)`);
