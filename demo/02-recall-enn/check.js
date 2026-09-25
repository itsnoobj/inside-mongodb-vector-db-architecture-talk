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
const QUERY_VECTOR = target.meta.findOne({ _id: "q" }).q;
const TOP_K = 10;

function runAggregationAndExtractIds(aggregationPipeline) {
  return target.items.aggregate(aggregationPipeline).toArray().map(doc => doc.docIndex);
}

const exactNeighbors = runAggregationAndExtractIds([
  { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR, exact: true, limit: TOP_K } },
  { $project: { _id: 0, docIndex: 1 } }
]);

function recallAt(numCandidates) {
  const approximateResults = runAggregationAndExtractIds([
    { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR, numCandidates, limit: TOP_K } },
    { $project: { _id: 0, docIndex: 1 } }
  ]);
  return approximateResults.filter(id => exactNeighbors.includes(id)).length / TOP_K;
}

const recallAtLowCandidates = recallAt(10);
const recallAtHighCandidates = recallAt(5000);

assert(recallAtLowCandidates < 1, `expected low numCandidates=10 recall < 100% (demo would be flat/boring), got ${recallAtLowCandidates * 100}%`);
assert(recallAtHighCandidates === 1, `expected numCandidates=5000 recall = 100% (ground truth reachable), got ${recallAtHighCandidates * 100}%`);
print(`check passed: recall@10 climbs from ${(recallAtLowCandidates * 100).toFixed(0)}% (numCandidates=10) to ${(recallAtHighCandidates * 100).toFixed(0)}% (numCandidates=5000)`);
