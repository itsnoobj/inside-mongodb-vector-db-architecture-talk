/* Demo 2 — ENN as ground truth (seed).
 * 10k random 32-d vectors + a float HNSW index. Also stashes a fixed query vector
 * so recall.js compares exact vs approximate on the SAME query every run.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file seed.js
 */
const DIM = 32;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(7);
const vec = () => Array.from({length: DIM}, () => rng() * 2 - 1);

const target = db.getSiblingDB('vsdemo');
target.items.drop();
const docs = [];
for (let i = 0; i < 10000; i++) docs.push({ n: i, embedding: vec() });
target.items.insertMany(docs);
print(`inserted ${target.items.countDocuments()} docs`);

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

// stash a fixed query vector for recall.js (same RNG stream → deterministic)
target.meta.replaceOne({ _id: "q" }, { _id: "q", q: vec() }, { upsert: true });
print("query vector stashed in vsdemo.meta");
