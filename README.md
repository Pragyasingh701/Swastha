# [App Name] — AI Intelligence Layer on ABHA

Hackathon project: an AI-powered intelligence layer that organizes patients'
scattered medical records (WhatsApp forwards, PDFs, lab reports) into one
structured, searchable timeline — built as a layer on top of ABHA, not a
competitor to it.

## Repo structure

```
.
├── backend/          FastAPI backend (ingestion, records, search, alerts, profiles)
│   └── app/
│       ├── api/      route handlers, one folder per feature
│       ├── models/   Pydantic + DB models
│       ├── services/ OCR, LLM structuring, drug interaction logic, RAG
│       └── db/       DB connection, migrations
├── frontend/         React + Vite + Tailwind app
│   └── src/
│       ├── pages/    one folder per screen (Login, FamilyVault, Timeline, etc.)
│       ├── components/  shared UI components
│       ├── api/      API client functions
│       └── hooks/    shared React hooks
├── docs/             design docs, schema, architecture notes
└── .github/workflows CI (lint/test on push)
```

## Getting started

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DB url + API keys
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Team ownership (fill in names)

| Area | Owner | Branch prefix |
|---|---|---|
| Ingestion pipeline (OCR + LLM structuring) | | `feature/ingestion-*` |
| Drug interaction + RAG search | | `feature/ai-*` |
| WhatsApp integration | | `feature/whatsapp-*` |
| Frontend (Family Vault, Timeline, charts) | | `feature/ui-*` |
| Demo data + pitch polish | | `feature/demo-*` |

See `docs/design_document.md` for full architecture, schema, and API design.
