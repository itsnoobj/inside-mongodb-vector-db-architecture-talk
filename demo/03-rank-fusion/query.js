const QUERY_VECTOR = /* loaded from db at runtime */ [];
const QUERY_TEXT   = "ERR-4521 connection refused";

// ── Vector only — semantically close, misses the exact code ──────────────────

db.getSiblingDB("vsdemo").errors.aggregate([
  { $vectorSearch: {
      index:         "vsindex",
      path:          "embedding",
      queryVector:   QUERY_VECTOR,
      numCandidates: 20,
      limit:         5
  }},
  { $project: { _id: 0, title: 1, score: { $meta: "vectorSearchScore" } } }
])


// ── Rank Fusion — semantic + keyword, best of both ───────────────────────────

db.getSiblingDB("vsdemo").errors.aggregate([
  { $rankFusion: {
      input: { pipelines: {
        vector: [
          { $vectorSearch: {
              index:         "vsindex",
              path:          "embedding",
              queryVector:   QUERY_VECTOR,
              numCandidates: 20,
              limit:         5
          }}
        ],
        text: [
          { $search: { index: "search_index", phrase: { query: QUERY_TEXT, path: "content" } } },
          { $limit: 5 }
        ]
      }}
  }},
  { $limit:   5 },
  { $project: { _id: 0, title: 1 } }
])
