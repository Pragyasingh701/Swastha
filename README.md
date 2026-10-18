# 🩺 Swastha — AI Intelligence Layer on ABHA

**Swastha** is a state-of-the-art healthcare AI intelligence platform designed to organize scattered medical records (PDFs, lab reports, prescriptions) into a unified, searchable timeline. Built as an intelligence layer on top of India's **ABHA (Ayushman Bharat Digital Health Account)** ecosystem, Swastha empowers patients with holistic family health management and provides clinicians with grounded AI insights.

**Two deployable services**, not three — RAG used to run standalone (see the note further down), but now
lives inside the **Backend API** (Express, `:5001`, which hosts the RAG sub-app internally) alongside
the **Frontend SPA** (Vite/React, `:5173`).

---

## 🛠️ Technology Stack

| Layer | Technologies & Libraries | Description |
| :--- | :--- | :--- |
| **Frontend** (`frontend/`) | **React 18**, **Vite**, **Tailwind CSS**, **React Router v6**, **Recharts**, **Lucide Icons** | Modern responsive SPA featuring medical timeline UI, lab trends chart visualizer, dark mode styling, and redirect-based Google Sign-In. |
| **Backend API** (`backend/`) | **Node.js**, **Express.js** (`:5001`), **Supabase Client SDK**, **Brevo REST API**, **Multer**, **`google-auth-library`**, **JWT** | Core API for user auth, Brevo-powered 6-digit email OTPs, password resets, family vault management, doctor license validation, and local document uploads. |
| **RAG Sub-App** (`backend/rag/`, mounted at `/rag`) | **Google Gemini API** (primary; requires a **paid-tier** key for real patient data), **OpenRouter API** (last-resort fallback, on by default — see `ALLOW_OPENROUTER_FALLBACK`), **Supabase Client SDK** | Vector search & prescription OCR, running **inside the same Express process and port as the Backend API** (not a separate service — see below). Generates 768-dim embeddings (`gemini-embedding-001`) and synthesizes grounded answers, both via Gemini. |
| **Database & Vector Storage** | **Supabase PostgreSQL**, **`pgvector`** extension | Cloud Postgres database with dedicated `patients`/`doctors`/`pending_registrations` identity tables (patients and doctors are separate tables, not a shared `users` table with a role column), plus `reports`, `report_embeddings`, `vault_table`, `family_members`, `doctor_patient`, and `notifications`. Retrieval scans one patient's own embeddings via a plain `patient_id` btree index, not an HNSW/ANN index — see the note below the `report_embeddings` DDL for why. |

---

## 🌟 Key Features

- **🛡️ Secure Multi-Role Authentication**: Patient and Doctor onboarding with redirect-based Google OAuth 2.0 (full-page redirect to Google + `/auth/google/callback`, with account deduplication — avoids ad-blockers breaking popup-based auth), 6-digit email OTP verification via **Brevo HTTPS REST API**, password resets, and JWT session tokens.
- **🔬 Doctor Certificate AI Verification**: Automated parsing and credential validation of medical registration certificates using **Google Gemini** vision capabilities upon doctor signup. (Official register verification and a `verified` badge are not built yet; see the project notes.)
- **📜 Smart Medical Timeline & OCR Ingestion**: Chronological visual record of consultations, prescriptions, lab reports, and diagnoses. Automatically flags **unclear fields** (e.g. illegible doctor handwriting) to alert clinicians.
- **🔍 Grounded RAG Semantic Search**: The RAG sub-app (mounted inside the backend at `/rag`) performs `pgvector` similarity search over patient records and synthesizes natural-language answers via **Google Gemini**, with OpenRouter as a last-resort fallback (on by default, see `ALLOW_OPENROUTER_FALLBACK`).
- **👨‍👩‍👧‍👦 Family Vault & Authorization Network**: Centralized health management for families. Manage dependants (children/elders) and send email-authorized consent requests for adult family members. Once a family member is linked (their own separate Swastha account, approved via that consent flow), a family admin can also ask **Ask Swastha** about that member's own records via `patient_user_id` — same mechanism as the doctor↔patient case below, gated by `isPatientLinkedToFamilyMember` (`backend/db/family.js`) rather than `doctor_patient`. Backend API only today — no family-member picker in the Ask Swastha UI yet (see `frontend/src/modules/search/`).
- **📊 AI Lab Trends Visualizer**: Interactive trend analysis powered by **Recharts**, tracking blood work, lab parameters, and vital metrics over time.
- **👨‍⚕️ Doctor Clinical Dashboard**: Dedicated portal allowing healthcare professionals to link patients by their unique 6-digit **patient code** (or user ID), then search records, view past diagnoses, active medications, and medical history. Access is patient-approved and **time-limited to 24 hours** per approval — after that, the link goes inactive and the doctor must send a fresh request rather than retaining standing access.
- **🎙️ Voice & Text Patient Intake**: A conversational AI intake (Hindi or English, speech or typing) that collects a structured history (symptoms, medications, allergies) before the visit. Doctors see it in a priority-sorted **Intake Queue** with red-flag highlighting, can mark sessions Completed or Removed, and keep a personal **History** of what they handled.
- **🏥 Clinic Check-In**: Each doctor gets a code that rotates daily. A patient at the clinic enters the code, verifies by email, and completes the intake, which lands in that doctor's queue.
- **🔐 Patient-Controlled Access**: A doctor's access to a patient lasts 24 hours and the patient can end it sooner. Declined requests follow retry and cool-down rules, and unanswered requests lapse after 24 hours.
- **🤖 AI Consent & Transparency**: An AI notice must be accepted before records or documents go to an AI provider, every AI request records which provider handled it, and AI output is labelled as AI-generated.

---

## 📁 Repository Structure

```
Swastha/
├── backend/                        # Node.js & Express API Server (:5001)
│   ├── app.js / server.js          # Express app (CORS, helmet, rate limits, routes) / entry point; mounts backend/rag/app.js at /rag
│   ├── config/
│   │   ├── jwt.js                  # Session and purpose-token signing/verification
│   │   ├── sensitiveFields.js      # Which fields are encrypted on the wire (mirrors frontend/src/api/pii/fields.js)
│   │   ├── supabase.js             # Supabase client (service-role key)
│   │   └── supabaseStorage.js      # Private `reports` bucket: upload, signed URLs, file-type checks
│   ├── middleware/                 # CORS allow-list, rate limiters, wire-format encryption
│   ├── crypto/                     # ECDH handshake + AES-GCM for the wire encryption
│   ├── db/                         # Persistence layer, one file per area
│   │   ├── users.js, reports.js, family.js, notifications.js
│   │   ├── doctorPatients.js       # Doctor↔patient links: requests, accept/decline, 24 h access, revoke
│   │   ├── intakeSessions.js, clinicCheckin.js
│   │   ├── aiNoticeAcknowledgements.js, askSwasthaAccessLog.js, askSwasthaFeedback.js
│   │   └── accountErasure.js       # Removes what outlives a deleted account
│   ├── routes/                     # auth, family, reports, doctorPatients, clinic, notifications, crypto, intakeAdmin
│   ├── services/                   # certificateParserService.js (Gemini vision licence parser)
│   ├── utils/                      # mailer (Brevo), password policy, validation, async error wrapper, email-action page
│   ├── rag/                        # RAG sub-app, mounted at /rag
│   │   ├── config/                 # Gemini, OpenRouter, AI failover client
│   │   ├── routes/                 # Search/chat, extraction, summaries, lab insights, intake, notices, feedback
│   │   ├── services/               # Embeddings, search, summaries, intake dialogue, voice (ASR/TTS)
│   │   ├── middleware/             # Auth and AI-notice consent checks
│   │   ├── utils/                  # Untrusted-data prompt wrapping, request logging
│   │   ├── langchain/, evals/      # Conversational search store; eval harness
│   │   └── app.js
│   ├── test/                       # node:test suites, run from the repo root with `npm test`
│   │                               # (many hit the real configured Supabase project — see wire-encryption.test.js)
│   ├── uploads/                    # Doctor certificates (never served publicly); report files live in the private Supabase bucket
│   ├── .env.example                # Backend environment template, also covers the RAG sub-app
│   └── server.js
├── frontend/                       # React 18 + Vite + Tailwind CSS Frontend SPA (:5173)
│   └── src/                        # Frontend tests: `npm run test:frontend` from the repo root (vitest)
│       ├── api/                    # Backend call wrappers + PII wire encryption
│       ├── components/common/      # Shared UI (Logo, NotificationBell, ResponsiveSidebar, AiNotice, ReportFilePreview, ...)
│       ├── context/AuthContext.jsx # Global auth provider and route guard state
│       ├── config/, hooks/, utils/ # AI notice text, polling hook, form validation
│       ├── modules/
│       │   ├── authentication/     # Login, registration (patient/doctor), OTP, password reset, Google callback
│       │   ├── dashboard/          # Patient dashboard
│       │   ├── doctor/             # Doctor dashboard, patients, AI insights, Ask Swastha, intake queue
│       │   ├── family/             # Family vault
│       │   ├── intake/             # Voice/text intake chat
│       │   ├── landing/            # Landing page
│       │   ├── reports/            # Report upload and lab trends
│       │   ├── search/             # Ask Swastha (patient)
│       │   ├── settings/           # Profile, password, doctor access, account deletion
│       │   ├── timeline/           # Health timeline
│       │   └── vault/              # Medical vault (documents)
│       ├── App.jsx                 # Routes and navigation guards
│       └── main.jsx
├── supabase/
│   ├── schema/                     # 00000000000000_baseline_schema.sql: the whole database schema, kept up to date
│   └── migrations_archive/         # Every migration script, kept as history (run in the Supabase SQL editor)
├── scripts/                        # purge-audit-log.js (scheduled)
├── vercel.json                     # Frontend hosting: SPA rewrite, security headers, Content-Security-Policy
├── package.json                    # Monorepo root script & dependency manifest
└── README.md
```

---

## 🗄️ Supabase Database (16 tables)

The whole schema lives in one file, **`supabase/schema/00000000000000_baseline_schema.sql`**. It rebuilds
an empty database: open **Supabase Dashboard > SQL Editor**, paste it, and run it. It is not meant to be run
against a database that already has the tables.

**How changes are made:** every database change is a script stored in `supabase/migrations_archive/` (you run
it in the SQL editor) and is folded into the baseline in the same commit, so the baseline always describes the
current schema.

| Area | Tables |
| :--- | :--- |
| Identity | `patients`, `doctors`, `pending_registrations` (patients and doctors are separate tables, not one `users` table) |
| Records | `reports`, `report_embeddings` (pgvector, 768 dimensions), `vault_table`, `family_members` |
| Doctor ↔ patient | `doctor_patient` (request, accept/decline, 24 h access window, cool-downs), `clinic_checkin_codes` |
| Intake | `intake_sessions`, `intake_session_actions` |
| In-app | `notifications` (removed after seven days by the hourly `delete-expired-notifications` cron job) |
| AI privacy | `ai_notice_acknowledgements`, `ask_swastha_access_log`, `ask_swastha_feedback`, `ai_request_log` |

`reports`, `report_embeddings`, `vault_table`, and `family_members` reference `patients.id` through a
**`patient_id`** column. The similarity search runs in the `match_report_embeddings` function.

**Report files** are stored in a **private** Supabase Storage bucket named `reports`, under random per-patient
paths, and are opened through short-lived signed links (`GET /api/reports/:id/file-url`).

⚠️ **RLS note**: every table has Row Level Security enabled with **zero policies**, which means deny-all to the
`anon`/`authenticated` keys. The app works because the backend (and the RAG sub-app) connect with
`SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. There is no database-level scoping, so every query in the
code must filter by `patient_id`/`recipient_id`/etc. itself. If you ever add a direct browser→Supabase call, it
will return nothing until real RLS policies are written.

---

## 🔒 Wire-format PII encryption

Designated sensitive fields (name, email, phone, DOB, address and similar,
plus medical record content, family health details, intake answers and
AI-written summaries —
see `backend/config/sensitiveFields.js` and its frontend mirror,
`frontend/src/api/pii/fields.js`, the single source of truth for the field
list) are encrypted in every request/response body between the frontend and
backend, so a passive observer of the *wire* — a browser DevTools Network
tab, a HAR export handed to a vendor, a TLS-terminating corporate/debugging
proxy, or a future logging/APM/analytics integration that happens to record
raw bodies — sees ciphertext (`{ "__enc": 1, "iv": "...", "data": "...",
"wasSerialized": false }`) instead of plaintext for those fields. Everything
else in a request/response — structure, non-sensitive fields, status codes —
is untouched.

Mechanism: a per-browser-tab AES-256-GCM session key, established once via
an ECDH P-256 handshake (`POST /api/crypto/handshake`, no auth required —
it has to work before login) and native WebCrypto only on both sides
(`crypto.webcrypto` in Node, `window.crypto.subtle` in the browser — zero
new crypto dependency). `backend/middleware/wireCrypto.js` decrypts matching
request fields immediately after body-parsing and transparently encrypts
matching response fields by wrapping `res.json` — no controller, route, or
DB code anywhere had to change. `frontend/src/api/client.js`'s `apiRequest`
does the same on the way out/in, so component code reads and writes plain
JS values throughout.

**What this does not protect against** (read this before treating it as a
stronger guarantee than it is):
- **Network eavesdropping** — HTTPS/TLS already fully encrypts this traffic
  in transit; this feature is about what's visible *at the endpoints* of
  that tunnel (a browser's own DevTools, a proxy that terminates and
  re-issues TLS, a log line), not about adding confidentiality TLS doesn't
  already provide.
- **A fully compromised or malicious client** — the decryption key and logic
  ship in the page's own JavaScript. Anyone who controls the browser
  environment (a malicious extension, a modified build, direct console
  access) can read the same plaintext the app itself needs to render.
- **Anything the UI has to display** — if a screen shows a user's own
  name/email/phone, that value is necessarily decrypted into the DOM/React
  state to be shown, so it's visible there (Elements tab, a screenshot,
  React DevTools) regardless of what the Network tab shows for the same
  request.
- **A patient's typed intake answer** — it is sent under the generic key
  `message`, which can't be listed without encrypting every status string in
  the app, so that request field is readable on the wire. The questions and
  recorded answers that come back, and the spoken transcript, are covered.
- **Database/storage security** — entirely unrelated and unchanged. Data is
  stored in Supabase exactly as it always was; this is a wire-format-only
  concern layered on top, not an at-rest encryption scheme.

## ⚠️ RAG is no longer a separate service

Until 2026-08-22, `rag/` was a standalone Express process on its own port (`:3010`) with its own
`package.json` and `.env` — that's what older commits, and possibly your local memory of this repo,
describe. It has since been **merged into `backend/`**: the code moved to `backend/rag/`, is mounted
as an Express sub-app at `/rag` inside `backend/server.js`, and runs on the same process/port as the
main API. This was done to stop running two free-tier Render services (each capped at 750 hours/month
combined) when one now covers both. If you're deploying, **you only have one service to stand up now,
not two.**

Practical effects: no more `rag/.env` — everything lives in `backend/.env`. No more `cd rag && npm
install`/`npm run dev` — RAG starts automatically with the backend. `RAG_BASE_URL` (backend→RAG) and
`VITE_RAG_BASE_URL` (frontend→RAG) both now default to a path on the *same* origin (`/rag/api`)
instead of a second port, though both remain overridable if you ever want to split RAG back out.

## ⚙️ Environment Configuration

### 1. Backend Setup (`backend/.env`) — also covers the RAG sub-app

```env
PORT=5001
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com

# Required for the redirect-based Google Sign-In flow (exchanges the auth code for tokens).
# Also add http://localhost:5173/auth/google/callback (and your deployed frontend origin +
# /auth/google/callback) as an Authorized redirect URI on this OAuth client.
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

JWT_SECRET=your_jwt_secret_key_here

# Used to build links in transactional emails (password reset, family authorization confirm).
# Defaults to localhost if unset — set these explicitly in production.
# FRONTEND_URL is also the CORS allow-list: only browsers on that origin (plus localhost:5173
# outside production) may call the API. If it is unset the API accepts every origin and logs
# a warning. CORS_ORIGINS (comma-separated) adds extra origins, e.g. Vercel preview URLs.
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5001
# CORS_ORIGINS=https://my-preview-branch.vercel.app

# Supabase Credentials
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
SUPABASE_REPORTS_BUCKET=reports

# Brevo Transactional Email Key (for OTPs & Password Resets)
BREVO_API_KEY=your_brevo_api_key_here

# Google Gemini API key(s) — vision/OCR (doctor certificate parsing, report
# extraction) AND, for the RAG sub-app, embeddings (gemini-embedding-001) and
# grounded-answer generation. Comma-separate multiple keys as GEMINI_API_KEYS
# to rotate on rate-limit (429); singular GEMINI_API_KEY also still works.
# Get a key at https://aistudio.google.com/app/apikey — a FREE-TIER key is
# fine for local development, but a PAID-TIER key is required before this
# service processes any real patient data: the free tier's usage caps are
# per-project-wide (shared across every user of the app, not per-request),
# so real traffic will exhaust it — by default this falls back to
# OpenRouter (see ALLOW_OPENROUTER_FALLBACK below) rather than interrupting
# service for patients.
GEMINI_API_KEY=your_gemini_api_key_here
# GEMINI_API_KEYS=key_one,key_two

# OpenRouter — a THIRD-PARTY provider, used only as a last-resort fallback
# when every configured Gemini key/model is exhausted. REQUIRED by default,
# since ALLOW_OPENROUTER_FALLBACK below defaults to true. Get a key at
# https://openrouter.ai/keys.
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Fallback flag, defaults to true. When every configured Gemini key/model is
# exhausted, the RAG sub-app's AI failover client
# (backend/rag/config/aiClient.js) falls back to OpenRouter rather than
# failing the request — the AI-processing notice every user acknowledges
# before first use (backend/rag/config/aiNotices.js) discloses "an AI
# service" generically rather than naming Gemini specifically, so this
# fallback is already covered by that consent. Set to false to disable it
# (Gemini-only; a request fails gracefully with a friendly "try again"
# message on total Gemini exhaustion instead of trying OpenRouter). Any
# value other than exactly "false" is treated as true.
ALLOW_OPENROUTER_FALLBACK=true

# Sarvam AI — TTS (Bulbul v3) + ASR (Saaras) for the Module A voice intake
# layer. Comma-separate multiple keys as SARVAM_API_KEYS to rotate past an
# exhausted/rejected one; singular SARVAM_API_KEY also works. Optional —
# without a key, or if Sarvam TTS fails, a turn simply has no audio unless
# ALLOW_EDGE_TTS_FALLBACK below kicks in; ASR has no fallback and is simply
# unavailable without a working key.
SARVAM_API_KEYS=your_sarvam_api_key_here

# Fallback flag, same reasoning as ALLOW_OPENROUTER_FALLBACK above. Defaults
# to true: on a Sarvam TTS failure, the Sarvam-TTS fallback sends a request
# to Microsoft's speech.platform.bing.com (via the edge-tts-universal
# library) rather than the turn having no audio — covered by the same
# generic "an AI service" notice. Set to false to disable it (Sarvam-only;
# text/tap still works either way). Any value other than exactly "false" is
# treated as true.
ALLOW_EDGE_TTS_FALLBACK=true

# How long a row in ask_swastha_access_log (see "Ask Swastha access audit
# log" below) is kept before scripts/purge-audit-log.js deletes it. Purging
# is NOT automatic — run that script on a schedule (e.g. a daily cron).
# AUDIT_LOG_RETENTION_DAYS=365

# Only needed if you deliberately run RAG as a separate external service again —
# defaults to an in-process loopback call otherwise.
# RAG_BASE_URL=http://localhost:5001/rag/api
```

### 2. Frontend Setup (`frontend/.env`)

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:5001/api

# RAG (AI search) base URL — mounted inside the backend at /rag (same
# server/port as VITE_API_BASE_URL above), not a separate service.
VITE_RAG_BASE_URL=http://localhost:5001/rag/api
```

---

## 🌐 External hosts that can receive patient text

Every external host the RAG sub-app (`backend/rag/`) can send patient/report text or document images to, given the current (default) `ALLOW_OPENROUTER_FALLBACK`/`ALLOW_EDGE_TTS_FALLBACK` settings — not what it always does send, but what it *can* reach given how it's configured. The AI-processing notice every user acknowledges before first use (see `backend/rag/config/aiNotices.js`) discloses "an AI service" generically, which is what makes it acceptable for either fallback provider below to be reachable by default:

| Host | Features that reach it | What text/data is sent |
| :--- | :--- | :--- |
| `generativelanguage.googleapis.com` (Google Gemini) | Embeddings, grounded search/chat answers, report/lab/timeline summarization, patient intake dialogue, prescription/report OCR, doctor certificate OCR | Report chunk text (`report_embeddings.chunk_text`), diagnosis/medicines/notes fields, doctor questions, patient intake chat messages and accumulated structured medical history, and — for OCR — the uploaded document image itself (prescription, lab report, medical certificate) |
| `openrouter.ai` | Same generation/vision-ocr/intake-dialogue features as Gemini above, as a last resort after every Gemini key/model is exhausted — **reachable by default** (`ALLOW_OPENROUTER_FALLBACK=true`); set the flag to `false` to disable it. | Same content as the Gemini row above, for whichever specific request triggered the fallback |
| `api.sarvam.ai` (Sarvam AI) | Voice intake: speech-to-text (patient's spoken answer) and text-to-speech (the assistant's next question, generated from patient context) | The patient's voice recording (transcribed to their spoken symptom/history answer) and the assistant's generated question text |
| `speech.platform.bing.com` (Microsoft Edge TTS, via the `edge-tts-universal` library) | Voice intake text-to-speech, as a last resort if Sarvam TTS fails — **reachable by default** (`ALLOW_EDGE_TTS_FALLBACK=true`); set the flag to `false` to disable it (the turn simply has no audio instead). | The assistant's generated question text (same content as the Sarvam TTS row), for whichever turn triggered the fallback |

Not included above: Supabase (`*.supabase.co`) stores patient data as your own database/file storage, not as an AI/ML inference provider processing it — it's infrastructure you control, not a third party your patient text is sent *to* for processing. Brevo (transactional email) sends OTPs and account notifications, never clinical/medical content, and isn't part of the RAG sub-app.

## 📋 Ask Swastha access audit log

Every request to `POST /rag/api/search/chat` and `POST /rag/api/search` writes one row to `ask_swastha_access_log` — who accessed which patient's records, when, by which route/mode, and whether it was someone other than the patient themselves (a doctor via `doctor_patient`, or a family admin via `family_members` — both go through `patient_user_id` on `search/chat` and are logged identically as `is_cross_patient: true`). A 403 for an unlinked/access-expired doctor or an unlinked family member is logged too (with `mode`/`result_count` left `null`, since no search ever ran).

**Columns**: `id`, `created_at`, `caller_user_id`, `target_patient_id`, `is_cross_patient`, `route` (`search_chat` | `search`), `mode` (`full_context` | `retrieval` | `aggregate` | `last_report`, nullable), `result_count` (nullable), `degraded`.

**Deliberately excluded**: the question text, any excerpt/chunk text, and the generated answer. This table is an access log, not a transcript — it answers "did doctor X look at patient Y's records, and when," not "what did they ask."

Writes are best-effort (`backend/db/askSwasthaAccessLog.js`): an insert failure is logged (ids only) and never fails the underlying search request.

**Retention**: rows older than `AUDIT_LOG_RETENTION_DAYS` (default 365 — see Environment Configuration above) are deleted by `scripts/purge-audit-log.js`, which is not run automatically — schedule it yourself (e.g. a daily cron):

```bash
node scripts/purge-audit-log.js --dry-run   # report how many rows would be deleted
node scripts/purge-audit-log.js             # actually delete them
```

## 🧪 Ask Swastha eval harness

`backend/rag/evals/` runs a set of questions through the REAL search pipeline against whatever DB `backend/.env` points at, and reports whether each one found what it should have. Two modes, via `--mode` (default `conversational`):

- `conversational` — `conversationalSearchService.js`'s `conversationalSearch`, the same code `POST /rag/api/search/chat` uses. Each top-level question gets a fresh session id; an optional `followups` array runs in that SAME session, so a followup can rely on the conversation's own context (e.g. "they" referring back to the parent question).
- `oneshot` — `searchService.js`'s `searchReports`, the same code `POST /rag/api/search` uses. No session, so `followups` (if present on a question) are ignored with a warning.

**Format** (see `backend/rag/evals/questions.example.json`): a JSON array of

```json
{
  "question": "What medicines is this patient currently prescribed?",
  "patient_id": "the patient's real user id",
  "expected_report_ids": ["report ids that must appear in the answer's sources"],
  "must_contain": ["optional", "keywords the answer text must contain"],
  "followups": [
    { "question": "Are any of those a controlled substance?", "must_contain": ["no"] }
  ]
}
```

`expected_report_ids`, `must_contain`, and `followups` are all optional — omit any to skip that check (or skip follow-up turns entirely) for a given question. Each entry in `followups` takes its own `expected_report_ids`/`must_contain`, scored independently against that turn's own answer.

**Real patient data warning**: a useful eval set references real `patient_id`/`report_id` values, so it must never be committed. Questions are read from `backend/rag/evals/questions.local.json`, which is gitignored — only the placeholder `questions.example.json` is tracked. Copy the example, fill in real ids from your own dev/staging DB, and run:

```bash
cp backend/rag/evals/questions.example.json backend/rag/evals/questions.local.json
# edit questions.local.json with real ids, then:
node backend/rag/evals/run-evals.js
# one-shot mode instead (no sessions, followups ignored):
node backend/rag/evals/run-evals.js --mode=oneshot
# or point at a different file:
node backend/rag/evals/run-evals.js --file=path/to/other-questions.json
```

Each question is one row in the summary table: overall pass/fail (a question with followups only passes if every turn in its chain does), the parent turn's mode (`retrieval` | `aggregate` | `full_context`), total latency across all turns, a followup count, and — on failure — which turn(s) failed and why (missing report ids/keywords, or an error). Exits non-zero if anything failed (suitable for a CI gate once you have a question set worth gating on).

**Never run this against production data** as part of routine development — point `backend/.env` at a dev/staging Supabase project, not the live database, unless you specifically intend to eval against real patient records with proper authorization.

## 🚀 Deployment

- **Frontend (Vercel):** `vercel.json` rewrites every path to `index.html` and sends the security headers,
  including an enforced `Content-Security-Policy`. If a new external script, font, image host or API origin is
  added, allow it there or the browser will block it. Set `VITE_API_BASE_URL`, `VITE_RAG_BASE_URL` and
  `VITE_GOOGLE_CLIENT_ID` in the Vercel project.
- **Backend (e.g. Render):** set the variables from `backend/.env.example`. `JWT_SECRET` is required (there is no
  fallback), and `FRONTEND_URL` / `BACKEND_URL` must be set (without `FRONTEND_URL` CORS stays open).
- **Database:** run `supabase/schema/00000000000000_baseline_schema.sql` on a new project, then keep the
  `reports` storage bucket private.
- **Scheduled:** `scripts/purge-audit-log.js` (see the audit log section) is not automatic.

## 🏃 Running the Application

### Installation
From the root directory — there's only one `npm install` now, RAG no longer has its own `package.json`:

```bash
npm install
```

### Starting the Backend & Frontend

| Service | Dev Command | URL / Port | Description |
| :--- | :--- | :--- | :--- |
| **Backend Express API** (incl. RAG at `/rag`) | `npm run dev:backend` | `http://localhost:5001` | Core REST API — auth, family vault, reports, **and** RAG search/extraction/summaries |
| **Vite React Frontend** | `npm run dev:frontend` | `http://localhost:5173` | Main Web Application UI |

### Concurrent Dev Launch (Backend + Frontend)
Launch both simultaneously:

```bash
npm run dev
```

---

## 🛡️ License

Built for **Swastha Healthcare AI**. All rights reserved.