const target       = db.getSiblingDB('vsdemo');
const QUERY_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0];
const TENANT_ID    = 42;

const trapPipeline = [
  { $vectorSearch: {
      index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR,
      numCandidates: 150, limit: 10
  }},
  { $match:   { tenant: TENANT_ID } },
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
];

const fixPipeline = [
  { $vectorSearch: {
      index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR,
      filter: { tenant: { $eq: TENANT_ID } },
      numCandidates: 15, limit: 10
  }},
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
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
