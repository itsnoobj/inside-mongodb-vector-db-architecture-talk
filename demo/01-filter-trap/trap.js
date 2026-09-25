/* Demo 1 — the TRAP: vector search first, filter by tenant AFTER. Watch it starve.
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file trap.js
 */
const target = db.getSiblingDB('vsdemo');
const QUERY = [1, 0, 0, 0, 0, 0, 0, 0];   // points straight at the "popular" cluster

const searchResults = target.products.aggregate([
  { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: QUERY, numCandidates: 150, limit: 10 } },
  { $match: { tenant: 42 } },                                          // <-- post-filter, too late
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
]).toArray();

print(`\nAsked for 10 tenant-42 results. Got: ${searchResults.length}`);
printjson(searchResults);
print("\nThe top 150 candidates are all popular-cluster docs — the post-filter throws every one away.\n");
