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
  const matchCount = approximateResults.filter(id => exactNeighbors.includes(id)).length;
  const recallBar = "█".repeat(matchCount * 2).padEnd(20, "░");
  print(`numCandidates=${numCandidates}  ${recallBar}  recall@10=${matchCount * 10}%`);
  return approximateResults;
}

print("truth (exact, ENN):"); printjson(exactNeighbors);
print("\nready — call recallAt(10), recallAt(150), recallAt(500), recallAt(5000), ...\n");
