/* Demo 2 — ENN as ground truth (seed).
 * 50k clustered 128-d vectors (200 tight Gaussian blobs, real-embedding-like) + a float
 * HNSW index. Clustering matters: uniform-random vectors give HNSW nothing to get lost
 * in, so recall pins at 100% even at numCandidates=10 — boring and unrealistic. Real
 * embeddings crowd into semantic neighbourhoods, which is exactly what makes ANN
 * search approximate. Also stashes a fixed query vector so recall.js compares exact vs
 * approximate on the SAME query every run.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file seed.js
 */
const DIM = 128;
const N = 50000;
const CLUSTERS = 60;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(7);
const uniform = () => rng() * 2 - 1;
// Box-Muller: standard normal from the same RNG stream (deterministic).
function gaussian(){
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
// Cluster centers packed into a low-rank subspace (only first 8 of 128 dims vary):
// real embedding clusters are close together relative to their spread, which is what
// makes greedy HNSW descent ambiguous. Widely-separated clusters (full-dim random
// centers) give the walk no hard choices — recall pins at 100% regardless of
// numCandidates, which is the flat, boring result we're fixing.
const SUBSPACE = 8;
const CENTER_SCALE = 0.6;
const centers = Array.from({length: CLUSTERS}, () =>
  Array.from({length: DIM}, (_, d) => d < SUBSPACE ? uniform() * CENTER_SCALE : 0));
// spread wide enough that neighbouring clusters overlap — near-duplicates across
// cluster boundaries are exactly what HNSW can misroute at low numCandidates
const SPREAD = 0.5;
const vecNear = (center) => center.map(c => c + gaussian() * SPREAD);
const vecAny = () => vecNear(centers[Math.floor(rng() * CLUSTERS)]);

const target = db.getSiblingDB('vsdemo');
target.items.drop();
const docs = [];
for (let i = 0; i < N; i++) docs.push({ n: i, embedding: vecAny() });
target.items.insertMany(docs);
print(`inserted ${target.items.countDocuments()} docs (${CLUSTERS} clusters, dim=${DIM})`);

target.items.createSearchIndex("vsindex", "vectorSearch", {
  fields: [ { type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" } ]
});

print("waiting for index to build...");
let ready = false;
for (let i = 0; i < 90 && !ready; i++){
  const idx = target.items.getSearchIndexes("vsindex")[0];
  ready = idx && idx.queryable;
  if (!ready) sleep(1000);
}
print(ready ? "index ready ✅" : "index NOT ready ❌ (is mongot running?)");

// stash a fixed query vector for recall.js (same RNG stream → deterministic).
// Query lands near a cluster, same as any doc — that's the realistic case.
target.meta.replaceOne({ _id: "q" }, { _id: "q", q: vecAny() }, { upsert: true });
print("query vector stashed in vsdemo.meta");
