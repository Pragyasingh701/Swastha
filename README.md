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
| **RAG Sub-App** (`backend/rag/`, mounted at `/rag`) | **Google Gemini API**, **OpenRouter API**, **Supabase Client SDK** | Vector search & prescription OCR, running **inside the same Express process and port as the Backend API** (not a separate service — see below). Generates 768-dim embeddings (`gemini-embedding-001`) and synthesizes grounded answers via OpenRouter LLMs. |
| **Database & Vector Storage** | **Supabase PostgreSQL**, **`pgvector`** extension | Cloud Postgres database with dedicated `patients`/`doctors`/`pending_registrations` identity tables (patients and doctors are separate tables, not a shared `users` table with a role column), plus `reports`, `report_embeddings`, `vault_table`, `family_members`, `doctor_patient`, and `notifications`, with an HNSW cosine vector index on embeddings. |

---

## 🌟 Key Features

- **🛡️ Secure Multi-Role Authentication**: Patient and Doctor onboarding with redirect-based Google OAuth 2.0 (full-page redirect to Google + `/auth/google/callback`, with account deduplication — avoids ad-blockers breaking popup-based auth), 6-digit email OTP verification via **Brevo HTTPS REST API**, password resets, and JWT session tokens.
- **🔬 Doctor Certificate AI Verification**: Automated parsing and credential validation of medical registration certificates using **Google Gemini 2.0 Flash AI** vision capabilities upon doctor signup.
- **📜 Smart Medical Timeline & OCR Ingestion**: Chronological visual record of consultations, prescriptions, lab reports, and diagnoses. Automatically flags **unclear fields** (e.g. illegible doctor handwriting) to alert clinicians.
- **🔍 Grounded RAG Semantic Search**: The RAG sub-app (mounted inside the backend at `/rag`) performs `pgvector` similarity search over patient records and synthesizes natural-language answers via **OpenRouter AI**.
- **👨‍👩‍👧‍👦 Family Vault & Authorization Network**: Centralized health management for families. Manage dependants (children/elders) and send email-authorized consent requests for adult family members.
- **📊 AI Lab Trends Visualizer**: Interactive trend analysis powered by **Recharts**, tracking blood work, lab parameters, and vital metrics over time.
- **👨‍⚕️ Doctor Clinical Dashboard**: Dedicated portal allowing verified healthcare professionals to link patients by their unique 6-digit **patient code** (or user ID), then search records, view past diagnoses, active medications, and medical history.

---

## 📁 Repository Structure

```
Swastha/
├── backend/                        # Node.js & Express API Server (:5001)
│   ├── config/
│   │   └── supabase.js             # Supabase Client SDK initialization
│   ├── db/
│   │   ├── users.js                # Identity dispatcher across patients/doctors/pending_registrations
│   │   ├── reports.js              # Medical timeline reports persistence layer
│   │   ├── family.js               # Family vault & members database operations
│   │   ├── doctorPatients.js       # Doctor↔patient link requests (accept/decline, patient_code lookup)
│   │   └── notifications.js        # In-app notification bell persistence layer
│   ├── rag/                        # RAG sub-app — was standalone rag/, merged in and mounted at /rag
│   │   ├── config/                 # Gemini, OpenRouter, and Supabase config
│   │   ├── routes/                 # Search, indexing, extraction, lab insights, patient summaries
│   │   ├── services/                # Vector embedding generator & pgvector match engine
│   │   ├── langchain/               # Conversational search session store & retriever
│   │   └── app.js                   # Express sub-app, dynamically imported + mounted by server.js
│   ├── migrations/                 # Old pgvector migrations (001/002) — current ones live in
│   │                                # supabase/migrations/ at the repo root, see DB Architecture below
│   ├── routes/
│   │   ├── auth.js                 # Auth, Google OAuth, Brevo OTPs, Doctor License Verification
│   │   ├── family.js               # Family Vault CRUD & Authorization routes
│   │   ├── reports.js              # Timeline & Report Management API endpoints
│   │   └── doctorPatients.js       # Doctor↔patient linking & notification endpoints
│   ├── services/
│   │   └── certificateParserService.js # Gemini 2.0 Flash AI Medical License Parser
│   ├── utils/
│   │   ├── mailer.js               # Brevo REST API transactional email sender (OTPs & Invites)
│   │   └── timelineValidation.js   # Input sanitization & validation rules
│   ├── uploads/                    # Local storage for uploaded certificates & reports
│   ├── .env.example                # Backend environment template — also covers the RAG sub-app now
│   └── server.js                   # Express entry point; mounts backend/rag/app.js at /rag
├── frontend/                       # React 18 + Vite + Tailwind CSS Frontend SPA (:5173)
│   ├── src/
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Global Auth Provider & Route Guard state
│   │   ├── modules/
│   │   │   ├── authentication/     # Login, Register, RoleSelection, VerifyOTP, ResetPassword
│   │   │   ├── dashboard/          # Patient & Doctor Main Dashboards
│   │   │   ├── doctor/             # Doctor Portal & Patient Inspector components
│   │   │   ├── family/             # Family Health Vault interface
│   │   │   ├── landing/            # Dynamic Landing Page
│   │   │   ├── reports/            # Report Uploader & Lab Trends visualizer
│   │   │   ├── search/             # Universal AI Medical Search module
│   │   │   ├── settings/           # Profile Settings
│   │   │   ├── timeline/           # Interactive Timeline UI
│   │   │   └── vault/              # Document Storage Manager
│   │   ├── App.jsx                 # Route declarations & Navigation Guards
│   │   └── main.jsx                # React DOM entry point wrapped with Providers
│   └── vite.config.js              # Vite build configuration
├── package.json                    # Monorepo root script & dependency manifest
└── README.md                       # Main project documentation
```

---

## 🗄️ Supabase Database Architecture (9 Tables + 1 View)

**Patients and doctors are separate tables**, not a shared `users` table with a role column — that
split (`patients` / `doctors` / `pending_registrations`, replacing the old single `users` table)
landed in a dedicated DB reorg; see `db-schema-current.md`, `db-reorg-plan.md`, and
`supabase/migrations/` at the repo root for the full history if you need it.

`reports`, `report_embeddings`, `vault_table`, and `family_members` all reference `patients.id` via
a **`patient_id`** column (renamed from `user_id` in the same reorg) — grep the codebase for
`user_id` in a table-column context and you're looking at stale code, not the current schema.

⚠️ **`doctor_patient`, `vault_table`, `family_members`, and `notifications` have no `CREATE TABLE`
migration in this repo** — they were created by hand in the Supabase dashboard before migrations
were adopted, so the definitions below are reconstructed from `db-schema-current.md`'s verified
`pg_dump` capture and the application code (`backend/db/*.js`), not copied from a migration file.
Cross-check against **Supabase Dashboard → Table Editor** before relying on this to bootstrap a
fresh project. (`patients`, `doctors`, `pending_registrations`, `reports`' FKs/indexes, and
`report_embeddings` *do* have real migrations — those blocks below are copied verbatim.)

Run the following in your **Supabase Dashboard > SQL Editor** to construct the schema:

```sql
-- 1. Patients (from supabase/migrations/20260819171220_create_patients_doctors_pending_tables.sql)
CREATE TABLE public.patients (
  id                   VARCHAR PRIMARY KEY,
  email                VARCHAR NOT NULL UNIQUE,
  name                 VARCHAR,
  picture              TEXT,
  password_hash        VARCHAR,
  auth_provider        VARCHAR,
  phone                TEXT,
  dob                  TEXT,
  gender               TEXT,
  blood_group          TEXT,
  patient_code         TEXT UNIQUE, -- doctors link a patient by this 6-digit code
  verification_status  TEXT DEFAULT 'verified',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Doctors
CREATE TABLE public.doctors (
  id                   VARCHAR PRIMARY KEY,
  email                VARCHAR NOT NULL UNIQUE,
  name                 VARCHAR,
  picture              TEXT,
  password_hash        VARCHAR,
  auth_provider        VARCHAR,
  phone                TEXT,
  dob                  TEXT,
  gender               TEXT,
  specialty            VARCHAR,
  license_number       VARCHAR,
  council              TEXT,
  degree               TEXT,
  experience           TEXT,
  hospital_name        TEXT,
  address              TEXT,
  reg_certificate_url  TEXT,
  cert_extracted_data  JSONB,      -- reserved for a future HPR certificate flow, unpopulated today
  license_expiry_date  DATE,       -- same
  verification_status  TEXT DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Pending Registrations (signed up, hasn't picked patient/doctor yet)
CREATE TABLE public.pending_registrations (
  id                   VARCHAR PRIMARY KEY,
  email                VARCHAR NOT NULL UNIQUE,
  name                 VARCHAR,
  picture              TEXT,
  password_hash        VARCHAR,
  auth_provider        VARCHAR,
  verification_status  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read-only convenience view for the login lookup path — a UNION across all
-- 3 identity tables, not a merge. Lets auth code check one place for "does
-- this email exist, and with which password_hash / role."
CREATE VIEW public.auth_identities AS
  SELECT id, email, password_hash, auth_provider, 'patient'::text AS role FROM public.patients
  UNION ALL
  SELECT id, email, password_hash, auth_provider, 'doctor'::text AS role FROM public.doctors
  UNION ALL
  SELECT id, email, password_hash, auth_provider, 'none'::text AS role FROM public.pending_registrations;

-- 4. Medical Reports & Timeline Table
-- NOTE: id is BIGINT (verified via pg_dump), not UUID, despite this table
-- predating migrations — report_embeddings.report_id below has always
-- referenced it as bigint, so declaring it UUID here would be inconsistent.
CREATE TABLE public.reports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_id VARCHAR REFERENCES public.patients(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  doctor VARCHAR(255),
  hospital VARCHAR(255),
  category VARCHAR(100) DEFAULT 'General',
  report_date DATE NOT NULL,
  diagnosis TEXT,
  medicines TEXT,
  notes TEXT,
  file_url TEXT,
  unclear_fields TEXT[] DEFAULT '{}',
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reports_patient_id_idx ON public.reports(patient_id);

-- 5. Report Vector Embeddings Table (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.report_embeddings (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  patient_id VARCHAR NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(768) NOT NULL,
  chunk_index INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT report_embeddings_report_chunk_unique UNIQUE (report_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS report_embeddings_user_id_idx ON public.report_embeddings (patient_id);
CREATE INDEX IF NOT EXISTS report_embeddings_embedding_hnsw_idx ON public.report_embeddings USING hnsw (embedding vector_cosine_ops);

-- 6. Family Vault Table (⚠️ hand-created, see note above)
CREATE TABLE public.vault_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id TEXT,   -- family_members.vault_id links here BY VALUE, not by FK
  patient_id VARCHAR REFERENCES public.patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vault_table_patient_id_idx ON public.vault_table(patient_id);

-- 7. Family Members Table (⚠️ hand-created, see note above)
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id TEXT NOT NULL DEFAULT '',
  patient_id VARCHAR REFERENCES public.patients(id) ON DELETE CASCADE,
  parent_member_id TEXT,          -- self-referential-by-value, for nested family trees
  name VARCHAR(255) NOT NULL,
  age INT,
  dob DATE,
  relationship VARCHAR(100) NOT NULL,
  relationship_tag VARCHAR(100),
  health_overview TEXT,
  notes TEXT,
  conditions JSONB,
  last_visit_date DATE,
  next_checkup_date DATE,
  authorization_status VARCHAR(50) DEFAULT 'approved',
  authorization_token TEXT,
  authorization_requested_at TIMESTAMPTZ,
  authorization_approved_at TIMESTAMPTZ,
  consent_given_at TIMESTAMPTZ,
  requested_by_email VARCHAR(255),
  authorized_by_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS family_members_patient_id_idx ON public.family_members(patient_id);
CREATE INDEX IF NOT EXISTS idx_family_members_parent_member_id ON public.family_members(parent_member_id);

-- 8. Doctor ↔ Patient Link Table (⚠️ hand-created, see note above)
-- A doctor sends a link request (status='pending'); the patient accepts or
-- declines, in-app or via a one-shot emailed token (email_action_token).
CREATE TABLE public.doctor_patient (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id VARCHAR NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id VARCHAR REFERENCES public.patients(id) ON DELETE CASCADE,
  -- Denormalized snapshot of the patient's info at link time (can drift from patients.*):
  patient_code TEXT,
  patient_email TEXT,
  patient_name TEXT,
  patient_phone TEXT,
  patient_gender TEXT,
  patient_dob TEXT,
  patient_blood_group TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,       -- when the patient accepted/declined; NULL = no response yet
  email_action_token TEXT,        -- one-shot accept/decline token sent by email
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT doctor_patient_unique UNIQUE (doctor_id, patient_id)
);
CREATE INDEX IF NOT EXISTS doctor_patient_doctor_id_idx ON public.doctor_patient(doctor_id);
CREATE INDEX IF NOT EXISTS doctor_patient_patient_id_idx ON public.doctor_patient(patient_id);
CREATE INDEX IF NOT EXISTS doctor_patient_status_idx ON public.doctor_patient(status);
CREATE UNIQUE INDEX IF NOT EXISTS doctor_patient_email_action_token_idx
  ON public.doctor_patient(email_action_token) WHERE email_action_token IS NOT NULL;

-- 9. Notifications Table (⚠️ hand-created, see note above)
-- Powers the in-app notification bell for logins, family/vault changes, and
-- the doctor<->patient link workflow. recipient_id/actor_id are TEXT (not
-- UUID) because Swastha's application-generated IDs (e.g. usr_g_...) aren't
-- UUIDs. See backend/db/notifications.js for the full event_type list.
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT DEFAULT 'system', -- 'patient' | 'doctor' | 'family_admin' | 'system'
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON public.notifications (recipient_id, created_at DESC);

-- Similarity Search RPC Function for RAG Service
-- p_user_id is kept as the parameter name deliberately (external API surface
-- called from rag/) even though the column it filters on is now patient_id.
CREATE OR REPLACE FUNCTION public.match_report_embeddings(
  p_user_id VARCHAR,
  p_query_embedding VECTOR(768),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  report_id BIGINT,
  chunk_text TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    re.id,
    re.report_id,
    re.chunk_text,
    re.chunk_index,
    1 - (re.embedding <=> p_query_embedding) AS similarity
  FROM public.report_embeddings re
  WHERE re.patient_id = p_user_id
  ORDER BY re.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
```

⚠️ **RLS note**: every table above gets Row Level Security auto-enabled with **zero policies** the
moment it's created (an `ensure_rls` event trigger in this Supabase project does this automatically
— see `db-schema-current.md`). That means **deny-all** to the `anon`/`authenticated` keys; the app
only works because both the main backend code and the RAG sub-app connect with `SUPABASE_SERVICE_ROLE_KEY`, which
bypasses RLS. There is no database-level scoping — every query in the codebase must manually filter
by `patient_id`/`recipient_id`/etc. If you ever add a direct browser→Supabase call, it will silently
return nothing until real RLS policies are written.

---

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
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5001

# Supabase Credentials
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
SUPABASE_REPORTS_BUCKET=reports

# Brevo Transactional Email Key (for OTPs & Password Resets)
BREVO_API_KEY=your_brevo_api_key_here

# Google Gemini API key(s) — vision/OCR (doctor certificate parsing, report
# extraction) AND, for the RAG sub-app, embeddings (gemini-embedding-001).
# Comma-separate multiple keys as GEMINI_API_KEYS to rotate on rate-limit (429);
# singular GEMINI_API_KEY also still works. Free at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here
# GEMINI_API_KEYS=key_one,key_two

# OpenRouter — required by the RAG sub-app for grounded answer generation.
# Free key at https://openrouter.ai/keys
OPENROUTER_API_KEY=your_openrouter_api_key_here

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