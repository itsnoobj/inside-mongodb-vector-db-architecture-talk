const vsdemo = db.getSiblingDB("vsdemo");
const meta   = vsdemo.meta.findOne({ _id: "rankfusion-query" });

const vectorOnlyPipeline = [
  { $vectorSearch: {
      index: "vsindex", path: "embedding", queryVector: meta.q,
      numCandidates: 20, limit: 5
  }},
  { $project: { _id: 0, title: 1, score: { $meta: "vectorSearchScore" } } }
];

const rankFusionPipeline = [
  { $rankFusion: {
      input: { pipelines: {
        vector: [
          { $vectorSearch: {
              index: "vsindex", path: "embedding", queryVector: meta.q,
              numCandidates: 20, limit: 5
          }}
        ],
        text: [
          { $search: { index: "search_index", phrase: { query: meta.text, path: "content" } } },
          { $limit: 5 }
        ]
      }}
  }},
  { $limit:   5 },
  { $project: { _id: 0, title: 1 } }
];

function vectorOnly() {
  const results = vsdemo.errors.aggregate(vectorOnlyPipeline).toArray();
  results.forEach((r, i) => print(`${i + 1}. ${r.title}`));
  return results;
}

function rankFusion() {
  const results = vsdemo.errors.aggregate(rankFusionPipeline).toArray();
  results.forEach((r, i) => print(`${i + 1}. ${r.title}`));
  return results;
}

print(`query: "${meta.text}"`);
print("ready — call vectorOnly(), rankFusion()\n");
