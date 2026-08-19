# Swastha — DB ↔ Code Cross-Reference (Phase 2)

**Captured:** 2026-08-19
**Method:** Static analysis of `backend/`, `rag/`, `frontend/src/`, `scripts/`
cross-referenced against the verified Phase 1 schema (`backups/schema-2026-08-19.sql`).
**Read-only. No database or code changes made.**

---

## Executive summary

| Finding | Impact |
|---|---|
| **Frontend NEVER touches Supabase directly** | 🟢 Big win. All DB access is server-side. Table/column renames require **zero frontend query changes**. |
| **3 of 6 table names are env-overridable** | 🟢 `reports`, `vault_table`, `family_members` can be renamed via env var, decoupling migration from deploy. `users`, `doctor_patient`, `report_embeddings` are hardcoded. |
| **Code already fakes the patient/doctor split** | 🔴 `backend/db/users.js:325-335` manually NULLs 10 doctor-only columns when role ≠ doctor. The split you want is already being simulated in application code. |
| **Role switching is a supported feature** | ⚠️ `updateUserRole()` lets a user flip patient↔doctor. **This is the hardest constraint on the split** — needs your decision. |
| **5 fields exist in code but NOT in the DB** | 🟡 `emergencyContact`, `consultationFee`, `bio`, `hasSelectedRole`, `fullName` are returned by the API but never persisted — **silent data loss**, not a crash. |
| **`reports.updated_date` is 100% dead** | 🟢 Zero code references, 0/12 rows populated. Safe drop. |
| **`users.created_at` never written** | 🟡 Present in the in-memory object but **omitted from `dbPayload`** — the bug behind 0/9 populated. |

---

## Complete object-by-object cross-reference

### Table: `users` — 🔴 the table to split

**Accessed in 3 files** (backend only — `rag/` never queries it):

| File | Lines | Operation |
|---|---|---|
| `backend/db/users.js` | 19, 50, 71, 266, 270, 280, 323, 350, 372 | select / update / upsert / delete |
| `backend/db/doctorPatients.js` | 68, 148 | select (patient lookup for linking) |
| `backend/routes/auth.js` | 1107 | select |

Table name is **hardcoded** as `.from('users')` — no env indirection.

| Column | Used? | Where / Notes |
|---|---|---|
| `id` | ✅ | PK. Generated in app: `'usr_' + Date.now()` (`users.js:93`), `'usr_g_' + sub` for Google (`auth.js:430,571`) |
| `email` | ✅ | Lookup key (`users.js:52`). ⚠️ **No UNIQUE constraint** |
| `name` | ✅ | Written in `dbPayload` |
| `picture` | ✅ | Google avatar |
| `role` | ✅ | **Branch point** — see [role branching](#role-branching-the-split-evidence) |
| `auth_provider` | ✅ | `'email'` / `'google'` |
| `password_hash` | ✅ | `users.js:372` (reset), email auth only |
| `phone`, `dob`, `gender` | ✅ | Shared fields |
| `blood_group` | ✅ | **Patient-only in practice** |
| `patient_code` | ✅ | `users.js:20-21` lookup. **Patient-only** |
| `specialty` | ✅ | **Doctor-only.** NULLed on role switch (`users.js:325`) |
| `license_number` | ✅ | **Doctor-only.** NULLed (`:326`) |
| `council` | ✅ | **Doctor-only.** NULLed (`:327`) |
| `degree` | ✅ | **Doctor-only.** NULLed (`:328`) |
| `experience` | ✅ | **Doctor-only.** NULLed (`:329`). Parsed `parseInt()` |
| `hospital_name` | ✅ | **Doctor-only.** NULLed (`:330`) |
| `address` | ✅ | **Doctor-only.** NULLed (`:331`) |
| `reg_certificate_url` | ✅ | **Doctor-only.** NULLed (`:332`) |
| `verification_status` | ✅ | Doctor → `'pending'`, patient → `'verified'` (`:335`) |
| `cert_extracted_data` | ⚠️ | Written (`:333`) but **0/9 populated** — HPR cert parsing likely unfinished |
| `license_expiry_date` | ⚠️ | Written (`:334`) but **0/9 populated** |
| `updated_at` | ✅ | Written on every update |
| `created_at` | 🔴 | **BUG.** Set on the returned object but **omitted from `dbPayload`** (`users.js:231-253` writes only `updated_at`) → never persisted. 0/9 in DB. |

#### 🔴 Fields in code but NOT in the database

Returned by the API and consumed by the frontend, but **never written to any column** — they vanish on reload:

| Field | Code location | DB column? |
|---|---|---|
| `emergencyContact` / `emergency_contact` | `users.js:138,202-203` | ❌ absent |
| `consultationFee` | `users.js:161,223` | ❌ absent |
| `bio` | `users.js:224` | ❌ absent |
| `hasSelectedRole` | `users.js:99,190` | ❌ absent (derived from `role`) |
| `fullName` | `users.js:186` | ❌ absent (alias of `name`) |

**Not a crash** — `dbPayload` is built from an explicit allowlist, so the
extra keys are simply dropped. But any UI relying on them silently loses data.

---

### Table: `reports` — 12 rows

**Name is env-overridable:** `REPORTS_TABLE_NAME` → default `'reports'`
(`backend/db/reports.js:3`). Currently **not set**, so the default applies.

| File | Lines | Notes |
|---|---|---|
| `backend/db/reports.js` | 81, 106, 150, 191, 228 | Full CRUD via `REPORTS_TABLE` constant |
| `backend/routes/reports.js` | — | Route layer |
| `rag/src/services/searchService.js` | 71-72 | `select('id, title, category, report_date, file_url')` |
| `rag/src/services/conversationalSearchService.js` | 111-112 | Same projection |

| Column | Used? | Notes |
|---|---|---|
| `id`, `user_id`, `title`, `doctor`, `hospital`, `category`, `report_date`, `diagnosis`, `medicines`, `notes`, `file_url` | ✅ | Actively read+written |
| `unclear_fields` | ✅ | `reports.js:142`. 2/12 rows non-empty |
| `source` | ⚠️ | Written but **always `'manual'`** (1 distinct value) — effectively a constant |
| `created_at`, `updated_at` | ✅ | `updated_at` 12/12 populated |
| `updated_date` | 🔴 **DEAD** | **Zero** code references anywhere. **0/12** populated. Safe to drop. |

> `notes` is special: `buildStoredNotes()` packs AI analysis into it with an
> `[AI Analysis]` marker and `parseStoredNotes()` splits it back out
> (`reports.js:24-25`). The `analysis` "field" is **not** a column — it's
> encoded inside `notes`.

---

### Table: `report_embeddings` — 14 rows

**Only `rag/` touches it.** Name hardcoded.

| File | Lines |
|---|---|
| `rag/src/services/embeddingService.js` | 59, 94, 106, 131 |
| `rag/src/langchain/reportRetriever.js` | 47 (via RPC) |

All 7 columns actively used. ✅ **Healthiest table** — the only one with a
migration, an FK, and proper indexes.

---

### Table: `doctor_patient` — 4 rows

Name hardcoded in both consumers.

| File | Lines | Purpose |
|---|---|---|
| `backend/db/doctorPatients.js` | 47, 113, 172, 202, 232 | Link CRUD |
| `rag/src/services/doctorAuthService.js` | 18 | **Authorization gate** for doctor→patient search |

| Column | Used? | Notes |
|---|---|---|
| `doctor_id`, `patient_id` | ✅ | The actual relationship |
| `patient_email`, `patient_name`, `patient_phone`, `patient_gender`, `patient_dob`, `patient_blood_group` | ✅ | **Denormalized copies of `users`** — read directly for the patient list, so they can silently drift |
| `patient_code` | ✅ | 2 references |
| `created_at` | ✅ | |
| `updated_at` | 🔴 **DEAD** | Never referenced; NULL in all 4 rows |

⚠️ No UNIQUE on `(doctor_id, patient_id)`; `doctorPatients.js` compensates
with a manual existence check before insert (race-prone).

---

### Table: `vault_table` — 7 rows

**Env-overridable:** `FAMILY_VAULT_TABLE_NAME` (`family.js:4`). Not set.
Only consumer: `backend/db/family.js` (185, 207, 223, 238, 499).
All 6 columns used ✅ (incl. `deleted_at` soft delete).

### Table: `family_members` — 8 rows

**Env-overridable:** `FAMILY_MEMBERS_TABLE_NAME` (`family.js:5`). Not set.
Only consumer: `backend/db/family.js` (266–499, 9 call sites).

**All 21 columns actively used** ✅ including the full 6-column authorization
workflow. No dead columns.

⚠️ PK is named `family_vault_pkey` (leftover from a rename) — cosmetic.

---

### Functions

| Function | Called from | Status |
|---|---|---|
| `match_report_embeddings` | `rag/src/services/searchService.js:40`, `rag/src/langchain/reportRetriever.js:47` | ✅ Active — the security boundary for search |
| `rls_auto_enable` | **Never called from code** | ✅ Correct — it's an event trigger (`ensure_rls`), fires automatically on `CREATE TABLE` |

### Storage

`SUPABASE_REPORTS_BUCKET` → default `'reports'`
(`backend/config/supabaseStorage.js:4`). Not set. Used at lines 29, 40.

---

## Role branching — the split evidence

Every place patient/doctor logic diverges server-side:

| File:line | Branch | What it does |
|---|---|---|
| `backend/db/users.js:100` | `isDoctor = role === 'doctor'` | Gates doctor-field validation |
| `backend/db/users.js:325-334` | `role === 'doctor' ? … : null` | **NULLs 10 doctor columns** for non-doctors |
| `backend/db/users.js:335` | ternary | `verification_status`: doctor→`pending`, patient→`verified` |
| `backend/routes/auth.js:686` | `targetRole === 'patient'` | Patient-specific registration path |
| `backend/routes/auth.js:709` | `targetRole === 'doctor'` | Doctor registration (license/council/degree required) |
| `backend/routes/auth.js:778` | `isDoctor = …` | Response shaping |
| `backend/routes/family.js:485` | `user.role !== 'doctor'` | Doctor-only family-tree access |

**Interpretation:** the codebase already treats these as two entities. The
10-column NULL-out at `users.js:325-334` is literally hand-written table
separation. Splitting into `patients` / `doctors` would **delete** that logic
rather than add complexity.

### 🔴 The blocker: role switching

`updateUserRole()` (`backend/db/users.js:316`) lets an existing user change
role, wiping doctor fields. In a split schema this becomes a **cross-table
row move** (DELETE from `doctors` + INSERT into `patients`), not an UPDATE.

**Decision needed in Phase 3** — three options:
1. **Keep it** — implement as a transactional move between tables (most work)
2. **Restrict it** — role becomes immutable after registration (simplest; may break the onboarding flow where `role='none'` → chosen role)
3. **Allow dual-role** — one person can be both a patient and a doctor (two rows, one per table)

Option 2 interacts with the **`role='none'` user** found in Phase 1 — that
account exists precisely because role selection is deferred.

---

## Naming inconsistencies

| Issue | Detail |
|---|---|
| **camelCase ↔ snake_case dual keys** | `users.js` returns **both** spellings for 7+ fields (`phone`/`mobile`/`phone_number`, `dob`/`dateOfBirth`/`date_of_birth`, `blood_group`/`bloodGroup`, `license_number`/`licenseNumber`/`regNumber`, `hospital_name`/`hospitalName`, `specialty`/`specialization`, `reg_certificate_url`/`regCertificateUrl`). DB is consistently snake_case; the API surface is not. |
| **Singular vs plural tables** | `users`, `reports`, `family_members` (plural) vs `doctor_patient`, `vault_table` (singular). |
| **`vault_table` suffix** | Only table with a `_table` suffix. |
| **`family_vault_pkey` on `family_members`** | PK name doesn't match its table. |
| **`reports.doctor`** | Free-text doctor *name*, unrelated to `users`/`doctor_patient`. Confusing alongside a real doctor entity. |

---

## Rename blast radius (for Phase 3 sequencing)

| Table | Files needing change | Risk |
|---|---|---|
| `users` | `backend/db/users.js`, `backend/db/doctorPatients.js`, `backend/routes/auth.js` | 🔴 **Highest** — hardcoded, auth-critical |
| `reports` | `backend/db/reports.js` (constant), `backend/routes/reports.js`, `rag/…/searchService.js`, `rag/…/conversationalSearchService.js` | 🟡 Medium — **env var can decouple** |
| `report_embeddings` | `rag/src/services/embeddingService.js` | 🟢 Low — single file, single service |
| `doctor_patient` | `backend/db/doctorPatients.js`, `rag/src/services/doctorAuthService.js` | 🟡 Medium — spans both services |
| `vault_table` | `backend/db/family.js` | 🟢 Low — **env var**, one file |
| `family_members` | `backend/db/family.js` | 🟢 Low — **env var**, one file |

**Frontend: 0 files for every table.** ✅

---

## Dead / problem objects summary

| Object | Verdict | Evidence |
|---|---|---|
| `reports.updated_date` | 🔴 **DEAD — drop** | 0 code refs, 0/12 populated |
| `doctor_patient.updated_at` | 🔴 **DEAD — drop** | 0 code refs, NULL in 4/4 |
| `users.cert_extracted_data` | 🟡 Written, never populated | Feature likely incomplete |
| `users.license_expiry_date` | 🟡 Written, never populated | Feature likely incomplete |
| `users.created_at` | 🔴 **BUG — fix** | Omitted from `dbPayload` |
| `reports.source` | 🟡 Constant `'manual'` | No second value ever written |
| `emergencyContact`, `consultationFee`, `bio` | 🔴 **Code-only** | No DB column — silent data loss |

---

## Referenced in code but MISSING from DB

**No table is missing.** No query targets a non-existent table or column —
nothing is broken right now.

The only gap is the 5 code-only *fields* above, which are dropped by the
`dbPayload` allowlist rather than causing errors.

---

**Phase 2 COMPLETE.** No changes made. **Awaiting your review before Phase 3.**
