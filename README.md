# 🩺 Swastha — AI Intelligence Layer on ABHA

**Swastha** organizes scattered medical records (PDFs, lab reports, prescriptions) into one searchable health
timeline. Patients manage their own and their family's records; doctors, with the patient's approval, get
time-limited access and AI-assisted summaries. Built as an intelligence layer on India's **ABHA** ecosystem.

Two deployable services: the **Backend API** (Express, `:5001`, which also hosts the AI/RAG sub-app at `/rag`) and
the **Frontend SPA** (Vite/React, `:5173`).

---

## 🛠️ Tech stack

| Layer | Technologies |
| :--- | :--- |
| Frontend (`frontend/`) | React 18, Vite, Tailwind CSS, React Router, Recharts |
| Backend (`backend/`) | Node.js, Express, Supabase client, JWT, Brevo (email), Multer, Google OAuth |
| AI / RAG (`backend/rag/`) | Google Gemini (primary), OpenRouter (fallback), Sarvam (voice), `pgvector` search |
| Data | Supabase Postgres + pgvector, private Supabase Storage bucket for report files |

## 🌟 Key features

- **Accounts:** patient and doctor sign-up, email or Google login with a 6-digit email code, password reset.
- **Timeline & vault:** upload reports (OCR reads the file; unclear fields are flagged), a chronological health timeline, a medical vault, and lab trend charts.
- **Ask Swastha:** natural-language questions answered from the patient's own records, with sources.
- **Family vault:** manage family members and link adult members through an email consent request.
- **Doctor access:** a doctor links a patient by patient code, the patient approves, access lasts 24 hours and the patient can end it sooner. Declined or unanswered requests follow retry and cool-down rules.
- **Intake:** a Hindi/English voice or text intake collects a structured history before the visit. Doctors work from a priority queue with red-flag highlighting and keep a history of what they handled. **Clinic check-in** codes rotate daily.
- **AI consent & transparency:** an AI notice must be accepted before records go to an AI provider, every AI request logs which provider handled it, and AI output is labelled as AI-generated.

> Doctor registration certificates are scanned but **not yet verified** against an official register.

---

## 🚀 Getting started

```bash
npm install        # one install for the whole repo
npm run dev        # backend on :5001 and frontend on :5173
```

Separately: `npm run dev:backend` and `npm run dev:frontend`. Tests: `npm test` (backend, node:test) and
`npm run test:frontend` (vitest). Several backend tests use the real Supabase project in `backend/.env`.

### Environment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in:

| Where | Variable | Notes |
| :--- | :--- | :--- |
| backend | `JWT_SECRET` | **Required**, no fallback |
| backend | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_REPORTS_BUCKET` | Database and file storage |
| backend | `FRONTEND_URL`, `BACKEND_URL` | Email links, and the CORS allow-list (unset `FRONTEND_URL` leaves CORS open). `CORS_ORIGINS` adds more |
| backend | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in (add `<frontend>/auth/google/callback` as a redirect URI) |
| backend | `BREVO_API_KEY` | Verification and reset emails |
| backend | `GEMINI_API_KEY` (or `GEMINI_API_KEYS`) | Needs a **paid-tier** key for real patient data |
| backend | `OPENROUTER_API_KEY`, `ALLOW_OPENROUTER_FALLBACK` | Last-resort AI fallback, on by default |
| backend | `SARVAM_API_KEYS`, `ALLOW_EDGE_TTS_FALLBACK` | Voice intake and its fallback |
| frontend | `VITE_API_BASE_URL`, `VITE_RAG_BASE_URL`, `VITE_GOOGLE_CLIENT_ID` | API origins (RAG is at `/rag/api` on the same server) |

Optional tuning variables are listed in `backend/.env.example` (rate limits, CORS origins, and so on). Login sessions last
24 hours (7 days with "Remember me"); change that with `SESSION_TOKEN_TTL` and `REMEMBER_ME_TOKEN_TTL`.

### Deployment

- **Frontend (Vercel):** `vercel.json` rewrites to `index.html` and sends security headers, including an enforced
  Content-Security-Policy. Allow any new external script, font, image host or API origin there.
- **Backend (e.g. Render):** set the variables above.
- **Database:** run `supabase/schema/00000000000000_baseline_schema.sql` in the Supabase SQL editor on a new project and keep the `reports` bucket private.
  The baseline also schedules `public.monthly_cleanup()` (pg_cron, midnight India time at the end of every month). It
  removes check-in codes from earlier days and sign-ups that never chose a role for 30 days, and marks intake sessions
  nobody finished as abandoned. Run it by hand with `select public.monthly_cleanup();`; past runs are in `cron.job_run_details`.

---

## 📁 Repository structure

```
backend/
  app.js, server.js     Express app (CORS, helmet, rate limits) and entry point
  config/               JWT, Supabase, storage, wire-encryption field list
  db/                   One persistence file per area (users, reports, family, doctorPatients, intake, ...)
  routes/               auth, family, reports, doctorPatients, clinic, crypto
  middleware/, utils/   CORS, rate limits, wire encryption; mailer, password policy, validation
  rag/                  AI sub-app: search, extraction, summaries, intake dialogue, voice, evals
  test/                 node:test suites
frontend/src/
  api/                  Backend call wrappers + wire encryption
  components/common/    Shared UI (AppHeader, PatientSidebar, AI notice, ...)
  config/, utils/       Report categories, AI notice text; date and form helpers
  modules/              authentication, dashboard, doctor, family, intake, landing, reports, search, settings, timeline, vault
supabase/
  schema/               The full database schema, kept up to date
  migrations_archive/   Every migration script, kept as history
scripts/                purge-audit-log.js (scheduled)
vercel.json             Frontend hosting and security headers
```

## 🗄️ Database

All 15 tables are defined in **`supabase/schema/00000000000000_baseline_schema.sql`**, which rebuilds an empty
database (do not run it on one that already has tables). Every change is a script in
`supabase/migrations_archive/` that you run in the SQL editor, and the same change is folded into the baseline in
the same commit.

| Area | Tables |
| :--- | :--- |
| Identity | `patients`, `doctors`, `pending_registrations` |
| Records | `reports`, `report_embeddings`, `vault_table`, `family_members` |
| Doctor ↔ patient | `doctor_patient`, `clinic_checkin_codes` |
| Intake | `intake_sessions`, `intake_session_actions` |
| AI privacy | `ai_notice_acknowledgements`, `ask_swastha_access_log`, `ask_swastha_feedback`, `ai_request_log` |

Row Level Security is on for every table with **no policies** (deny-all to the public keys). The backend uses the
service-role key, so every query must filter by `patient_id` / `recipient_id` itself. Report files live in a private
bucket and are opened through short-lived signed links (`GET /api/reports/:id/file-url`).

---

## 🔒 Privacy & security notes

- **Wire encryption:** sensitive fields (names, contact details, record content, intake answers, AI summaries; see
  `backend/config/sensitiveFields.js` and its mirror `frontend/src/api/pii/fields.js`) are AES-GCM encrypted in
  request and response bodies after an ECDH handshake, so they do not appear in plaintext in network tools or logs.
  It does **not** replace HTTPS, protect a compromised browser, hide what a screen displays, or encrypt data at rest.
  One gap: a patient's typed intake answer is sent under the generic key `message` and is readable on the wire.
- **External hosts that can receive patient text** (given the default fallback flags):

| Host | Used for | Sent |
| :--- | :--- | :--- |
| `generativelanguage.googleapis.com` (Gemini) | Embeddings, answers, summaries, intake dialogue, OCR | Record text, questions, intake chat, uploaded document images |
| `openrouter.ai` | Same, only after Gemini is exhausted (`ALLOW_OPENROUTER_FALLBACK=false` disables it) | Same content, for the request that fell back |
| `api.sarvam.ai` | Voice intake speech-to-text and text-to-speech | The patient's recording and the assistant's question text |
| `speech.platform.bing.com` (Edge TTS) | Voice fallback if Sarvam fails (`ALLOW_EDGE_TTS_FALLBACK=false` disables it) | The assistant's question text |

  Supabase is your own database and storage. Brevo sends only codes and account emails, never clinical content.
- **Access log:** every Ask Swastha request writes a row to `ask_swastha_access_log` (who looked at whose records,
  when, by which route), never the question or answer text. Rows older than `AUDIT_LOG_RETENTION_DAYS` (default 365)
  are deleted by `node scripts/purge-audit-log.js` (`--dry-run` to preview). It is not automatic: schedule it.
- **AI evals:** `backend/rag/evals/` can run questions through the real search pipeline. Keep real ids in the
  gitignored `questions.local.json` and never point it at production.
