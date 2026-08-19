# 🩺 Swastha — AI Intelligence Layer on ABHA

**Swastha** is a state-of-the-art healthcare AI intelligence platform designed to organize scattered medical records (PDFs, lab reports, prescriptions) into a unified, searchable timeline. Built as an intelligence layer on top of India's **ABHA (Ayushman Bharat Digital Health Account)** ecosystem, Swastha empowers patients with holistic family health management and provides clinicians with grounded AI insights.

---

## 🛠️ Technology Stack

| Layer | Technologies & Libraries | Description |
| :--- | :--- | :--- |
| **Frontend** (`frontend/`) | **React 18**, **Vite**, **Tailwind CSS**, **React Router v6**, **Recharts**, **Lucide Icons** | Modern responsive SPA featuring medical timeline UI, lab trends chart visualizer, dark mode styling, and redirect-based Google Sign-In. |
| **Backend API** (`backend/`) | **Node.js**, **Express.js** (`:5001`), **Supabase Client SDK**, **Brevo REST API**, **Multer**, **`google-auth-library`**, **JWT** | Core API for user auth, Brevo-powered 6-digit email OTPs, password resets, family vault management, doctor license validation, and local document uploads. |
| **RAG Microservice** (`rag/`) | **Node.js**, **Express.js** (`:3010`), **Google Gemini API**, **OpenRouter API**, **Supabase Client SDK** | Standalone vector search & prescription OCR microservice. Generates 768-dim embeddings (`gemini-embedding-001`) and synthesizes grounded answers via OpenRouter LLMs. |
| **Database & Vector Storage** | **Supabase PostgreSQL**, **`pgvector`** extension | Cloud Postgres database hosting 5 custom tables (`users`, `reports`, `vault_table`, `family_members`, `report_embeddings`) with HNSW cosine vector index. |

---

## 🌟 Key Features

- **🛡️ Secure Multi-Role Authentication**: Patient and Doctor onboarding with redirect-based Google OAuth 2.0 (full-page redirect to Google + `/auth/google/callback`, with account deduplication — avoids ad-blockers breaking popup-based auth), 6-digit email OTP verification via **Brevo HTTPS REST API**, password resets, and JWT session tokens.
- **🔬 Doctor Certificate AI Verification**: Automated parsing and credential validation of medical registration certificates using **Google Gemini 2.0 Flash AI** vision capabilities upon doctor signup.
- **📜 Smart Medical Timeline & OCR Ingestion**: Chronological visual record of consultations, prescriptions, lab reports, and diagnoses. Automatically flags **unclear fields** (e.g. illegible doctor handwriting) to alert clinicians.
- **🔍 Grounded RAG Semantic Search**: Standalone vector search microservice performing `pgvector` similarity search over patient records and synthesizing natural-language answers via **OpenRouter AI**.
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
│   │   ├── users.js                # User accounts persistence layer
│   │   ├── reports.js              # Medical timeline reports persistence layer
│   │   └── family.js               # Family vault & members database operations
│   ├── migrations/                 # Database SQL migrations & schema patches
│   ├── routes/
│   │   ├── auth.js                 # Auth, Google OAuth, Brevo OTPs, Doctor License Verification
│   │   ├── family.js               # Family Vault CRUD & Authorization routes
│   │   └── reports.js              # Timeline & Report Management API endpoints
│   ├── services/
│   │   └── certificateParserService.js # Gemini 2.0 Flash AI Medical License Parser
│   ├── utils/
│   │   ├── mailer.js               # Brevo REST API transactional email sender (OTPs & Invites)
│   │   └── timelineValidation.js   # Input sanitization & validation rules
│   ├── uploads/                    # Local storage for uploaded certificates & reports
│   ├── .env.example                # Backend environment template
│   └── server.js                   # Backend Express server entry point
├── rag/                            # Standalone RAG & Vector Search Microservice (:3010)
│   ├── src/
│   │   ├── config/                 # Gemini, OpenRouter, and Supabase config
│   │   ├── routes/                 # Search (/api/search), Indexing (/api/reports/index), Extraction
│   │   └── services/               # Vector embedding generator & pgvector match engine
│   ├── migrations/                 # pgvector SQL migrations (001_report_embeddings & 002_rpc_function)
│   └── README.md                   # RAG microservice documentation
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
│   │   │   ├── settings/           # Profile Settings & ABHA Account linking
│   │   │   ├── timeline/           # Interactive Timeline UI
│   │   │   └── vault/              # Document Storage Manager
│   │   ├── App.jsx                 # Route declarations & Navigation Guards
│   │   └── main.jsx                # React DOM entry point wrapped with Providers
│   └── vite.config.js              # Vite build configuration
├── package.json                    # Monorepo root script & dependency manifest
└── README.md                       # Main project documentation
```

---

## 🗄️ Supabase Database Architecture (5 Tables)

Run the following SQL snippets in your **Supabase Dashboard > SQL Editor** to construct the complete database schema:

```sql
-- 1. Users Table (Patient & Doctor accounts)
-- Note: patient_code is auto-generated (unique random 6-digit string) for patient accounts
-- in backend/db/users.js and used by doctors to link a patient (see routes/auth.js). If your
-- users table predates this field, add it manually: ALTER TABLE users ADD COLUMN patient_code VARCHAR(10) UNIQUE;
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255),
  picture TEXT,
  role VARCHAR(50) DEFAULT 'patient',
  auth_provider VARCHAR(50) DEFAULT 'email',
  patient_code VARCHAR(10) UNIQUE,
  specialty VARCHAR(255),
  license_number VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Medical Reports & Timeline Table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Family Vault Table
CREATE TABLE IF NOT EXISTS vault_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Family Members Table
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES vault_table(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  age INT,
  dob DATE,
  relationship VARCHAR(100) NOT NULL,
  relationship_tag VARCHAR(100),
  health_overview TEXT,
  notes TEXT,
  last_visit_date DATE,
  next_checkup_date DATE,
  authorization_status VARCHAR(50) DEFAULT 'approved',
  authorization_requested_at TIMESTAMP WITH TIME ZONE,
  authorization_approved_at TIMESTAMP WITH TIME ZONE,
  requested_by_email VARCHAR(255),
  authorized_by_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- 5. Report Vector Embeddings Table (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.report_embeddings (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(768) NOT NULL,
  chunk_index INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT report_embeddings_report_chunk_unique UNIQUE (report_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS report_embeddings_user_id_idx ON public.report_embeddings (user_id);
CREATE INDEX IF NOT EXISTS report_embeddings_embedding_hnsw_idx ON public.report_embeddings USING hnsw (embedding vector_cosine_ops);

-- Similarity Search RPC Function for RAG Service
CREATE OR REPLACE FUNCTION public.match_report_embeddings(
  p_user_id VARCHAR,
  p_query_embedding VECTOR(768),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  report_id UUID,
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
  WHERE re.user_id = p_user_id
  ORDER BY re.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
```

---

## ⚙️ Environment Configuration

### 1. Backend Setup (`backend/.env`)

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

# Google Gemini Vision AI Key (Doctor Certificate Verification & OCR)
GEMINI_API_KEY=your_gemini_api_key_here

# Swastha RAG microservice base URL — triggers AI summary generation on report save
RAG_BASE_URL=http://localhost:3010/api
```

See `backend/.env.example` for the full list, including optional overrides (email sender address, auth-token TTL, custom table/column names).

### 2. Standalone RAG Microservice Setup (`rag/.env`)

```env
PORT=3010
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here

# MUST MATCH backend/.env JWT_SECRET EXACTLY
JWT_SECRET=your_jwt_secret_key_here

CORS_ORIGIN=http://localhost:5173
```

### 3. Frontend Setup (`frontend/.env`)

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:5001/api
```

---

## 🏃 Running the Application

### Installation
From the root directory, install monorepo dependencies and RAG dependencies:

```bash
npm install
cd rag && npm install && cd ..
```

### Starting the Microservices & Frontend

| Service | Dev Command | URL / Port | Description |
| :--- | :--- | :--- | :--- |
| **Backend Express API** | `npm run dev:backend` | `http://localhost:5001` | Core REST API for Auth, Family Vault, Reports |
| **RAG Vector Microservice** | `cd rag && npm run dev` | `http://localhost:3010` | Standalone semantic search & LLM synthesis service |
| **Vite React Frontend** | `npm run dev:frontend` | `http://localhost:5173` | Main Web Application UI |

### Concurrent Dev Launch (Backend + Frontend)
Launch both main backend and frontend simultaneously:

```bash
npm run dev
```

---

## 🛡️ License

Built for **Swastha Healthcare AI**. All rights reserved.