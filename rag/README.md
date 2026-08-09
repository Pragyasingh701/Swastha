# Swastha RAG service

Semantic search over patient health records. Standalone Express service —
**intentionally separate from `backend/`** so the rest of the team doesn't
need to touch or know about it. Plain Node/Express, plain REST calls (Gemini
for embeddings, OpenRouter for grounded answers), Supabase/pgvector for
storage + similarity search. No LangChain/LangGraph/Python.

It does not own report storage — `backend/` still owns the `reports` table
via `backend/routes/reports.js` / `backend/db/reports.js`. This service only
owns `report_embeddings` and the `/api/search` + `/api/reports/index`
endpoints. The frontend calls both services independently (see "How it's
wired" below).

## Setup

1. `cd rag && npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — same Supabase project as
     `backend/.env`.
   - `GEMINI_API_KEY` — used only for embeddings (`gemini-embedding-001`).
     Same key you'd put in `backend/.env`, or a separate one, doesn't matter.
   - `OPENROUTER_API_KEY` — used for grounded answer generation. Get one at
     https://openrouter.ai/keys. Defaults to a free model
     (`openai/gpt-oss-20b:free`, see `src/config/openrouter.js`) — OpenRouter's
     free lineup rotates, swap the model there if it gets deprecated.
   - `JWT_SECRET` — **must match `backend/.env`'s `JWT_SECRET` exactly.**
     This service verifies the same tokens the main backend issues, so it
     trusts the caller's identity without re-implementing login.
   - `CORS_ORIGIN` — the frontend dev URL (`http://localhost:5173` by default).
3. Run the SQL migrations against your Supabase project, in order, via the
   Supabase SQL editor:
   - `migrations/001_create_report_embeddings.sql`
   - `migrations/002_match_report_embeddings_function.sql`

   **Check `reports.id`'s actual column type first** (Table Editor →
   `reports`) — the migration assumes `bigint`. If it's `uuid`, change
   `report_id bigint` to `report_id uuid` in both files before running them.
4. `npm start` (or `npm run dev` for auto-restart on change). Runs on
   `PORT` from `.env` (default `3010`) — separate from `backend`'s `5001`.

## How it's wired to the rest of the app

The frontend calls this service directly, in parallel with `backend/`:

- **Saving a report**: frontend `POST`s to `backend/api/reports` as before
  (unchanged). On success, it also `POST`s the saved report to
  `rag/api/reports/index` here, so it becomes searchable. This call is
  fire-and-forget from the user's perspective — if it fails, the report is
  still saved, it just won't show up in search yet.
- **Deleting a report**: frontend calls `backend/api/reports/:id` DELETE as
  before, then also calls `rag/api/reports/index/:id` DELETE here to drop
  its embeddings.
- **Searching**: frontend calls `rag/api/search` directly — `backend/` is
  never in this path at all.

Both calls from the frontend use the same JWT (`Authorization: Bearer
<token>`) already stored from login — this service verifies it itself
(`src/middleware/auth.js`) rather than trusting a `user_id` in the request
body.

## What's here

- `migrations/001_create_report_embeddings.sql` — `report_embeddings` table
  (768-dim pgvector column, HNSW cosine index, unique `(report_id,
  chunk_index)` for idempotent re-processing).
- `migrations/002_match_report_embeddings_function.sql` — `match_report_embeddings`
  SQL function used for the similarity search query (the JS client can't
  express the `<=>` operator directly).
- `src/config/gemini.js` — plain `fetch` wrapper around the Gemini REST API,
  embeddings only (`gemini-embedding-001`).
- `src/config/openrouter.js` — plain `fetch` wrapper around OpenRouter's
  chat-completions endpoint, used for grounded answer generation
  (`openai/gpt-oss-20b:free` by default).
- `src/middleware/auth.js` — verifies the same JWT `backend/` issues.
- `src/utils/chunkText.js` — splits report `notes` into chunks (short
  entries stay whole; long OCR text splits on sentence/paragraph
  boundaries with overlap).
- `src/services/embeddingService.js` — `processReportEmbeddings(report)`:
  chunk + embed + idempotently upsert into `report_embeddings`;
  `deleteReportEmbeddings(reportId)` for cleanup on report delete.
- `src/services/searchService.js` — `searchReports(query, userId)`: embed
  query (Gemini) → pgvector search scoped to `user_id` → threshold filter →
  grounded answer (OpenRouter) → sources for "view source" links.
- `src/routes/reports.js` — `POST /api/reports/index` and
  `DELETE /api/reports/index/:id`, the indexing trigger endpoints.
- `src/routes/search.js` — `POST /api/search`.

## POST /api/reports/index

Headers: `Authorization: Bearer <jwt>`

Request body: the report object as returned by `backend` `POST /api/reports`
(needs at least `id` and `notes`):
```json
{ "id": 42, "notes": "BP 120/80, prescribed amlodipine 5mg once daily." }
```

## POST /api/search

Headers: `Authorization: Bearer <jwt>`

Request:
```json
{ "query": "What medications was I prescribed for hypertension?" }
```

Response (found):
```json
{
  "answer": "Based on your records, you were prescribed Amlodipine 5mg once daily.",
  "sources": [
    { "report_id": 42, "title": "Cardiology follow-up", "category": "Cardiology", "report_date": "2026-03-01T00:00:00Z", "file_url": "https://.../report42.pdf" }
  ],
  "noResultsFound": false
}
```

Response (nothing relevant found):
```json
{
  "answer": "No relevant records found in your health history for this question.",
  "sources": [],
  "noResultsFound": true
}
```

`user_id` scoping happens both at the JWT layer (never trusts a body field)
and inside the SQL function itself (`match_report_embeddings` filters by
`p_user_id` in the query, not after).

## Tuning notes

- `SIMILARITY_THRESHOLD` (0.65) and `MATCH_COUNT` (5) live in
  `src/services/searchService.js`. Once you have real report data, watch
  the logged `similarity` scores for genuine matches vs. noise and adjust.
- Chunk size/overlap (`MAX_CHUNK_CHARS` / `CHUNK_OVERLAP_CHARS`) live in
  `src/utils/chunkText.js`.
