const target = db.getSiblingDB('vsdemo');
const QUERY_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0];   // points straight at the "popular" cluster
const TENANT_ID = 42;

function showTrap() {
  const searchResults = target.products.aggregate([
    { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR, numCandidates: 150, limit: 10 } },
    { $match: { tenant: TENANT_ID } },                                // <-- post-filter, too late
    { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
  ]).toArray();
  print(`\nAsked for 10 tenant-${TENANT_ID} results with post-filter. Got: ${searchResults.length}`);
  printjson(searchResults);
  print("\nThe top 150 candidates are all popular-cluster docs — the post-filter throws every one away.\n");
  return searchResults;
}

function showFix() {
  const searchResults = target.products.aggregate([
    { $vectorSearch: {
        index: "vsindex", path: "embedding", queryVector: QUERY_VECTOR,
        filter: { tenant: { $eq: TENANT_ID } },                       // <-- pre-filter, inside the index
        numCandidates: 15, limit: 10
    }},
    { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
  ]).toArray();
  print(`\nFilter pushed into $vectorSearch. Got: ${searchResults.length}`);
  printjson(searchResults);
  return searchResults;
}

print(`ready — call showTrap(), showFix()\n`);
