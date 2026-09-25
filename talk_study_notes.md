# Inside MongoDB Vector Search — Study Notes

Slide-by-slide depth notes for the presenter. Read to *know the machine*, not the API.
One-line spine: **one `$vectorSearch` query hides two engineering bets — architecture (`mongot`) and compression (quantization).**

Verified against mongodb.com / voyageai.com docs (2026-09-14). MongoDB 8.2+, Community & Enterprise, self-managed or Atlas.

---

## 1. Title
- Sets frame: this is the *under-the-hood* talk, not intro-to-embeddings.
- Positioning: complement to the "Understanding Semantic Search with Atlas" intro talk — open *past* the basics.

## 2. This Is All It Takes
- Show the 6-line `$vectorSearch`: `index`, `path`, `queryVector`, `numCandidates`, `limit`.
- Punchline: "Six lines. One stage. This talk is everything under the waterline."
- Promise to the audience: leave knowing the **machine**, not the API.

## 3. Two Bets Hiding Under One Query
- The whole talk in one slide: **Architecture** (where the index lives) + **Compression** (how billions of numbers fit in RAM).
- Each is a deliberate engineering bet, not an accident.

## 4. Transition — Recap
- Visual break. Signals: quick basics refresh, skippable if the intro talk already ran.

## 5. Recap: An Embedding Is Meaning as Numbers
- Text → array of floats; similar meaning → similar numbers.
- Analogy: "a GPS coordinate for meaning."
- Keep to one line if audience already saw it.

## 6. Recap: "Close" Is Just Distance
- 2 points → Pythagoras `c = √(a² + b²)`; scale up → **cosine similarity**.
- Cosine compares **direction, not length** → vector magnitude never distorts meaning.
- Same idea holds in 1024 dims.

## 7. Transition — "So why not just index it like any other field?" (image)
- Full-bleed question slide (`transition-why-index.png`), act-1 style.
- Plants the tension: every DB is built to index fields → audience assumes this is easy → slide 8 pulls the rug.

## 8. Recap: Why a Normal Index Can't Do This
- B-tree **sorts** → binary search, O(log n).
- A vector has **no sort order** — no "less than" in 1024 dims.
- So exact search must check *every* vector → too slow at scale. Motivates ANN.

## 9. Transition — "Enough theory. Now — into MongoDB." (image)
- Full-bleed pivot slide (`transition-into-mongodb.png`), synthesis two-line style.
- Closes the first-principles recap; grounds the rest in a real MongoDB document.

## 10. Recap: In MongoDB, a Vector Is Just a Field
- Vector lives in a normal BSON document as a plain array alongside `title`, `content`.
- "That's the input. Now — where does the *index* live?" → the hinge into the architecture deep-dive.

## 11. A Stored Vector Is Inert
- Layout: **big HNSW image on top, notes at the bottom** (single column, not split).
- A saved vector is just **data**: no `<` to sort, no `WHERE` finds "nearest."
- **HNSW** = navigable graph linking vectors; search **hops greedily** toward nearest neighbours, visiting a slice not all N.
- **ANN** = approximate: fast, ~99% as good as full scan.
- `numCandidates` = how many nodes the walk visits → the **recall ↔ latency** dial.
- Key line: storing is trivial; the **index** is the hard part — that's what `mongot` builds.

## 12. Transition — Architecture

## 13. The Obvious Design
- What everyone expects: index lives *inside* the DB, built inside the write/transaction, same process.
- MongoDB **deliberately doesn't** do this — and that one choice explains almost everything.

## 14. The Bet: A Second Process
- Two processes: `mongod` (data) + `mongot` (search/index). One connection string.
- The split is **invisible to the app**.
- **Talk-over:** One pattern under everything: never do search's work on the write path. MongoDB records the change and derives the index elsewhere, asynchronously. "Defer and derive" — every choice in this half (second process, change-stream sync, staleness, proxy) falls out of that refusal.

## 15. Two Engines, Opposite Physics
- **`mongod` / WiredTiger**: C++, OLTP, point reads/writes + txns, mutable B-trees updated in place, low-latency steady memory.
- **Lucene (`mongot`)**: JVM, search (text + vector), immutable segments + merges + HNSW, memory-hungry/bursty/GC-driven.
- Why separate: share one process and a search OOM kills the DB; a GC pause stalls writes. Different memory models + failure domains → different processes.
- MongoDB didn't *write* a vector index — reuses **Lucene** (20+ yrs, now with HNSW). One engine serves both `$search` (text) and `$vectorSearch`.
- **Why Lucene *fits* (deep, not just "mature"):** an HNSW graph is costly to build and **can't be edited in place**; Lucene's model is **immutable segments + background merges** — deletes are tombstones, an update writes a new segment, the graph is only ever *built*, never mutated. Same shape as an LSM-tree; a 20-yr-old design that happens to be perfect for vectors.
- **Talk-over:** Not just "Lucene is 20 years mature." The deeper reason: HNSW can't be edited in place, and Lucene's immutable-segment + background-merge model matches that constraint perfectly. Same shape as an LSM-tree. Reuse over rewrite, for a structural reason.

## 16. How `mongot` Stays in Sync
- `mongot` is a **downstream consumer of the change stream** (oplog → change stream → consume → build Lucene HNSW). Two phases.
- No index work inside the transaction commit window; indexing is **async, off the hot path**; writes never wait for the index.
- **Mental model (deep): `mongot` is a read replica that speaks Lucene.** The two phases = **initial sync** (full scan) then **tail the change stream** — the exact machinery a replica uses to come online and keep up. MongoDB reused replication; it didn't build a bespoke sync pipeline.
- Mental model: search indexing is a **subscriber, not a passenger**.
- Freshness = how far behind the stream `mongot` is (= replication lag).
- **Talk-over:** `mongot` is a read replica that speaks Lucene. The two phases = initial sync (full scan) then tail the change stream — exactly the machinery a replica uses to come online and keep up. MongoDB reused replication, it didn't build a bespoke sync pipeline.

## 17. Nobody Talks to `mongot` Directly
- `mongot` scores and returns **only `{_id, score}`** — it stores indexed fields, not the docs.
- `mongod` stays source of truth and **rehydrates** full docs before the rest of the pipeline.
- Why IDs not docs: no wholesale data duplication · `mongod` stays authoritative · results still flow into `$project`/`$lookup`.
- Cost: one id-lookup round trip. Sharded → `mongos` fans out and merges.

## 18. The Index Is a Materialized View (NEW — the big reframe)
- Ties slides 16–17 together: search never reads the collection — it reads a **derived, lagging view** a background process maintains.
- **The catch:** no **read-your-writes** for search — write a doc, search a moment later, it may not be indexed yet.
- **The subtlety:** staleness changes *which docs match*, never the freshness of the body — `mongod` rehydrates from source, so returned docs are always current.
- Punchline: **two consistency models in one query** — an eventually-consistent result set made of strongly-consistent documents.
- **Talk-over:** This is CQRS (write model vs read model) and a classic Materialized View. No read-your-writes for search — write a doc, search a millisecond later, it may not be indexed yet. But staleness only affects *which docs match*, never the freshness of the content (mongod rehydrates from source).

## 19. `$vectorSearch` Is Just a Pipeline Stage
- Results flow into `$lookup`, `$match`, `$group`, `$project` — joins/filters/reshaping in one query. This is *why a database*, not a bolt-on vector store.
- **Deep: it's a document *source*, not a filter** → must be the **first** stage. `mongod` delegates to `mongot`, gets ranked `{_id, score}`, streams them on.
- So every later stage runs **after** the ANN walk is done → makes pre-vs-post a **consequence**, not a rule to memorize:
  - A doc's **own** fields → pre-filter **inside** `$vectorSearch` (the `filter` field), else results get starved.
  - A pipeline `$match` runs **after** search → only correct for **joined/derived** data (e.g. `user.plan`).
- **Talk-over:** `$vectorSearch` must be first because it's a document *source*, not a filter — mongod delegates to mongot and streams the ranked IDs back. So everything after it runs *after* the ANN walk. Pre-vs-post is a consequence of that, not a rule to memorize.

## 20. Filtering: *Where* It Runs Decides If It Works
- Filter **after** search: HNSW returns its 10 nearest, `$match` throws most away → "asked for 10, got 1."
- The `filter` field pushes the predicate **inside HNSW** → the graph walk only visits matching docs.

## 21. Demo — The Filter Trap
- Post-filter (`$vectorSearch → $match:{tenant:42}`) → **Got: 0**.
- Pre-filter (`$vectorSearch:{ filter:{tenant:42} }`) → **Got: 10**.
- Same query, same data; only *where* the filter runs changed.
- Live on local MongoDB: `mongod` + `mongot` in one container.
- Demo detail: `tenant` must be declared as a `filter` field in the index for pre-filtering to work.

## 22. Bonus: Text + Vector, One Engine
- `mongot` already indexes both → fuse in one query with `$rankFusion` (v8.1+).
- Blends `vector` ($vectorSearch, semantic) + `text` ($search, BM25 keyword) via **Reciprocal Rank Fusion (RRF)**.
- **Deep: RRF fuses by *rank*, not score** — cosine (0–1) and BM25 (unbounded) aren't on the same scale, so adding them is meaningless. RRF discards scores and sums positions: `Σ 1/(k + rank)` (default k=60). Rank is the common currency.
- Payoff: keyword precision + semantic recall, no second system, no extra sync.
- **Talk-over:** Why fuse by rank? Cosine (0–1) and BM25 (unbounded) aren't comparable — adding them is meaningless. RRF discards raw scores and uses only position: sum of 1/(k + rank). Rank is the common currency.

## 23. The Two Kitchens (analogy)
- `mongod` = à la carte line (transactions, must be instant). `mongot` = prep kitchen watching the ticket stream.
- Prep kitchen can lag a few tickets — the line keeps serving at full speed.

## 24. Surviving a Crash: Resume Tokens
- Last processed change → **resume token**.
- Still in oplog window → resume + catch up.
- History gone / lost state → **re-sync (full rebuild)**.
- Usually just catches up. If it falls behind the oplog window, it rebuilds; queries stay up but read **stale** until caught up.

## 25. Where Does `mongot` Run? (topologies)
- Progression: **co-located** (dev) → **isolated / Search Nodes** (own host, under load) → **sharded** (scale out). Same query throughout.
- Sharded: each shard runs its own `mongot` over its own data → **HNSW is per-shard** → `numCandidates` applies **per shard**, `mongos` merges scored results.

## 26. Architecture — The Mental Model (recap)
1. Index doesn't live in the DB — it lives in `mongot`.
2. Syncs by **subscribing to the change stream** — off the write path.
3. `mongod` is just the **proxy**; app never sees the split.
4. Slight staleness = deliberate price for **isolation + independent scaling**.
- **One pattern under all four: never do search's work on the write path — defer and derive.** Lag, resume tokens, rehydration all fall out of that one choice.
- **Talk-over:** Pattern names if the room is technical: CQRS (mongod = write model, mongot = read model, async projection between); Materialized View (index is a derived view refreshed from the change stream); Event-log projection (oplog = append-only log, resume token = cursor, rebuild = replay); Proxy (GoF remote proxy — mongod stands in front of mongot); Bulkhead (separate processes = separate failure domains — a search OOM or GC pause can't sink the DB). Non-obvious tradeoff: this is PACELC, not CAP — no partition, so the axis is Latency vs Consistency, and MongoDB picks latency (writes never wait) at the cost of a slightly stale index.

## 27. Transition — Compression

## 28. Why Compression Isn't Optional
- RAM math: one vector = 1024 dims × 4 bytes ≈ **4 KB**.
- 1M → ~4 GB · 10M → ~40 GB · 100M → ~400 GB.
- HNSW wants those vectors **in RAM** → RAM is the bill.

## 29. Three Levers, Not One
- Quantization is just the **loudest** lever; there are three. Sets up the next three slides.

## 30. Lever ① — Fewer *Numbers* (dimensions)
- RAM scales with dimensions → halve dims, halve vector RAM.
- **Matryoshka (MRL)** training packs meaning into the front dims → truncating is safe.

## 31. Lever ② — Not All of It Has to Be in RAM (mmap)
- `mongot` is Lucene → reads its index through **`mmap`** → OS page cache: hot pages resident, cold fetched on demand.
- No hard "whole index must fit in RAM" wall → size for the **working set**, not the entire index.
- Caveat: still HNSW (not DiskANN); `mmap` just gives graceful spill for free. RAM can sit on its own Search Nodes.

## 32. Lever ③ — Fewer *Bits* per Number (quantization)
- Full precision is overkill for *finding* candidates; keep it only for final ranking.

## 33. `mongot` Quantizes Automatically
- Add one index field: `"quantization": "binary"` (or `"scalar"`) on the vector field.
- Done at **index-build time inside `mongot`**; **no ingestion change**; works on **existing** collections.
- Raw vectors stay on disk; the **compressed copy does the searching**.

## 34. Search Blurry, Rank Sharp (the key concept)
- **Search** = skim thumbnails (binary vectors, fast, approximate).
- **Rank** = open the full-res one (full-precision **rescore**, sharp).
- Flow: binary finds the neighbourhood fast → rescore candidates at full precision → sharp final ranking.
- Widen `numCandidates` for more recall.
- Numbers worth citing: scalar/int8 ≈ **3.75×** less RAM (~90%+ retention); binary/1-bit ≈ **~24×** less RAM (HNSW graph itself stays uncompressed, so not 32×), ~80% faster + rescoring pass. BSON BinData ≈ 38% storage cut.

## 35. Sizing: What Actually Needs to Be Hot
- working set ≈ **quantized vectors + HNSW graph** (raw float32 stays on disk).
- Per 1M × 1024d: raw float32 ~4 GB (disk) vs binary-quantized ~128 MB + graph (hot).
- Size RAM for the **quantized** working set — that's the number that sets the bill. Validate graph overhead on the real corpus.

## 36. Demo — Recall, Measured
- Exact (ENN) → true top-10 = the **answer key**.
- ANN `numCandidates=10` → recall@10 = 90%; `numCandidates=200` → 100%.
- Key idea: ANN and ENN live in the **same `$vectorSearch` stage** (`exact: true` for ENN) → grade the index **natively**, no external tool.
- **How to pick `numCandidates`:**
  - Start at **10–20 × `limit`**; over-request candidates. It must be **≥ `limit`** and **≤ 10,000** (hard cap).
  - Higher values usually improve recall but add latency: this is the **recall/latency dial**.
  - Treat it as an absolute candidate count tied to `limit` and the recall target, not primarily to total dataset size. A larger corpus may need a bump, but not one linear with N.
  - Measure rather than guess: use ENN (`exact: true`) top-k as ground truth, then raise `numCandidates` until recall plateaus; here, 10 gives 90% and 200 gives 100% recall@10.
  - Sharded: `numCandidates` applies per shard, so effective candidates = `numCandidates × shards`.
- **Talk-over:** How to pick `numCandidates`: start at 10–20 × `limit`. It must be ≥ `limit` and ≤ 10,000 (hard cap). Higher values improve recall but add latency — this is the recall/latency dial. Not dataset-size driven; it's an absolute candidate count tied to `limit` and the recall target. Measure: use ENN top-k as ground truth, raise until recall plateaus. Sharded: per-shard, so effective candidates = `numCandidates × shards`.

## 37. Transition — Synthesis

## 38. What's Now Clear
- 🏗️ Index lives in `mongot`, fed by the change stream — not in the DB.
- 🗜️ `mongot` quantizes at build time; searches blurry, ranks sharp.
- "In: the API. Out: the machine." — callback to the cold open.

## 39. Thank You
- Q&A. Repo QR.
- Footer facts: MongoDB 8.2+ · Community & Enterprise · self-managed on supported Linux (Docker/tarball) or Atlas.

---

## Patterns & Tradeoffs (speaker ammo — not slides)

**The one motif:** *defer and derive.* Record intent on the fast path (the oplog), build the expensive, differently-shaped structure asynchronously off to the side. Every named pattern below is a facet of that single move.

### Named patterns (drop these to signal depth)
- **CQRS (Command Query Responsibility Segregation)** — the most accurate single name for the whole design. Write model = `mongod`; read/search model = `mongot`; connected by an async, event-carried projection (the change stream). Separate models, eventually consistent.
- **Materialized View** (Fowler / DB pattern) — the search index *is* a materialized view of the collection, refreshed incrementally by replaying changes.
- **Event-log projection (Event-Sourcing–style)** — the oplog is an append-only event log; `mongot` is a projection built by replaying it. Resume token = cursor position; full rebuild = replay from the start. *(Caveat: MongoDB isn't event-sourced end-to-end; the oplog just behaves like the log here.)*
- **Proxy — GoF, specifically Remote Proxy** — `mongod` is a literal stand-in controlling access to `mongot`, forwarding search and reassembling results. One of the cleanest genuine GoF fits in the design.
- **Observer / Publish–Subscribe** — `mongot` subscribes to changes ("subscriber, not passenger"). GoF Observer = OO flavor; pub/sub = distributed flavor.
- **Bulkhead** (resilience, *Release It!*) — separate processes so a search OOM or JVM GC pause can't sink `mongod`. This is *the* name for "different failure domains." Strong, non-obvious drop.
- **Sidecar** (cloud-native) — co-located `mongot` augments `mongod` without living inside it.
- **Scatter–Gather / Fork–Join** (Enterprise Integration Patterns) — sharded query: `mongos` fans out to each shard's `mongot`, then merges + re-sorts.
- **Pipes and Filters** (POSA) — the aggregation pipeline itself; `$vectorSearch` is a *source* in that pipeline (why it must be first).
- **LSM-tree family** (log-structured merge) — Lucene's immutable segments + background merges are the LSM shape: never mutate in place, write new runs, compact later. Why HNSW fits Lucene.
- **Read replica / replication** — the headline mental model for `mongot` sync.

### Non-obvious tradeoffs ("I never thought of that")
- **PACELC, not just CAP.** No partition here, so the live tradeoff is the *ELC* half — **Else, Latency or Consistency.** MongoDB picks **Latency** (writes never wait) at the cost of **Consistency** (stale index). Naming PACELC on stage is a credibility flex.
- **You can't have read-your-writes for search AND write-path isolation.** Pick one. They picked isolation — a forced choice, not a limitation.
- **Two consistency models in one query** — eventually-consistent *result set*, strongly-consistent *documents*. Staleness decides *membership*, never *content*.
- **A delete doesn't shrink the index immediately.** Immutable segments → deletes are tombstones → space/RAM reclaimed only at merge. After a big delete, the quantized working set can stay large until compaction.
- **Horizontal scaling silently changes recall.** `numCandidates` is per-shard → effective candidates = `numCandidates × shards`. Add shards and recall shifts; the dial isn't global.
- **The architecture seam is also a licensing seam.** `mongot` is a separate, source-available (SSPL) process — the process boundary doubles as a product/business boundary.
- **Cost of the Proxy pattern = one extra hop + a rehydration round trip.** Paid deliberately for authority + zero data duplication.
- **Independent scaling = resource disaggregation.** The expensive part (HNSW RAM) lives on its own Search Nodes, so search RAM and OLTP throughput stop competing for the same box.
- **The whole design is one refactoring move** every backend engineer knows: *extract the expensive, differently-shaped work into its own service and feed it asynchronously* (service extraction / Strangler-ish). That familiarity is the "aha."

---

## Anticipated Q&A / deeper facts to hold in reserve
- **Voyage AI** (MongoDB-owned, acq. Feb 2025): quantization-aware training (model trained *knowing* it'll be squeezed → "trains at altitude"); MRL (2048→1024→512→256); shared embedding space (embed query with small model, docs with big one); `voyage-context-3` = contextualized chunk embeddings (fixes torn-out-paragraph problem). *(Embeddings deep-dive — cut from the deck; optional if asked.)*
- **Why Lucene?** 20+ years of search maturity; already powers `$search`; HNSW added — reuse over rewrite. (Deeper structural reason: immutable-segment/merge model fits HNSW — see slide 15.)
- **Freshness guarantee?** No strict SLA — eventual, bounded by replication/stream lag.
- **Is `mongot` open?** Source-available (SSPL), bundled and self-manageable.
- **ENN cost?** Exact scans everything — use for ground truth / small sets, not hot-path serving.
- **Sharding gotcha:** `numCandidates` is per-shard, so effective candidate pool scales with shard count.
