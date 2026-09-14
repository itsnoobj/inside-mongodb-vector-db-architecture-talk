/* Demo 1 — The Filter Trap (seed).
 *
 * Two clusters in vector space so the failure is deterministic on stage:
 *   - ~4975 "popular" docs sit NEAR the query direction, tenants 1..40 (never the target)
 *   - 25 target-tenant (42) docs sit FAR from the query (≈orthogonal → low cosine)
 * Result: the naive post-filter starves; the native `filter` field fixes it.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file seed.js
 */
const DIM = 8;
const TENANT_TARGET = 42;

// deterministic RNG (mulberry32) so every run of the demo is identical
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(42);
const noise = () => (rng() - 0.5) * 0.1;

// unit-ish vector pointing mostly along one axis (+ small noise)
function nearAxis(axis){ const v = Array.from({length:DIM}, () => noise()); v[axis] += 1; return v; }

const target = db.getSiblingDB('vsdemo');
target.products.drop();

const docs = [];
for (let i = 0; i < 4975; i++){                       // popular cluster, near query (axis 0)
  docs.push({ title: `popular product ${i}`, tenant: 1 + Math.floor(rng() * 40), embedding: nearAxis(0) });
}
for (let i = 0; i < 25; i++){                          // target tenant, parked far away (axis 7)
  docs.push({ title: `tenant-${TENANT_TARGET} product ${i}`, tenant: TENANT_TARGET, embedding: nearAxis(7) });
}
target.products.insertMany(docs);
print(`inserted ${target.products.countDocuments()} docs; tenant ${TENANT_TARGET} = ${target.products.countDocuments({tenant: TENANT_TARGET})}`);

// vector index + tenant as a FILTER field — the filter type is what enables pre-filtering
target.products.createSearchIndex("vsindex", "vectorSearch", {
  fields: [
    { type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" },
    { type: "filter", path: "tenant" }
  ]
});

// mongot builds the index asynchronously (Act I in action) — wait until queryable
print("waiting for index to build...");
let ready = false;
for (let i = 0; i < 90 && !ready; i++){
  const idx = target.products.getSearchIndexes("vsindex")[0];
  ready = idx && idx.queryable;
  if (!ready) sleep(1000);
}
print(ready ? "index ready ✅" : "index NOT ready ❌ (is mongot running?)");
