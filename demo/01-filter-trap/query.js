const QUERY_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0];
const TENANT_ID    = 42;

// ── Post-filter: $match runs *after* the index walk ──────────────────────────
//    The walk returns 150 candidates — all wrong tenant → 0 results.

db.getSiblingDB("vsdemo").products.aggregate([
  { $vectorSearch: {
      index:       "vsindex",
      path:        "embedding",
      queryVector: QUERY_VECTOR,
      numCandidates: 150,
      limit: 10
  }},
  { $match:   { tenant: TENANT_ID } },   // ← too late, outside the index
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
])


// ── Pre-filter: filter pushed *inside* the index walk ─────────────────────────
//    Only tenant-42 vectors are considered → 10 results.

db.getSiblingDB("vsdemo").products.aggregate([
  { $vectorSearch: {
      index:       "vsindex",
      path:        "embedding",
      queryVector: QUERY_VECTOR,
      filter:      { tenant: { $eq: TENANT_ID } },   // ← inside the walk
      numCandidates: 15,
      limit: 10
  }},
  { $project: { _id: 0, title: 1, tenant: 1, score: { $meta: "vectorSearchScore" } } }
])
