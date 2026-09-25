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
const POPULAR_DOC_COUNT = 4975;
const TARGET_TENANT_DOC_COUNT = 25;
const POPULAR_CLUSTER_AXIS = 0;   // popular docs cluster near this axis (close to the query)
const TARGET_CLUSTER_AXIS = 7;    // target-tenant docs cluster near this axis (far from the query)
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

const rng = mulberry32(42);
const noise = () => (rng() - 0.5) * 0.1;

// Builds a vector that points mostly along one axis, with a little noise on every dimension —
// simulates an embedding that's semantically close to whatever "axis" represents.
function vectorNearAxis(axis) {
  const vector = Array.from({ length: DIM }, () => noise());
  vector[axis] += 1;
  return vector;
}

function buildPopularDocs() {
  const docs = [];
  for (let i = 0; i < POPULAR_DOC_COUNT; i++) {
    docs.push({
      title: `popular product ${i}`,
      tenant: 1 + Math.floor(rng() * 40),   // spread across tenants 1..40, never the target
      embedding: vectorNearAxis(POPULAR_CLUSTER_AXIS),
    });
  }
  return docs;
}

function buildTargetTenantDocs() {
  const docs = [];
  for (let i = 0; i < TARGET_TENANT_DOC_COUNT; i++) {
    docs.push({
      title: `tenant-${TENANT_TARGET} product ${i}`,
      tenant: TENANT_TARGET,
      embedding: vectorNearAxis(TARGET_CLUSTER_AXIS),
    });
  }
  return docs;
}

// Polls getSearchIndexes until mongot reports the index as queryable, or the timeout elapses.
// mongot builds the index asynchronously (Act I in action) — this wait makes that visible.
function waitForSearchIndex(collection, indexName, timeoutSeconds) {
  print("waiting for index to build...");
  for (let i = 0; i < timeoutSeconds; i++) {
    const index = collection.getSearchIndexes(indexName)[0];
    if (index && index.queryable) return true;
    sleep(1000);
  }
  return false;
}

const vsdemo = db.getSiblingDB("vsdemo");
vsdemo.products.drop();

const docs = [...buildPopularDocs(), ...buildTargetTenantDocs()];
vsdemo.products.insertMany(docs);

print(
  `inserted ${vsdemo.products.countDocuments()} docs; ` +
  `tenant ${TENANT_TARGET} = ${vsdemo.products.countDocuments({ tenant: TENANT_TARGET })}`
);

// Vector index + tenant declared as a FILTER field — the "filter" type is what enables
// pre-filtering (pushing the tenant predicate inside the HNSW graph walk).
vsdemo.products.createSearchIndex("vsindex", "vectorSearch", {
  fields: [
    { type: "vector", path: "embedding", numDimensions: DIM, similarity: "cosine" },
    { type: "filter", path: "tenant" },
  ],
});

const ready = waitForSearchIndex(vsdemo.products, "vsindex", INDEX_BUILD_TIMEOUT_SECONDS);
print(ready ? "index ready ✅" : "index NOT ready ❌ (is mongot running?)");
