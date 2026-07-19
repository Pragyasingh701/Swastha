# Swastha — AI Intelligence Layer on ABHA

Hackathon project: an AI-powered intelligence layer that organizes patients' scattered medical records (WhatsApp forwards, PDFs, lab reports) into one structured, searchable timeline — built as a layer on top of ABHA, not a competitor to it.

## Repo Structure

```
.
├── backend/          Node/Express backend
│   └── server.js     Server entrypoint & health routes
├── frontend/         React + Vite + Tailwind app
│   └── src/
│       ├── pages/    Screen groups (Login, FamilyVault, Timeline, etc.)
│       ├── api/      API client helper
│       └── main.jsx
├── docs/             Design documents & plans
├── package.json      Consolidated root dependencies and execution scripts
└── tailwind.config.js Tailwind styling config
```

## Getting Started

### Installation
Install all dependencies for both the frontend and backend from the root directory:
```bash
npm install
```

### Running the App
We use consolidated scripts from the root directory to run both environments:

* **Backend Development Server** (Runs on port `5001` with nodemon):
  ```bash
  npm run dev:backend
  ```
* **Frontend Development Server** (Runs Vite):
  ```bash
  npm run dev:frontend
  ```

### Configuration
Copy `backend/.env.example` to `backend/.env` (and create `frontend/.env` if frontend secrets are needed) to configure your database URLs and API keys.

## Core Features
1. **WhatsApp Bot Ingestion**: Send report screenshots/PDFs -> Ingest & structure
2. **Drug Interaction & Duplicate Medicine Detector**: Warnings on dangerous prescriptions
3. **Regional Language Report Simplification**: "Explain in Hindi" patient summaries
4. **Lab Trend Visualization**: Multi-visit time-series charts (Recharts)
5. **Smart Semantic Search (RAG)**: Conversational question answering grounded in medical records
6. **Family Health Vault**: Single account with multi-profile management