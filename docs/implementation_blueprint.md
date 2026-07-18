# Implementation Blueprint
### Selected Features: WhatsApp Ingestion (1) · Drug Interaction Detector (2) · Regional Language Simplification (6) · Lab Trend Visualization (8) · Smart Semantic Search/RAG (14) · Family Health Vault (15)

These six features are a genuinely good combination — they form one continuous pipeline rather than six disconnected demos. Data flows in through WhatsApp, gets structured once, and every other feature is a different "view" or "check" on that same structured data. Build the pipeline right once, and features 2, 6, 8, and 14 become thin layers on top of it.

---

## 1. How the Features Connect (Mental Model)

```
WhatsApp (1) ─┐
              ├─▶ OCR + LLM Structuring ─▶ Structured Record (FHIR-like JSON)
Web Upload   ─┘         │                          │
                         │                          ├─▶ stored under a Family Profile (15)
                         │                          ├─▶ lab values → time-series table (8)
                         │                          ├─▶ medicines → interaction check (2)
                         │                          ├─▶ text → embedded for search (14)
                         │                          └─▶ "explain in Hindi" on demand (6)
```

Everything downstream depends on **one thing working well**: turning a messy PDF/image/WhatsApp forward into clean structured JSON. Build that first, get it rock solid, and the rest is mostly UI + relatively simple logic on top of data you already have.

---

## 2. Database Schema (PostgreSQL)

```sql
-- Family Health Vault (15)
families (id, primary_account_phone, created_at)
profiles (id, family_id, name, dob, relation, abha_id NULLABLE, created_at)

-- Core document + structured record store (feeds 1, 2, 6, 8, 14)
documents (id, profile_id, source ENUM['whatsapp','web_upload'],
           raw_file_url, ocr_text, uploaded_at, status)

records (id, document_id, profile_id, record_type ENUM['diagnosis','medication','lab_result','note'],
         structured_json JSONB, record_date, created_at)

-- Lab trend visualization (8)
lab_values (id, record_id, profile_id, test_name, value NUMERIC,
            unit TEXT, test_date DATE)

-- Drug interaction detector (2)
medications (id, record_id, profile_id, drug_name_raw, drug_name_normalized,
             dosage, start_date, end_date NULLABLE, active BOOLEAN)
drug_interactions_ref (drug_a, drug_b, severity, description)  -- seed from a public dataset

-- RAG search (14)
record_embeddings (id, record_id, profile_id, chunk_text, embedding VECTOR(1536))
```

This single schema supports all six features — you won't need to touch it again once it's in place, which matters a lot in a time-boxed hackathon.

---

## 3. Feature-by-Feature Build Notes

### Feature 1 — WhatsApp Bot Ingestion
- Use **Twilio's WhatsApp Sandbox** (free, works in minutes — join code + your number, no business verification needed for a demo).
- Webhook receives message → if it has a media attachment (image/PDF), download it → save to `documents` with `source='whatsapp'` → kick off the OCR pipeline → reply back on WhatsApp: *"Got it! Added to [Patient Name]'s health record. ✅"*
- If the sender's phone number isn't linked to a profile yet, reply asking them to first register that number via the web app (or auto-create a profile keyed to that number — faster for demo purposes).
- **Demo tip:** literally forward a real (fake/sample) lab report screenshot live from a phone on stage — this is your strongest opening beat.

### Feature 2 — Drug Interaction & Duplicate Medicine Detector
- Every time a new `medications` row is inserted, run a check against all other `active=true` medications for that `profile_id`.
- Normalize drug names first (map brand names → generic — use a small lookup table you build from ~30-50 common Indian brand/generic pairs; don't try to cover everything, scope it to what you'll demo).
- Check pairs against `drug_interactions_ref` (seed this table from a public open dataset — even 100-200 well-known interaction pairs is enough for a convincing demo).
- If a match is found (or the same generic name appears twice = duplicate), create an alert shown on both the patient timeline and doctor dashboard.
- **Demo tip:** script a specific, realistic pair (e.g., two brand names that map to the same generic, prescribed by two different doctors) so the alert fires reliably live.

### Feature 6 — Regional Language Report Simplification
- Simple, fast to build: on any `record`, add an "Explain in Hindi" button.
- Backend calls an LLM with a fixed system prompt: *"Explain this medical report to a patient in simple [language] at a 10th-grade reading level. Do not suggest treatment changes. Do not diagnose. Only explain what the terms and values mean."*
- Cache the output on the record so you're not re-generating on every view.
- **Demo tip:** show the same report toggle between English and Hindi live — very visual, very fast to build, strong "for India" narrative moment.

### Feature 8 — Lab Trend Visualization
- Whenever OCR/LLM structuring extracts a lab value (e.g., "HbA1c: 8.2%"), also insert a row into `lab_values`.
- Frontend: a simple line chart (Recharts) per test name, plotted against `test_date`, for a given `profile_id`.
- **Demo tip:** pre-load 3-4 historical reports for a demo patient so the chart shows a believable trend (e.g., HbA1c improving over 3 visits) — don't rely on live OCR accuracy for this one, seed the data.

### Feature 14 — Smart Semantic Search (RAG)
- On every new `record`, chunk the `structured_json`/`ocr_text` into short passages, embed each chunk, store in `record_embeddings` (use `pgvector` extension — avoids standing up a separate vector DB in a hackathon).
- Search flow: user types a question ("Has this patient ever had a penicillin reaction?") → embed the query → cosine-similarity search against that profile's `record_embeddings` → pass top 3-5 chunks + question to an LLM → answer **strictly grounded in retrieved chunks**, always show the source document link.
- **Demo tip:** ask a question live that clearly requires cross-referencing 2 different old documents — this is the single most "AI-native" moment in your whole demo, spend real polish time here.

### Feature 15 — Family Health Vault
- One `families` account with multiple `profiles` (self, spouse, kids, parents).
- Dashboard shows a card per family member with: upcoming follow-ups, last visit date, any active alerts (interaction warnings from #2 surface here too).
- Each profile can independently link its own ABHA ID later — but for the hackathon, this is mostly a data-modeling + UI feature, not new AI.
- **Demo tip:** show switching between "Dad's profile" and "Mom's profile" from one login — very relatable for judges, costs almost no build time since your schema already supports it.

---

## 4. Suggested Team Split (4–5 people, 24–36 hrs)

| Role | Owns | Features |
|---|---|---|
| Backend/Pipeline Lead | Ingestion pipeline, OCR + LLM structuring, DB schema | Foundation for all 6 |
| AI/ML Engineer | Drug interaction logic, RAG embedding/search, translation prompts | 2, 6, 14 |
| Integrations Engineer | Twilio WhatsApp webhook, notification replies | 1 |
| Frontend Engineer | Family dashboard, lab charts, document viewer, "explain in Hindi" toggle | 8, 15, UI for 2 & 6 |
| Design/Demo Lead | Demo data seeding, pitch flow, UI polish, backup video recording | All (glue + safety net) |

*(4-person team: merge Integrations into Backend Lead, and Design/Demo into Frontend.)*

---

## 5. Build Order (Time-Boxed)

**Hours 0–6 — Foundation**
- DB schema live
- Web upload → OCR → LLM structuring pipeline working end-to-end for one document type (start with printed lab reports, easiest OCR case)
- Family profile creation flow

**Hours 6–14 — Core Intelligence**
- WhatsApp webhook wired to the same ingestion pipeline
- Drug interaction check firing on medication insert
- Lab values auto-populating `lab_values` table

**Hours 14–22 — Differentiators**
- RAG embedding + search working on at least 5-6 seeded documents
- "Explain in Hindi" button live
- Lab trend charts rendering

**Hours 22–30 — Dashboard + Polish**
- Family vault dashboard tying everything together
- Alerts (interaction warnings) surfaced in UI
- Seed 2-3 realistic demo patients with pre-loaded history (don't rely purely on live OCR for chart-heavy features)

**Hours 30–36 — Demo Rehearsal**
- Run the full demo script 3+ times
- Record a backup video in case live WiFi/OCR fails on stage
- Tighten the pitch to hit every feature within 5 minutes

---

## 6. Suggested Demo Script (Under 5 Minutes)

1. **(0:00–0:45)** Open on the problem: forward a real lab report screenshot to your WhatsApp bot live → it confirms and files it under "Mom's profile" in the Family Vault.
2. **(0:45–1:30)** Switch to the Family Vault dashboard → show Mom's and Dad's profiles side by side, each with their own timeline.
3. **(1:30–2:15)** Open Mom's lab report → tap "Explain in Hindi" → plain-language explanation appears instantly.
4. **(2:15–3:00)** Show the lab trend chart — her HbA1c improving over 3 visits, visually obvious.
5. **(3:00–3:45)** Add a new prescription for Dad that duplicates/interacts with an existing one → alert fires immediately on his profile and the (simulated) doctor dashboard.
6. **(3:45–4:30)** Type a natural-language question into search: *"Has Dad ever been prescribed penicillin?"* → RAG pulls the exact answer with a source link.
7. **(4:30–5:00)** Close with the "so what": *"We didn't rebuild ABHA — we built the intelligence layer India's healthcare data has been missing: one family, one place, in their own language, with AI that actually reads it for them."*

This script hits all six features in order, each one earns its own visible "aha," and the closing line directly reinforces your positioning against ABHA — which is exactly what you set up in your framing earlier.

Want me to write the actual OCR + LLM structuring prompt (the one piece everything else depends on), or the drug-interaction seed dataset/lookup table next?
