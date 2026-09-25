/* Demo 3 — Vector search alone: ranks by meaning, blind to the exact code.
 *
 * Run: mongosh "mongodb://localhost:27017/?directConnection=true" --file vector-only.js
 */
const vsdemo = db.getSiblingDB("vsdemo");
const meta = vsdemo.meta.findOne({ _id: "rankfusion-query" });

const results = vsdemo.errors.aggregate([
  { $vectorSearch: { index: "vsindex", path: "embedding", queryVector: meta.q, numCandidates: 20, limit: 5 } },
  { $project: { _id: 0, title: 1, content: 1, score: { $meta: "vectorSearchScore" } } },
]).toArray();

print(`\nQuery vector points at "timeout/connection error" meaning — same axis as ALL 5 docs.`);
print(`Vector search ranks by similarity only. Top result:\n`);
printjson(results[0]);
print(`\nNotice: the top-ranked doc may not even mention "${meta.text}" — every doc looks equally`);
print(`"close" to the query because they're all about the same general topic. Vector search`);
print(`can't distinguish "the exact code you asked for" from "a similar-sounding one."\n`);
