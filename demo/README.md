# Demos — Inside MongoDB Vector Search

Two short, non-obvious demos that run entirely on open-source MongoDB in one container.
No embedding API, no npm — just Docker + `mongosh`. Vectors are synthetic and seeded
with a fixed RNG, so every run looks identical on stage.

## Prerequisites

- Docker
- `mongosh` (MongoDB Shell)

## Start the container (mongod + mongot)

```bash
cd demo
docker compose up -d
```

`mongodb/mongodb-atlas-local` bundles `mongod` **and** `mongot`, so `$vectorSearch` and
`createSearchIndex` work locally — the same two-process engine from Act I.

Connection string: `mongodb://localhost:27017/?directConnection=true`

---

## Demo 1 — The Filter Trap → the Fix

**Point:** vector search returns the *k* nearest, then a post-filter can throw them all
away — "asked for 10, got 0." MongoDB's native `filter` field pre-filters *inside* the
index and fixes it.

```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/seed.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/trap.js   # → Got: 0
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/fix.js    # → Got: 10
```

The only difference between `trap.js` and `fix.js`: the trap does `$match` *after*
`$vectorSearch`; the fix puts `filter` *inside* it. `tenant` is declared as a `filter`
field in the index — that's what makes pre-filtering possible.

*Synthetic → real:* the "popular cluster" ≈ documents semantically close to the query;
the far tenant-42 cluster ≈ a rare tenant whose docs aren't near the query. Same trap.

## Demo 2 — ENN as Ground Truth (recall you can measure)

**Point:** MongoDB does both **approximate** (ANN) and **exact** (ENN) nearest neighbour
in the *same* `$vectorSearch` stage. So exact search is your free answer key — grade the
approximate index against it and turn the `numCandidates` dial.

```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/seed.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/recall.js
```

Expect recall@10 to climb as `numCandidates` grows (10 → 200). Same index, same query —
`numCandidates` is the recall/latency dial, measured natively.

## Demo 3 — Vector Misses the Exact Code, BM25 Catches It

**Point:** embeddings compress exact tokens (error codes, IDs, SKUs) into "nearby," not
"identical." Vector search alone can't tell `ERR-4521` from `ERR-4522`. `$rankFusion`
blends vector (semantic) with `$search` (BM25 keyword) in one query — no second system.

**Requires MongoDB 8.0+** for `$rankFusion`.

```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/seed.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/vector-only.js   # misses the exact code
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/rank-fusion.js   # BM25 pulls it to rank 1
```

All 5 seeded docs are semantically close (same "timeout/connection error" topic) — that's
deliberate. It means vector search alone can't distinguish "the doc with the exact code
you asked for" from "a similar-sounding decoy." BM25 can, because it matches the literal
token `ERR-4521`. `$rankFusion` combines both rankings via Reciprocal Rank Fusion.

---

## Stop / reset

```bash
docker compose down -v
```

> Index builds are asynchronous (mongot consumes the change stream). The seed scripts
> poll `getSearchIndexes(...).queryable` and wait until the index is ready before exiting.
