/* Demo 1 — the FIX: push the filter INTO $vectorSearch. mongot pre-filters inside the index.
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file fix.js
 */
const target = db.getSiblingDB('vsdemo');
const QUERY = [1, 0, 0, 0, 0, 0, 0, 0];   // same query as the trap

const searchResults = target.products.aggregate([
  { $vectorSearch: {
      index: "vsindex", path: "embedding", queryVector: QUERY,
      filter: { tenant: { $eq: 42 } },                                 // <-- pre-filter, inside the index
      numCandidates: 15, limit: 10
  }},
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
]).toArray();

print(`\nfilter pushed into $vectorSearch. Got: ${searchResults.length}`);
printjson(searchResults);
