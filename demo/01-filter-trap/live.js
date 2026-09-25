const target       = db.getSiblingDB('vsdemo');
const QUERY_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0];
const TENANT_ID    = 42;

const baseSearch   = { index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR, numCandidates: 150, limit: 10 };
const projectStage = { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } };

const trapPipeline = [
  { $vectorSearch: baseSearch },
  { $match: { tenant: TENANT_ID } },   // ← post-filter, outside the index
  projectStage
];

const fixPipeline = [
  { $vectorSearch: { ...baseSearch, filter: { tenant: { $eq: TENANT_ID } } } },   // ← pre-filter, inside the index
  projectStage
];

function showTrap() {
  const results = target.products.aggregate(trapPipeline).toArray();
  print(`\nPost-filter. Got: ${results.length}`);
  printjson(results);
  return results;
}

function showFix() {
  const results = target.products.aggregate(fixPipeline).toArray();
  print(`\nPre-filter. Got: ${results.length}`);
  printjson(results);
  return results;
}

print(`ready — call showTrap(), showFix()\n`);
