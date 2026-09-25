# MongoDB Vector Search Talk — Session Handoff

## Repo
/Users/Jeevan.Chikkegowda/labs/hacks/mongodb-vector-search-talk

## What was built
Presenterm deck + study notes for "Inside MongoDB Vector Search: Architecture & Quantization."

## Key files
- `inside_mongodb_vector_search.md` — presenterm deck (39 slides, zero speaker notes)
- `talk_study_notes.md` — single doc to read off, slide-by-slide bullets + **Talk-over:** cues for the 8 deep slides
- `images/*.svg` + `*.png` — all diagrams regenerated; box corners now square (not rounded)
- `demo/` — two mongosh scripts: Filter Trap + Recall/ENN

## Structural spine
- Cold open: "Two bets under one query" → Architecture + Compression
- Section dividers: `ARCHITECTURE` / `COMPRESSION` (transition images, not "Act I/II")
- Recap slide: `Architecture — The Mental Model`

## Motif to preserve
**Defer and derive.** MongoDB never does search's work on the write path — it records intent (oplog) and derives the index asynchronously (mongot). Every pattern name (CQRS, Materialized View, Bulkhead, Proxy, PACELC) hangs off that one refusal.

## Deck rules (established this session)
- Minimal on-slide text. Detail in study notes.
- Color spans: `#6c7086` muted, `#f9e2af` yellow punch, `#a6e3a1` green payoff.
- Diagrams: square corners, 2400px PNGs regenerated from SVG via `rsvg-convert -w 2400`.
- No `speaker_note` blocks in deck — they don't validate in headless env.
- Pattern names (CQRS, PACELC, Bulkhead): talk-over only, not dense on-slide body.

## numCandidates guidance (doc-pinned)
- Start: **10–20 × `limit`**. Hard cap: ≤ 10,000. Must be ≥ `limit`.
- Tune by measuring: ENN top-k = ground truth; raise until recall plateaus.
- Sharded: per-shard, so effective = `numCandidates × shards`.

## Quantization numbers (doc-pinned)
- scalar/int8: ~3.75× less RAM, ~90%+ retention
- binary/1-bit: ~24× less RAM (HNSW graph uncompressed), ~80% faster + rescoring pass
- BSON BinData: ~38% storage cut

## Cut/dropped
- Act III / Embeddings deep-dive (Voyage, MRL, quantization-aware training) — not in deck, kept in study notes as Q&A reserve.
- "The Trade-off Is the Feature" slide — redundant with Two Kitchens + recap.
- "Act I/II" labels — renamed to topic names (Architecture, Compression).

## If continuing
1. Read `talk_study_notes.md` to rehydrate context.
2. Deck is structurally complete. Next work: polish passes, timing, or demo hardening.
3. Do NOT run `presenterm` in headless sandbox — it blocks. Validate only with grep/read.
