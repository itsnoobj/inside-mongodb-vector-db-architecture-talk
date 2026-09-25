# Demo run-of-show

Scripts print output only. Everything you say is talk-over — this doc is your script,
not the terminal's.

Setup, once:
```bash
cd demo
docker compose up -d
```

---

## Demo 1 — The Filter Trap → the Fix

**Setup**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/seed.js
```

**Talk-over:** vector search returns the *k* nearest, full stop. If you filter after the
fact, you can throw all *k* away and never notice until production. Watch.

**Run — the trap**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/trap.js
```
Output: `Got: 0`.

**Talk-over:** asked for 10 docs from tenant 42. Got zero. The post-`$match` ran *after*
`$vectorSearch` already picked its top 150 — and none of them belonged to tenant 42.

**Run — the fix**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/fix.js
```
Output: `Got: 10`.

**Talk-over:** one change — `filter` moved *inside* `$vectorSearch`. mongot filters
before it walks the graph, not after. Same query, same data, 0 → 10.

---

## Demo 2 — Recall, Measured (interactive)

**Setup**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/seed.js
```

**Show the data in Compass:** open `vsdemo.items`, point at the `vsindex` search index,
show it's `READY`. This is the corpus — 50k clustered vectors, nothing exotic.

**Talk-over:** how do you grade a search system without an external eval tool? MongoDB
runs exact search (ENN) in the *same* `$vectorSearch` stage — that's your free answer key.

**Load the live helpers**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true"
> load("02-recall-enn/live.js")
```
Prints the ENN ground truth (`truth`) — the 10 IDs any ANN run should return.

**Run it live, low first:**
```js
recallAt(10)
```
Output: a short bar, recall well under 100%. **We don't get it.**

**Talk-over:** `numCandidates=10` — HNSW's walk stopped early, missed most of the answer
key. This is the trap: too low, and you're silently serving bad results.

> **Rehearsal note:** mongot's HNSW graph build has run-to-run randomness, so the exact
> recall% at `numCandidates=10` can vary between index rebuilds (usually 0–60%, sometimes
> higher). Run `recallAt(10)` once during soundcheck; if it's not convincingly low that
> day, try `recallAt(5)`... down to whatever `numCandidates >= limit (10)` allows, or
> re-run `seed.js` to rebuild the index and get a new draw.

**Raise the dial, live, a few times:**
```js
recallAt(150)
recallAt(500)
recallAt(5000)
```
Bar grows each call, hits 100% at the top.

**Talk-over:** same index, same query, one number changed. `numCandidates` is the
recall/latency dial — and you just measured it, live, with no external tool.

---

## Demo 3 — Vector Misses the Exact Code, BM25 Catches It (interactive)

**Setup**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/seed.js
```

**Show the data in Compass:** open `vsdemo.errors` — 5 short docs, all about
"connection timeout" errors. Only one contains the literal code `ERR-4521`.

**Talk-over:** if I search for the exact error code a user pasted from a log line, will
vector search find it?

**Load the live helpers**
```bash
mongosh "mongodb://localhost:27017/?directConnection=true"
> load("03-rank-fusion/live.js")
```

**Run vector-only, live:**
```js
vectorOnly()
```
Output: ranked titles — the doc with `ERR-4521` is **last**, #5.

**Talk-over:** we don't get it. Every doc is about the same topic, so they all look
equally close in vector space. Embeddings compress `ERR-4521` and `ERR-4522` into
"nearby," not "identical." The one doc with the exact code the user asked for is buried.

**Run rank fusion, live:**
```js
rankFusion()
```
Output: same doc jumps to **#1**.

**Talk-over:** one query, `$rankFusion`, no second system. BM25 matched the literal
token `ERR-4521` as an exact phrase; vector search supplied the semantic ranking for
everything else. MongoDB blends both with Reciprocal Rank Fusion — same collection, same
indexes it already built.

---

## Reset between full run-throughs
```bash
docker compose down -v
docker compose up -d
```

## Sanity checks (not for stage — run once after any script edit)
```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/check.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/check.js
```
