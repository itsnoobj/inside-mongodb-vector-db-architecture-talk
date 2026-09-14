# Talk Ideas — Draft

_Working notes. Two tracks: (A) the MongoDB Community Edition talk (same lane, refreshed), (B) genuinely different AI-space talks for when the vector-search talk feels stale._

---

## Track A — MongoDB Community Edition: Vector Search Runs Anywhere Now

### The hook (why now)
Until **Sept 2025**, vector search in MongoDB was **Atlas-only**. At MongoDB.local NYC
(2025-09-17) MongoDB announced — and has since GA'd — native **Search + Vector Search
for Community Edition and Enterprise Server**. Requires **MongoDB 8.2+**. Powered by a
separate source-available process, **`mongot`** (Lucene-based, SSPL). `$search` /
`$vectorSearch` now have functional parity with Atlas.

> The news your user group cares about: "month 8" used to mean "migrate to Atlas."
> Not anymore — you can run it in your own infra.

### The spine (what makes it different from the pgvector talk)
**pgvector = one process. MongoDB = two processes (`mongod` + `mongot`), even in Community.**
The index does NOT live in your database. It lives in a Lucene sidecar that syncs from
`mongod` via change streams. Every design trade-off in the talk hangs off this contrast.

### Outline (reuses the existing presenterm structure/visual language)
1. **Title + "Why now"** — reuse Month 1→10 timeline; add "until Sept 2025 = Atlas-only."
2. **Ch.1 Embeddings & distance** — reuse fundamentals (GPS-for-meaning, cosine is king).
   Show a MongoDB doc with a vector as a plain BSON array.
3. **Ch.2 The two-process architecture** ⭐ NEW/UNIQUE — `mongod` (data) + `mongot`
   (HNSW index), change streams sync. Contrast pgvector single-process. Trade-off:
   more to operate vs. search load isolated from OLTP.
4. **Ch.3 `$vectorSearch` in practice** — aggregation stage; ANN vs ENN (exact);
   `numCandidates`/`limit`. The "always LIMIT" lesson maps to `numCandidates` tuning.
5. **Ch.4 The scale wall** — reuse RAM-math table (Lucene HNSW = same physics).
   MongoDB levers: scalar + binary quantization (built into `mongot`),
   automated embeddings (Voyage AI, MongoDB-owned).
6. **Ch.5 Silent failures — with a twist** ⭐ best contrast slide — `$vectorSearch` has a
   native `filter` field (pre-filter inside `mongot`), sidestepping the pgvector
   post-filter "asked for 10, got 0" trap. Recall drift still applies unchanged.
7. **Decision matrix** — Community vs Atlas vs pgvector vs dedicated DB.
   Golden rule still holds: "start with what you already run."
8. **Appendices** — quantization table; hybrid search (`$search` BM25 + `$vectorSearch`
   via `$rankFusion` / RRF); Docker setup.

### Live demo (local, Community)
`mongodb/mongodb-atlas-local` Docker image bundles `mongod` + `mongot` in one container.
Mirror the existing `scripts/` flow: seed docs → create vector search index →
run `$vectorSearch` → show filtered search working where pgvector struggles.

### Open decisions
1. Framing: Community-first + pgvector-contrast thread (recommended) vs full comparison.
2. Length: match ~20 min / ~25 slides.
3. Demo: slides only, or also draft Docker + `$vectorSearch` scripts.
4. Assets: reuse existing GIFs/diagrams vs new MongoDB-specific ones.

---

## The bar for these tracks
AI × MongoDB is the hook, but each track must carry a **deep, teachable concept** — the
equal of how the pgvector talk taught HNSW (6-degrees-of-separation), quantization
(search-blurry/rank-sharp), and DiskANN. MongoDB is NOT a logo slap; it's the thing whose
internals you explain. Verified conceptual pillars below (all real, all MongoDB 8.2+/Voyage).

---

## Track D — "Deep innovation inside MongoDB" ⭐ closest to the pgvector talk's DNA
Three internal mechanisms, each meaty enough to anchor a chapter. Pick 2–3.

### Pillar D1. The two-kitchen architecture: change-stream index building
**The concept:** pgvector builds its index *inside* the transaction. MongoDB refuses to.
`mongot` is a **downstream consumer of `mongod`'s change streams** — it builds Lucene
HNSW indexes *outside the transaction commit window*, asynchronously, so search indexing
never touches your write path. `mongod` proxies queries to `mongot` and reassembles results;
you never talk to `mongot` directly.
- Teachable depth: oplog → change stream → async index build → **replication lag = index
  freshness**. The trade-off pgvector doesn't have: your search can be milliseconds stale,
  in exchange for zero write-path impact. That's a real architectural bet, not a feature.
- Analogy (HNSW-style): **two kitchens.** `mongod` = à la carte line taking orders
  (transactions, must be instant). `mongot` = prep kitchen watching the order ticket stream,
  pre-building mise en place. The prep kitchen can lag a few tickets — that's the freshness
  trade-off — but it never slows the line.
- Why fresh: nobody at a Mongo meetup can cleanly explain *why* it's two processes. This does.

### Pillar D2. Automatic quantization + rescoring, done by `mongot`
**The concept:** same compression physics as your pgvector talk, but MongoDB does it at
**index-build time inside `mongot`** — you store raw float vectors, add one `quantization`
field to the index, and it works on existing collections with zero ingestion changes.
- Numbers to teach: scalar/int8 → **3.75x** less RAM, ~90%+ retention; binary/1-bit →
  **~24x** less RAM, ~80% faster queries, **+ rescoring pass** to recover accuracy.
  BSON binary format → ~38% storage cut.
- Analogy: reuse **search-blurry / rank-sharp** — binary index finds the neighborhood fast,
  rescoring with fuller precision picks the winner. Direct parallel to your BQ+rerank slide.
- Contrast slide: pgvector = you hand-write the two-stage query (ADD COLUMN, binary_quantize,
  candidate CTE). MongoDB = one index field, `mongot` runs the rescore for you.

### Pillar D3. Voyage AI: quantization-aware + Matryoshka embeddings ⭐ the deepest idea
**The concept — and it's genuinely deeper than the pgvector talk went.** The pgvector talk
treated the embedding model as *fixed* and compressed it *after the fact*. MongoDB owns
Voyage AI (acq. Feb 2025), whose models are trained to be compressed:
- **Quantization-aware training:** the model is trained *knowing* it'll be squeezed to int8
  or binary, so it packs meaning into bits that survive rounding. Analogy: an athlete who
  **trains at altitude** so low-oxygen race day doesn't wreck them — vs post-hoc quantization,
  which is JPEG-ing a photo after it's shot.
- **Matryoshka (MRL):** one model emits 2048 → 1024 → 512 → 256 dims, truncatable with
  minimal quality loss. Reuse your nesting-dolls analogy — but now it's MongoDB's own model.
- **Shared embedding space:** embed the *query* with a tiny model (voyage-4-lite) and the
  *documents* with the big one (voyage-4-large) — same space, cheaper queries. Neat trick.
- **voyage-context-3 (contextualized chunk embeddings):** solves the chunking problem —
  a torn-out paragraph loses what "it" refers to; this bakes global doc context into each
  chunk's vector. A real, deep RAG failure mode with an elegant fix.
- Compose them: MRL 256d + binary = the same "192x compression" punchline, but principled.

---

## Track E — "Evals done right" with a MongoDB-native twist
The RAG talk everyone gives is the happy path; this one is **how to prove retrieval works.**
- **Deep concept:** recall@k vs latency (reuse your curve), LLM-as-judge, golden sets,
  offline vs online (canary) eval, drift detection.
- **The MongoDB-native killer angle:** MongoDB supports **both ANN and ENN** (exact nearest
  neighbor) in `$vectorSearch`. So you generate **ground truth with ENN** (the answer key in
  the back of the book) and grade your **ANN** index against it — recall measured natively,
  no external tool needed. That's a genuinely MongoDB reason for an evals talk to exist.
- Store it in Mongo: eval sets, runs, drift history as collections; alert on regression.
- Demo: run ENN to get true top-10, run ANN, compute recall live; then quantize and watch
  recall move — the whole feedback loop inside one database.

---

## Track F — "Agentic systems, done right" — memory is a database problem
Reframe the agent hype as an architecture problem: an agent is a while-loop that lives or
dies on **memory + state + durable execution**.
- **Deep concept (the teachable meat):** memory *types* — working (scratchpad),
  episodic (what happened), semantic (learned facts) — and why each maps to a different
  storage access pattern. The "context rot" failure mode. Checkpointing / durable execution
  so an agent survives a crash mid-task.
- **MongoDB reason-to-exist:** one store covers all three — documents for working/episodic
  state, `$vectorSearch` for semantic memory, change streams for multi-agent coordination,
  and the document model for durable checkpoints. Self-hosted on Community.
- Analogy: human memory — short-term (RAM), episodic diary, and semantic knowledge — and how
  a good agent needs all three, not just a bigger prompt.
- Demo: ~50-line agent live; MongoDB holds all three memory types + an audit trail; show it
  break (context rot / infinite loop), then fix with proper memory + a checkpoint replay.

---

## Recommendation (given "deep concepts, different, MongoDB-relevant")
- **Track D** is the truest heir to the pgvector talk — same "here's the clever internal
  mechanism" energy, and it's the one a MongoDB user group *should* hear because almost
  nobody can explain the two-process design or quantization-aware embeddings. Lead with
  **D1 (two kitchens) + D3 (quantization-aware/Matryoshka)** — architecture + the deepest idea.
- **Track E** if you want the "everyone's RAG is silently broken" edge with a native hook
  (ENN-as-ground-truth is the memorable, defensible MongoDB angle).
- **Track F** if you want to ride the agent wave while still teaching real architecture.

Strongest single talk for THIS brief: **Track D, chapters D1 + D2 + D3** — it's literally
"the pgvector deep-dive, but MongoDB's own innovations," which is exactly the format you know
works and the audience hasn't seen.

---

## Next step
Pick a track (A, D, E, F — or specific pillars like D1+D3) and I'll draft the full
`presenterm` deck + demo scripts in the same style as the existing talks.
Leaning **Track D (D1+D2+D3)** unless you say otherwise.

---

# ✅ CHOSEN DIRECTION — Track D, MongoDB-only deep-dive

**Decision:** MongoDB-focused only. No pgvector, no contrast with other DBs. Framing =
"understanding / dissecting MongoDB" — a concepts deep-dive, curiosity-driven, NOT a
prod-war-stories talk. Expand the D1 architecture narrative. Keep E/F as optional
end nuggets only.

**Design rules:**
- Keep intellectual *tension* via "the obvious way you'd expect it to work" vs
  "the bet MongoDB actually made" — never name another product.
- Stakes = curiosity + making better sizing/deployment calls, not "our bill tripled."
- Depth over breadth: three bets, taught properly.

## Title candidates
Descriptive/three-pillar titles chosen deliberately to signal DEPTH (a clever one-liner
can read as shallow). Must not be mistaken for a beginner talk.
- ⭐ **Inside MongoDB Vector Search: Architecture, Quantization & Smarter Embeddings**
  _(subtitle: what actually happens beneath a `$vectorSearch` query)_ — RECOMMENDED
- The Engine Behind `$vectorSearch`: How MongoDB Search Really Works
- MongoDB Vector Search Internals: `mongot`, Quantization & Voyage Embeddings
- Semantic Search at Scale: Inside MongoDB's Search Engine
- From Query to Vectors: Dissecting MongoDB's Search Architecture

## Positioning (vs another speaker at the same MongoDB HYD group)
Another speaker is giving **"Understanding Semantic Search with MongoDB Atlas"** — an INTRO:
keyword → semantic, embeddings basics, build a simple app, on Atlas. This talk is the
deliberate **"part 2 / under-the-hood" complement**:
- DO NOT re-teach embeddings / semantic-search basics — that talk owns it. Open *past* it:
  "you know what vector search is; today we open the engine that runs it."
- Differentiator: their talk = Atlas (managed). This talk = **the engine itself (`mongot`)
  that now runs anywhere** — architecture, internals, self-managed. Zero overlap.
- Net effect: positions the speaker as the group's architecture/internals voice.

## Spine
One line of `$vectorSearch` hides three deep engineering bets — on **architecture**, on
**compression**, and on the **embeddings themselves**. Let's open the box.

## Narrative arc
- **Cold open — the one-liner & the iceberg.** Show a 6-line `$vectorSearch`. "This is all
  you write; this talk is everything under the waterline." Promise: leave knowing the
  machine, not the API.

- **Act 0 — Fast basics recap (SELF-CONTAINED, but COMPRESSIBLE on the day).**
  Rationale: keep the deck a complete package for the repo/recording, but if the earlier
  intro talk ("Understanding Semantic Search with MongoDB Atlas") already covered it, breeze
  through in ~2–3 min. ~3–4 slides, each a single crisp idea, no demo:
  - Embeddings = text → numbers that capture meaning (GPS-for-meaning, one line).
  - Distance = cosine (direction, not magnitude) — one visual.
  - ANN vs exact: "approximate is good enough" — one line + the recall/speed idea.
  - A stored MongoDB doc with a vector field → segue: "that's the input; now the engine."
  Design so slides can be SKIPPED without breaking flow (speaker says "you saw this earlier,
  here's the one-slide version" and moves on).

- **Act I — The Architecture Bet (D1, expanded — heart of the talk).**
  - Obvious expectation: index lives in the DB, built as you write.
  - MongoDB's bet: a second process, `mongot`, that watches data and builds the index
    outside the write path.
  - Machinery: oplog → change streams → `mongot` consumes → Lucene HNSW; `mongod` = query
    proxy (never talk to `mongot` directly).
  - Durability: resume tokens — crash recovery / catch-up without missing changes.
  - Trade-off as a feature: replication lag = index freshness; writes untouched, search
    scales independently.
  - Topologies: co-located (dev) → dedicated Search Nodes (isolation) → sharded (`mongos`
    fan-out + merge). When to pick which.
  - Analogy: two kitchens — à la carte line (instant) vs prep kitchen (watches ticket
    stream, can lag, never slows the line).

- **Act II — The Compression Bet (D2).**
  - Forced by RAM math (vectors are heavy at scale).
  - `mongot` does automatic scalar (int8) + binary (1-bit) quantization at index-build time,
    plus a rescoring pass. One index field; works on existing collections.
  - Concept: search on the blurry copy, rank finalists sharp.
  - Numbers: ~3.75x (int8), ~24x (binary), rescoring recovers recall; BSON BinData ~38% storage.

- **Act III — The Embeddings Bet (D3 — deepest idea).**
  - Reframe: don't compress after the fact — train the model to be compressible.
  - Quantization-aware training (Voyage): altitude-athlete analogy.
  - Matryoshka (MRL): one model, many dims (nesting dolls), 2048 → 256 truncatable.
  - Contextualized chunk embeddings (`voyage-context-3`): torn-out-paragraph problem.
  - Shared embedding space: tiny model for queries, big for docs — same space.

- **Synthesis — one query, all three layers.** Trace a query: `mongod` proxy → `mongot` →
  quantized HNSW → rescore → Voyage vectors. All three bets attack the same enemy —
  cost/latency at scale without losing recall — at different layers.

- **Close — the mental model.** "Came in knowing the API; leave knowing the machine."
  Callback to the cold-open one-liner. Optional appendix nuggets: E (ENN as ground truth
  for recall), F (agent memory types) as "where to go next."

## Format
~24–28 slides, presenterm, same visual language as existing decks (transitions, GIF
columns, tables, analogies). ~20–25 min. Time budget is elastic at Act 0: full run
~25 min (standalone); if the intro talk ran first, compress Act 0 to ~2–3 min → ~20 min.
Deck stays complete for the repo/recording either way.

## Still open
- Pick a title.
- Confirm ~20 min / slide count.
- Demo: local `mongodb/mongodb-atlas-local` Docker (mongod+mongot in one container) — slides
  only, or live `$vectorSearch` + quantization demo scripts?
- Assets: reuse existing GIFs vs new MongoDB-specific diagrams (two-kitchens, change-stream
  sync flow, query-flow-through-layers).
