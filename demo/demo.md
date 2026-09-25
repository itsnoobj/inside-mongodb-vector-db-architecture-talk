# Demo run-of-show

```bash
cd demo && docker compose up -d
```

---

## Demo 1 — The Filter Trap

IDE: `01-filter-trap/query.js`

```js
load("01-filter-trap/live.js")
showTrap()   // Got: 0
showFix()    // Got: 10
```

## Demo 2 — Recall, Measured

IDE: `02-recall-enn/query.js`

```js
load("02-recall-enn/live.js")
recallAt(10)
recallAt(150)
recallAt(500)
recallAt(5000)
```

## Demo 3 — Vector Misses, BM25 Catches

IDE: `03-rank-fusion/query.js`

```js
load("03-rank-fusion/live.js")
vectorOnly()   // ERR-4521 doc is last
rankFusion()   // ERR-4521 doc jumps to #1
```

---

## Seed

```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 01-filter-trap/seed.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/seed.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/seed.js
```

## Reset

```bash
docker compose down -v && docker compose up -d
```

## Sanity checks

```bash
mongosh "mongodb://localhost:27017/?directConnection=true" --file 02-recall-enn/check.js
mongosh "mongodb://localhost:27017/?directConnection=true" --file 03-rank-fusion/check.js
```
