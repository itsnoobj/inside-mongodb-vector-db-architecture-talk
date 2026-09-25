const target       = db.getSiblingDB('vsdemo');
const QUERY_VECTOR = target.meta.findOne({ _id: "q" }).q;
const TOP_K        = 10;

const exactPipeline = [
  { $vectorSearch: {
      index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR,
      exact: true, limit: TOP_K
  }},
  { $project: { _id: 0, docIndex: 1 } }
];

function annPipeline(numCandidates) {
  return [
    { $vectorSearch: {
        index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR,
        numCandidates, limit: TOP_K
    }},
    { $project: { _id: 0, docIndex: 1 } }
  ];
}

function extractIds(pipeline) {
  return target.items.aggregate(pipeline).toArray().map(doc => doc.docIndex);
}

const exactNeighbors = extractIds(exactPipeline);

function recallAt(numCandidates) {
  const results    = extractIds(annPipeline(numCandidates));
  const matchCount = results.filter(id => exactNeighbors.includes(id)).length;
  const bar        = "█".repeat(matchCount * 2).padEnd(20, "░");
  print(`numCandidates=${numCandidates}  ${bar}  recall@10=${matchCount * 10}%`);
  return results;
}

print("truth (exact, ENN):"); printjson(exactNeighbors);
print("\nready — call recallAt(10), recallAt(150), recallAt(500), recallAt(5000)\n");
