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