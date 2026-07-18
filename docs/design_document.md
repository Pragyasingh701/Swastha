# Design Document
## [Project Name TBD] — AI Intelligence Layer on ABHA

**Version:** 1.0 (Hackathon Build)
**Status:** Draft
**Team:** _____________

---

## 1. Overview

### 1.1 Problem Statement
Patients in India have medical records scattered across WhatsApp forwards, physical folders, and disconnected hospital systems. ABDM/ABHA solved the **identity and storage** problem at national scale, but it remains a passive record store — nobody structures the chaos, explains it in the patient's language, tracks trends, catches dangerous drug conflicts, or lets a doctor understand a patient in seconds instead of minutes.

### 1.2 Product Positioning
This is **not** a competitor to ABHA. It is an intelligence layer built on top of it:

| ABHA already provides | This product adds |
|---|---|
| Unique lifetime Health ID | Structuring of messy, unstructured documents (PDFs, photos, WhatsApp forwards) |
| Record storage | AI-generated trends, summaries, and alerts on top of that storage |
| Consent-based sharing | A usable, doctor-facing and patient-facing intelligence UI |
| Hospital/HIP integration | A WhatsApp-native, zero-friction ingestion channel |

### 1.3 In Scope (Hackathon Build — 6 Core Features)
1. WhatsApp Bot Ingestion
2. Drug Interaction & Duplicate Medicine Detector
3. Regional Language Report Simplification
4. Lab Trend Visualization
5. Smart Semantic Search (RAG)
6. Family Health Vault

### 1.4 Out of Scope (For This Build)
- Production ABDM/HIU certification (sandbox only)
- Real-time wearable device integration
- Handwriting OCR at production accuracy
- Payment/insurance workflows
- Native mobile apps (web-first, responsive)

---

## 2. Goals & Success Criteria

| Goal | Success Metric (for demo) |
|---|---|
| Ingest a real-world messy document | A live WhatsApp-forwarded report is structured and filed within ~10 seconds |
| Catch a real safety issue | Drug interaction/duplicate alert fires correctly on a seeded example |
| Be usable by non-English-first patients | "Explain in Hindi" produces a clear, accurate plain-language summary |
| Show clinical value over time | Lab trend chart renders a believable multi-visit trend |
| Prove AI-native retrieval | A natural-language question is answered correctly, grounded in the right source document |
| Support real Indian household usage | One login manages multiple family profiles cleanly |

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  WhatsApp User  │────▶│  Twilio Webhook   │────▶│                      │
└────────────────┘     └──────────────────┘     │                      │
                                                    │   Ingestion Service  │
┌────────────────┐                                 │  (OCR + LLM          │
│   Web Frontend  │────▶  Upload API  ─────────────▶  Structuring)        │
└────────────────┘                                 │                      │
                                                    └──────────┬───────────┘
                                                               │
                                          ┌────────────────────┼────────────────────┐
                                          ▼                    ▼                    ▼
                                 ┌────────────────┐   ┌────────────────┐  ┌──────────────────┐
                                 │  Medications /  │   │  Lab Values     │  │  Embeddings /     │
                                 │  Interaction     │   │  (Time-series)  │  │  RAG Index        │
                                 │  Engine          │   │                 │  │                   │
                                 └────────────────┘   └────────────────┘  └──────────────────┘
                                          │                    │                    │
                                          └────────────────────┼────────────────────┘
                                                               ▼
                                                    ┌──────────────────────┐
                                                    │  PostgreSQL (+pgvector)│
                                                    └──────────┬───────────┘
                                                               │
                                                    ┌──────────────────────┐
                                                    │   REST API (Backend)  │
                                                    └──────────┬───────────┘
                                                               │
                                          ┌────────────────────┼────────────────────┐
                                          ▼                    ▼                    ▼
                                 ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐
                                 │  Patient Web     │  │  Doctor Dashboard │  │  Family Vault UI  │
                                 │  App (React)      │  │  (React)          │  │  (React)          │
                                 └────────────────┘  └──────────────────┘  └──────────────────┘
```

### 3.2 Architecture Principles
- **Single ingestion pipeline, multiple consumers** — WhatsApp and web upload both feed the same OCR → LLM structuring step, so every downstream feature (interaction check, charts, search, translation) works identically regardless of source.
- **Structure once, reuse everywhere** — every feature reads from the same `records` table rather than re-parsing documents per feature.
- **Consent-aware by design** — even though this build uses ABDM's sandbox, the data model treats every cross-profile or doctor-facing data access as a permissioned action, mirroring ABDM's real consent model.

---

## 4. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Tailwind CSS | Patient app, doctor dashboard, family vault as separate route groups in one app |
| Charts | Recharts | Lab trend visualization |
| Backend | FastAPI (Python) or Node/Express | Python preferred if OCR/ML pieces are Python-based |
| Database | PostgreSQL + `pgvector` extension | One DB for structured records + embeddings — avoids standing up a separate vector store |
| File Storage | Supabase Storage / S3 / Cloudinary | Raw uploaded documents |
| OCR | Tesseract (open-source) or a cloud OCR API | Printed text first; handwriting out of scope for MVP |
| LLM | Claude or GPT via API | Structuring, translation, RAG answer synthesis, interaction explanations |
| Embeddings | OpenAI/Anthropic embedding API or open-source model | For RAG search |
| Messaging | Twilio WhatsApp Sandbox | No business verification needed for hackathon demo |
| Auth | Phone OTP (mock/sandbox) | Mirrors ABHA's real OTP-based login pattern |
| Deployment | Vercel (frontend) + Railway/Render (backend) + Supabase/Neon (Postgres) | Fast, free-tier friendly |

---

## 5. Data Model

```sql
-- Family Health Vault
families (id, primary_account_phone, created_at)
profiles (id, family_id, name, dob, relation, abha_id NULLABLE, created_at)

-- Document + structured record store
documents (id, profile_id, source ENUM['whatsapp','web_upload'],
           raw_file_url, ocr_text, uploaded_at, status)

records (id, document_id, profile_id, record_type ENUM['diagnosis','medication','lab_result','note'],
         structured_json JSONB, record_date, created_at)

-- Lab trend visualization
lab_values (id, record_id, profile_id, test_name, value NUMERIC,
            unit TEXT, test_date DATE)

-- Drug interaction detector
medications (id, record_id, profile_id, drug_name_raw, drug_name_normalized,
             dosage, start_date, end_date NULLABLE, active BOOLEAN)
drug_interactions_ref (drug_a, drug_b, severity, description)

-- RAG search
record_embeddings (id, record_id, profile_id, chunk_text, embedding VECTOR(1536))

-- Alerts (surfaces interaction warnings across UI)
alerts (id, profile_id, type ENUM['interaction','duplicate'], message,
        source_record_ids INT[], created_at, resolved BOOLEAN)
```

**Design rationale:** every feature after ingestion is a read (or a simple derived write) against this schema — no feature needs its own separate data pipeline, which keeps the build achievable in the hackathon timeframe.

---

## 6. API Design (Core Endpoints)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/webhook/whatsapp` | Twilio webhook — receives media, triggers ingestion |
| `POST` | `/api/documents/upload` | Web upload entry point |
| `GET` | `/api/profiles/{family_id}` | List family members for the vault dashboard |
| `POST` | `/api/profiles` | Create a new family member profile |
| `GET` | `/api/profiles/{id}/timeline` | Full structured record timeline for a profile |
| `GET` | `/api/profiles/{id}/lab-trends?test=HbA1c` | Time-series lab values for charting |
| `GET` | `/api/profiles/{id}/alerts` | Active interaction/duplicate alerts |
| `POST` | `/api/records/{id}/explain?lang=hi` | Generate/fetch plain-language translation |
| `POST` | `/api/search` | Natural-language question → RAG-grounded answer |
| `GET` | `/api/doctor/queue` | Doctor-facing prioritized patient list (if built) |

---

## 7. AI/ML Pipeline Design

### 7.1 Ingestion & Structuring (shared by all features)
```
Raw file/image
   → OCR (extract raw text)
   → LLM structuring prompt (extract: record_type, diagnosis, medications,
       lab values w/ units & dates, doctor name, visit date)
   → Validate/parse into JSON schema
   → Write to `records`, fan out to `lab_values` / `medications` as applicable
   → Chunk + embed text → write to `record_embeddings`
```

### 7.2 Drug Interaction Check
```
On new `medications` insert:
   → normalize drug name (brand → generic lookup table)
   → compare against all other active medications for the profile
   → check pairs against `drug_interactions_ref`
   → if match or duplicate generic found → insert into `alerts`
```

### 7.3 Regional Language Simplification
```
On request:
   → fetch record's structured_json / ocr_text
   → LLM prompt: "Explain in [language], 10th-grade reading level,
       no treatment advice, no diagnosis, only explain terms/values"
   → cache result on the record
```

### 7.4 RAG Search
```
On query:
   → embed user question
   → cosine similarity search over profile's record_embeddings (pgvector)
   → top-k chunks + question → LLM (answer strictly grounded in chunks)
   → return answer + source document references
```

**Guardrail applied to every LLM prompt in this system:** explicitly instructed to explain, flag, or summarize — never to diagnose or prescribe. This is both a safety requirement and a strong point to state explicitly to judges.

---

## 8. UI/UX Flows

### 8.1 Patient Flow
`Login (phone OTP)` → `Family Vault (select profile)` → `Timeline` → `Tap a record` → `Explain in Hindi / View lab trend` → `Ask a question (search)`

### 8.2 New Document Flow
`Forward on WhatsApp OR upload on web` → `Bot/UI confirms receipt` → `Auto-appears in timeline within seconds` → `Alerts fire if relevant`

### 8.3 Doctor Flow (if built)
`Search/scan patient ID` → `AI summary card` → `Full timeline on demand` → `Interaction alerts surfaced inline`

---

## 9. Security & Privacy Considerations
- All LLM prompts are scoped to a single profile's data — no cross-patient data leakage in retrieval.
- Alerts and search are profile-scoped; family members do not automatically see each other's full detail without explicit selection (mirrors consent-first principle).
- Raw files stored in access-controlled object storage, not public buckets.
- For the hackathon: use only synthetic/sample patient data — never real personal health information.

---

## 10. Non-Functional Requirements

| Requirement | Target (for demo) |
|---|---|
| Ingestion latency | < 10–15 seconds from WhatsApp forward to timeline entry |
| Search response time | < 5 seconds |
| Availability | Demo-day stability over production-grade uptime |
| Data seeding | 2–3 fully pre-loaded demo profiles as a fallback if live OCR underperforms |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OCR accuracy on live photos is unreliable | Rehearse one specific live document; seed historical data for trend/chart features |
| LLM structuring produces malformed JSON | Strict JSON schema + retry/validation step; fallback to manual field mapping for edge cases |
| WiFi/API failure during live demo | Pre-recorded backup video of the full flow |
| Judges question ABHA overlap | Explicit "what ABHA provides vs. what we add" slide, stated early in the pitch |

---

## 12. Future Roadmap (Post-Hackathon)
- Real ABDM sandbox → production HIU certification path
- Doctor dashboard with prioritized queue and referral intelligence
- Chronic disease monitoring and AI follow-up reminders
- Handwriting OCR investment for real prescription digitization
- Vaccination intelligence and gap detection for the family vault

---

## Appendix: 5-Minute Demo Script Alignment
This design directly supports the rehearsed demo arc: **WhatsApp forward → Family Vault → Hindi explanation → Lab trend chart → Interaction alert → RAG search question** — each step maps to a specific, already-scoped API endpoint and pipeline stage above, so the demo requires no functionality beyond what's designed here.
