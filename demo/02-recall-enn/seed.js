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
const TOTAL_DOCS = 50000;
const CLUSTER_COUNT = 60;
const INDEX_BUILD_TIMEOUT_SECONDS = 90;

// Deterministic RNG (mulberry32) so every run of the demo produces identical data on stage.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(7);
const uniformRandom = () => rng() * 2 - 1;

// Box-Muller: standard normal from the same RNG stream (deterministic).
function sampleGaussian() {
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Cluster centers packed into a low-rank subspace (only first 8 of 128 dims vary):
// real embedding clusters are close together relative to their spread, which is what
// makes greedy HNSW descent ambiguous. Widely-separated clusters (full-dim random
// centers) give the walk no hard choices — recall pins at 100% regardless of
// numCandidates, which is the flat, boring result we're fixing.
const SUBSPACE_DIMENSIONS = 8;
const CENTER_SCALE = 0.6;
const clusterCenters = Array.from({ length: CLUSTER_COUNT }, () =>
  Array.from({ length: DIM }, (_, dimIndex) => dimIndex < SUBSPACE_DIMENSIONS ? uniformRandom() * CENTER_SCALE : 0));

// spread wide enough that neighbouring clusters overlap — near-duplicates across
// cluster boundaries are exactly what HNSW can misroute at low numCandidates
const CLUSTER_SPREAD = 0.5;

function makeVectorNearCenter(clusterCenter) {
  return clusterCenter.map(coord => coord + sampleGaussian() * CLUSTER_SPREAD);
}

function makeRandomClusterVector() {
  const randomCenter = clusterCenters[Math.floor(rng() * CLUSTER_COUNT)];
  return makeVectorNearCenter(randomCenter);
}

// Polls getSearchIndexes until mongot reports the index as queryable, or the timeout elapses.
// mongot builds the index asynchronously — this wait makes that visible.
function waitForSearchIndex(collection, indexName, timeoutSeconds) {
  print(`waiting for index "${indexName}" to build...`);
  for (let i = 0; i < timeoutSeconds; i++) {
    const index = collection.getSearchIndexes(indexName)[0];
    if (index && index.queryable) return true;
    sleep(1000);
  }
  return false;
}

const target = db.getSiblingDB('vsdemo');
target.items.drop();

const docs = [];
for (let docIndex = 0; docIndex < TOTAL_DOCS; docIndex++) {
  docs.push({ docIndex, embedding: makeRandomClusterVector() });
}
target.items.insertMany(docs);
print(`inserted ${target.items.countDocuments()} docs (${CLUSTER_COUNT} clusters, dim=${DIM})`);

target.items.createSearchIndex("vsindex", "vectorSearch", {
  fields: [{ type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" }]
});

const indexReady = waitForSearchIndex(target.items, "vsindex", INDEX_BUILD_TIMEOUT_SECONDS);
print(indexReady ? "index ready ✅" : "index NOT ready ❌ (is mongot running?)");

// stash a fixed query vector for live.js and check.js (same RNG stream → deterministic).
// Query lands near a cluster, same as any doc — that's the realistic case.
target.meta.replaceOne({ _id: "q" }, { _id: "q", q: makeRandomClusterVector() }, { upsert: true });
print("query vector stashed in vsdemo.meta");
