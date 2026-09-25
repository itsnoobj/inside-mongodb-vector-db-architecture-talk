// Demo 2 — Recall, Measured
// Open this file in the IDE during the talk.

const QUERY_VECTOR = /* loaded from db at runtime */ [];
const TOP_K        = 10;

// ── Exact (ENN) — ground truth, the answer key ───────────────────────────────

db.getSiblingDB("vsdemo").items.aggregate([
  { $vectorSearch: {
      index:       "vsindex",
      path:        "embedding",
      queryVector: QUERY_VECTOR,
      exact:       true,
      limit:       TOP_K
  }},
  { $project: { _id: 0, docIndex: 1 } }
])


// ── Approximate (ANN) — tune numCandidates for recall ────────────────────────
//    Try: 10 → 150 → 500 → 5000

db.getSiblingDB("vsdemo").items.aggregate([
  { $vectorSearch: {
      index:         "vsindex",
      path:          "embedding",
      queryVector:   QUERY_VECTOR,
      numCandidates: 150,   // ← dial this up to improve recall
      limit:         TOP_K
  }},
  { $project: { _id: 0, docIndex: 1 } }
])
