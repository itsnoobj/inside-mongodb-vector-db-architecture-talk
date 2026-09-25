# Inside MongoDB Vector Search

**Architecture, Quantization & Embeddings** — a talk on what actually happens beneath a
`$vectorSearch` query: the two-process engine (`mongod` + `mongot`), vector compression
(scalar/binary quantization), and how to measure and tune recall.

## Contents

- [`inside_mongodb_vector_search.md`](inside_mongodb_vector_search.md) — the slide deck,
  written for [presenterm](https://github.com/mfontanini/presenterm). Export to PDF:
  ```bash
  presenterm --export-pdf inside_mongodb_vector_search.md -o deck.pdf
  ```
- [`demo/`](demo/) — three live, interactive demos on open-source MongoDB (Docker, no
  embedding API, no npm). Start with [`demo/demo.md`](demo/demo.md) for the run-of-show,
  or [`demo/README.md`](demo/README.md) for the technical reference.

## Contact

📧 hello@noobj.me · 🌐 [noobj.me](https://noobj.me)
