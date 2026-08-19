# Swastha — Current Database Schema (Phase 1 Discovery)

**Project ref:** `cmanfnucysuegsjjnfbl` (Supabase, South Asia)
**Captured:** 2026-08-19
**Method:** Read-only introspection via PostgREST OpenAPI spec + service-role `SELECT` queries.
**Nothing was created, altered, dropped, or written.**

---

## ✅ Access resolved — discovery is COMPLETE

Initial discovery was blocked (wrong Supabase account on the CLI). This was
resolved mid-Phase-1: you logged into the correct account, and a full
`pg_dump` was captured via the connection pooler.

| Rule | Status |
|---|---|
| #1 — read-only discovery | ✅ Fully met |
| #2 — versioned migrations only | ✅ Nothing applied |
| #3 — backup, confirmed non-empty | ✅ **Fully met** — schema + data dumps verified below |

**All previously-missing items were recovered:** RLS status, policies,
indexes, constraints, triggers, event triggers, and the unknown
`rls_auto_enable()` function.

### Backups (Hard Rule #3)

| File | Size | Verified |
|---|---|---|
| `backups/schema-2026-08-19.sql` | 9,823 B | 6 `CREATE TABLE`, 2 functions, 3 indexes, 1 FK, ends with `dump complete` ✅ |
| `backups/data-2026-08-19.sql` | 166,156 B | 6 `COPY` blocks, ends with `dump complete` ✅ |
| `backups/data-backup-2026-08-19.json` | 182,122 B | 54 rows (earlier PostgREST capture, kept as redundancy) |

All gitignored via `backups/`. Captured with `pg_dump 17.10` against
`aws-1-ap-south-1.pooler.supabase.com:5432`.

---

## Executive summary

| Finding | Detail |
|---|---|
| **Patients & doctors share ONE table** | Single `users` table with a `role` column (`'doctor'` / `'patient'` / `'none'`). Your non-negotiable split is **not** currently satisfied. |
| **Almost no referential integrity** | Exactly **1 foreign key** exists in the entire database. Six other relationship columns are unenforced strings. |
| **Orphaned rows in every relationship** | 4 of 6 relationship columns contain IDs pointing at users that no longer exist. **FKs cannot be added until these are cleaned up.** |
| **Most tables have no migration files** | Only `report_embeddings` has migrations in-repo. `users`, `reports`, `doctor_patient`, `vault_table`, `family_members` were created by hand in the dashboard — no version history. |
| **Doctor/patient columns are cleanly disjoint** | 9 doctor-only columns are 100% populated for doctors, 0% for patients. This is strong evidence the split is natural, not forced. |

---

## Tables (6)

### `users` — ⚠️ the shared patient/doctor table

25 columns. PK `id` (`varchar`, application-generated — **not** `auth.users` UUID).

| Column | Type | Notes |
|---|---|---|
| `id` | varchar | **PK**. Format `usr_<ts>` or `usr_g_<google_sub>` |
| `email` | varchar | NOT NULL |
| `name` | varchar | |
| `picture` | text | |
| `role` | varchar | `'doctor'` \| `'patient'` \| `'none'` — **no CHECK constraint, no enum** |
| `auth_provider` | varchar | `'email'` \| `'google'` |
| `password_hash` | varchar | Only for `auth_provider='email'` |
| `created_at` | timestamp | **0/9 populated — never written** |
| `updated_at` | timestamp | |
| `verification_status` | text | |
| `gender`, `phone`, `dob` | text | Shared |
| `blood_group` | text | **Patient-only in practice** |
| `patient_code` | text | **Patient-only.** Sparse (2/4 patients) |
| `specialty` | varchar | **Doctor-only** |
| `license_number` | varchar | **Doctor-only** |
| `council` | text | **Doctor-only** |
| `degree` | text | **Doctor-only** |
| `experience` | text | **Doctor-only** |
| `hospital_name` | text | **Doctor-only** |
| `address` | text | **Doctor-only** |
| `reg_certificate_url` | text | **Doctor-only** |
| `license_expiry_date` | date | Doctor-only — **0/9 populated (dead)** |
| `cert_extracted_data` | jsonb | Doctor-only — **0/9 populated (dead)** |

#### Column population by role — the evidence for splitting

9 users total: **4 doctors, 4 patients, 1 `role='none'`**.

| Column | doctor (4) | patient (4) | none (1) | Classification |
|---|---|---|---|---|
| `id`, `email`, `name`, `role`, `auth_provider`, `updated_at`, `verification_status`, `gender` | all | all | all | **Shared** |
| `phone`, `dob` | 3/3 | 4/4 | 0 | **Shared** |
| `picture` | 2/3 | 4/4 | 0 | Shared |
| `password_hash` | 1/3 | 0/4 | 1 | Shared (email-auth only) |
| `specialty` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `license_number` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `council` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `degree` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `experience` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `hospital_name` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `address` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `reg_certificate_url` | **3/3** | **0/4** | 0 | **Doctor-only** |
| `blood_group` | **0/3** | **4/4** | 0 | **Patient-only** |
| `patient_code` | 0/3 | 2/4 | 1 | Patient-only (sparse) |
| `created_at` | 0 | 0 | 0 | **DEAD** |
| `license_expiry_date` | 0 | 0 | 0 | **DEAD** |
| `cert_extracted_data` | 0 | 0 | 0 | **DEAD** |

> Counts read `3/3` because one doctor and one patient are excluded by a
> null-vs-`'none'` role edge case (see [Data quality](#data-quality-issues)).
> The disjointness is unambiguous regardless.

**Interpretation:** the split is clean. 8 doctor-only columns are fully
populated for doctors and completely empty for patients — zero overlap.
This is a table doing two jobs, not one entity with optional fields.

---

### `reports` — 12 rows

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | **PK** |
| `user_id` | varchar | → `users.id` — **NO FK** |
| `title`, `doctor`, `hospital`, `category` | text | `doctor` is a free-text name, not an ID |
| `report_date` | timestamptz | |
| `diagnosis`, `medicines`, `notes` | text | Embedded into `report_embeddings` |
| `file_url`, `source` | text | |
| `unclear_fields` | text[] | NOT NULL |
| `created_at`, `updated_at`, `updated_date` | timestamptz | ⚠️ `updated_at` **and** `updated_date` both exist |

### `report_embeddings` — 14 rows

The only well-constrained table (has migrations in-repo).

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | **PK** |
| `report_id` | bigint | **FK → `reports.id` ON DELETE CASCADE** ← the only FK in the DB |
| `user_id` | varchar | → `users.id` — **NO FK** |
| `chunk_text` | text | NOT NULL |
| `embedding` | vector(768) | NOT NULL |
| `chunk_index` | integer | NOT NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

Constraints/indexes (from `rag/migrations/001`):
- UNIQUE `(report_id, chunk_index)`
- btree on `user_id`, btree on `report_id`
- **HNSW** `vector_cosine_ops` on `embedding`

### `doctor_patient` — 4 rows (the doctor↔patient link)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | **PK**, default `gen_random_uuid()` |
| `doctor_id` | varchar | NOT NULL → `users.id` — **NO FK** |
| `patient_id` | varchar | → `users.id` — **NO FK** |
| `patient_code`, `patient_email`, `patient_name`, `patient_phone`, `patient_gender`, `patient_dob`, `patient_blood_group` | | **Denormalized copies of `users` fields** |
| `created_at`, `updated_at` | timestamptz | |

⚠️ No unique constraint on `(doctor_id, patient_id)` — duplicate links are
possible. Code compensates with a manual pre-check
(`backend/db/doctorPatients.js`).

**Positive finding:** `doctor_id` resolves only to `role='doctor'`, and
`patient_id` only to `role='patient'`. The separation already holds in
practice.

### `vault_table` — 7 rows

`id` (uuid PK), `vault_id` (text), `user_id` (varchar, **no FK**),
`created_at` NOT NULL, `updated_at`, `deleted_at` (soft delete).

### `family_members` — 8 rows

22 columns: `id` (uuid PK), `vault_id` (text NOT NULL, default `''`),
`user_id` (varchar, **no FK**), `name`, `age`, `dob`, `relationship`,
`relationship_tag`, `health_overview`, `notes`, `conditions` (jsonb),
`last_visit_date`, `next_checkup_date`, soft-delete + a 6-column
authorization workflow (`authorization_status`, `authorization_token`,
`authorization_requested_at`, `authorization_approved_at`,
`requested_by_email`, `authorized_by_email`).

⚠️ `vault_id` is `text` here but also `text` in `vault_table` — linked by
value, **not** by FK.

---

## Relationships & referential integrity

### Foreign keys: 1 (total)

```
report_embeddings.report_id  →  reports.id   (ON DELETE CASCADE)
```

Verified by two independent methods (OpenAPI FK descriptions + PostgREST
embedded-resource detection). Every other relationship is an unenforced
string column.

### Implied-but-unenforced relationships

| Column | Implies | FK? | Orphans |
|---|---|---|---|
| `reports.user_id` | `users.id` | ❌ | **1** |
| `report_embeddings.user_id` | `users.id` | ❌ | **1** |
| `doctor_patient.doctor_id` | `users.id` | ❌ | **2** |
| `doctor_patient.patient_id` | `users.id` | ❌ | 0 ✅ |
| `vault_table.user_id` | `users.id` | ❌ | **5** |
| `family_members.user_id` | `users.id` | ❌ | **5** |
| `family_members.vault_id` | `vault_table.vault_id` | ❌ | not checked (text-to-text) |

### 🚨 Orphaned data — blocks FK creation

| Table.column | Orphaned IDs |
|---|---|
| `reports.user_id` | `usr_1786275555392` |
| `report_embeddings.user_id` | `usr_1786275555392` |
| `doctor_patient.doctor_id` | `usr_1786986155114`, `usr_1787143143325` |
| `vault_table.user_id` | `usr_1784871342308`, `usr_g_114095392347691733256`, `usr_1786275555392`, `usr_1786391556878`, `usr_g_102810539866948845814` |
| `family_members.user_id` | same 5 as above |

These reference users that no longer exist — deletes happened with no
cascade. **Any `ALTER TABLE ... ADD FOREIGN KEY` will fail until these are
deleted or repointed.** This will be a required first step in Phase 3.

**⚠️ Verified:** `usr_1786275555392` has **no `users` row**, yet owns
**5 of the 12 reports** (#18 Diabetes, #49 BP, #55 OPD Prescription, #56 and
#57 Lab Reports) plus 5 embeddings, a vault row, and family members. That is
~42% of the reports table belonging to a user that does not exist. Deleting
these orphans would destroy real medical records — this needs a decision from
you, not a default cleanup.

---

## Functions (2)

| Function | Purpose |
|---|---|
| `match_report_embeddings(p_user_id varchar, p_query_embedding vector, p_match_count int)` | pgvector cosine similarity search. Applies `where user_id = p_user_id` **inside** the SQL — the security boundary for search. Defined in `rag/migrations/002`. |
| `rls_auto_enable()` | ✅ **Resolved.** Event-trigger function backing the `ensure_rls` trigger; auto-enables RLS on newly created `public` tables. Full body in the schema dump. See [RLS section](#-security-posture--rls-recovered-from-pg_dump). |

## Extensions

`vector` (pgvector) — confirmed via `vector(768)` columns and the HNSW index.
(Supabase installs extensions into the `extensions` schema, which
`--schema=public` excludes from the dump; pgvector usage is confirmed
structurally.)

---

## Data quality issues

1. **Orphaned rows in 4 of 6 relationships** (above) — blocks FKs.
2. **`created_at` never populated on `users`** — 0/9 rows. Signup timestamps
   are unrecoverable.
3. **`reports` has both `updated_at` and `updated_date`** — likely a duplicate.
4. **`role` has no constraint** — `'none'` (1 user) exists alongside a
   null-role user. Both are neither patient nor doctor; **they have no
   obvious destination in a split schema.**
5. **Dead columns:** `license_expiry_date`, `cert_extracted_data` (0/9 each).
6. **`doctor_patient` duplicates denormalized patient fields** that can drift
   from `users`.
7. **No unique constraint on `(doctor_id, patient_id)`.**

---

## 🔓 Security posture — RLS (recovered from `pg_dump`)

### 🚨 RLS is ENABLED on all 6 tables, with ZERO policies

```
ALTER TABLE public.doctor_patient    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_table       ENABLE ROW LEVEL SECURITY;
```

**`CREATE POLICY` count: 0.**

In PostgreSQL, RLS enabled with no policies means **deny-all** for every
non-superuser, non-service-role client. Practical consequences:

- ✅ The app works **only** because `backend/` and `rag/` both use
  `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS entirely**.
- ⚠️ The `anon` key can read/write **nothing**. Any future direct
  browser→Supabase call will fail until policies are written.
- ⚠️ **The sole access control is application code.** This matches the
  warning in `rag/src/config/supabase.js`: *"every query in this codebase
  MUST manually scope by user_id — there is no database-level safety net."*
  That comment is literally accurate.

### The `ensure_rls` event trigger — important for Phase 4

`rls_auto_enable()` (previously unknown) is an **event trigger function**:

| Property | Value |
|---|---|
| Event trigger | `ensure_rls` |
| Fires on | `ddl_command_end` |
| Status | **Enabled** (`O`) |
| Action | Auto-runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on any new table in `public` |
| Security | `SECURITY DEFINER`, `search_path = pg_catalog` |

**🔴 Phase 4 implication:** every new table a migration creates — including
`patients` and `doctors` — will have **RLS auto-enabled and no policies**,
i.e. **deny-all to anon/authenticated**. With the service-role key this is
invisible in testing but would break any client-side access. Migrations must
either add policies explicitly or consciously rely on service-role access.

---

## Indexes, constraints, triggers (recovered)

### Indexes — only 3, all on `report_embeddings`

```
report_embeddings_embedding_hnsw_idx  hnsw (embedding vector_cosine_ops)
report_embeddings_report_id_idx       btree (report_id)
report_embeddings_user_id_idx         btree (user_id)
```

**⚠️ `reports.user_id` is NOT indexed** — yet it's the filter for every
timeline/vault query. Same for `doctor_patient.doctor_id`,
`vault_table.user_id`, `family_members.user_id`. Small tables today, but
these are cheap, safe additive wins for Phase 3.

### Constraints — 6 PK, 1 UNIQUE, 1 FK, **0 CHECK**

```
doctor_patient_pkey                   PRIMARY KEY (id)
family_vault_pkey                     PRIMARY KEY (id)     ← on family_members (legacy name)
report_embeddings_pkey                PRIMARY KEY (id)
report_embeddings_report_chunk_unique UNIQUE (report_id, chunk_index)
reports_pkey                          PRIMARY KEY (id)
users_pkey                            PRIMARY KEY (id)
vault_table_pkey                      PRIMARY KEY (id)
report_embeddings_report_id_fkey      FOREIGN KEY (report_id) → reports(id) ON DELETE CASCADE
```

Notable:
- **No `UNIQUE` on `users.email`** — duplicate accounts are possible.
  ✅ Verified safe to add: 9 emails, 9 distinct, no duplicates today.
- **No `CHECK` on `users.role`** — `'none'` and `NULL` both slipped in.
- `family_members`' PK is named `family_vault_pkey` — leftover from a rename.

### Triggers: **none** on any table

No `updated_at` maintenance triggers — timestamps are application-managed,
consistent with `users.created_at` being 0/9 populated.

### Views: none. Extensions: `vector` (pgvector) confirmed in use.

---

## Access status — RESOLVED

| Capability | Status |
|---|---|
| CLI sees project `cmanfnucysuegsjjnfbl` (Swastha) | ✅ org `tnypuxfumugrthxlspux` |
| `supabase link` | ✅ linked |
| `pg_dump` schema + data | ✅ captured & verified |
| Full `pg_catalog` introspection | ✅ obtained |
| `supabase db dump` via CLI | ⚠️ needs Docker Desktop (not required — local `pg_dump 17.10` used instead) |
| `supabase migration new` (Phase 4) | ✅ available |

Connection used: `aws-1-ap-south-1.pooler.supabase.com:5432`,
user `postgres.cmanfnucysuegsjjnfbl`.

> **Security note:** the database password was shared in-session to capture
> the backup. Recommend rotating it once the reorganization is complete
> (Dashboard → Settings → Database → Reset). Verified safe: the app
> authenticates only with API keys (`createClient(URL, SERVICE_ROLE_KEY)`)
> and contains **zero** direct Postgres connection strings, so a reset does
> not affect the running site.

## Resolved during Phase 1

| # | Question | Answer |
|---|---|---|
| 2 | What is `rls_auto_enable()`? | ✅ Event-trigger function (`ensure_rls`, enabled) that auto-enables RLS on new `public` tables. **Will fire on `patients`/`doctors` in Phase 4.** |
| 5 | Is Supabase Auth used? | ✅ **No.** Zero `supabase.auth.*` calls in the codebase. Auth is fully custom — `jwt.sign()` with your own `JWT_SECRET` (`backend/routes/auth.js:579,632`), app-generated `usr_*` IDs. **`auth.uid()`-based RLS is therefore not viable** without an auth migration. |

## Open questions for Phase 3

1. **🔴 The orphaned users — highest risk.** `usr_1786275555392` owns
   **5 of 12 reports (~42%)**, 5 embeddings, a vault row, and family members,
   but has **no `users` row**. Four other orphaned IDs appear in
   `vault_table`/`family_members`. FKs cannot be added until resolved.
   Options: recreate the missing `users` rows (preserves data), repoint the
   rows to a live user, or delete them (**destroys real medical records**).
   **Needs your decision — I will not choose a default here.**
2. **Where do the 2 role-less users go?** One `role='none'`
   (`pvats6153@gmail.com`), one `NULL` role. A `patients`/`doctors` split
   leaves them with no destination.
3. **`reports.updated_at` vs `updated_date`** — near-certain duplicate. Drop one?
4. **RLS strategy.** All 6 tables are RLS-enabled with **zero policies**
   (deny-all except service-role). Keep relying on service-role + app-level
   scoping, or write real policies? Note answer #5 above: without Supabase
   Auth, policies can't use `auth.uid()` — they'd need a custom claim/JWT
   integration. **This is a strategic decision, not a cleanup task.**
5. **Dead columns** — `license_expiry_date`, `cert_extracted_data`,
   `users.created_at` (0/9 populated). Drop, or start populating?

---

**Phase 1 COMPLETE.** Schema fully discovered, backups verified non-empty,
no changes made to the database. **Awaiting your review before Phase 2.**
