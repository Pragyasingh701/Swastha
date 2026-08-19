# Swastha — Database Reorganization Plan (Phase 3)

**Written:** 2026-08-19
**Based on:** `db-schema-current.md` (Phase 1) + `db-code-crossref.md` (Phase 2)
**Status:** 🛑 **PROPOSAL ONLY — nothing applied. Awaiting your approval per item.**

**Your decisions incorporated:**
- ✅ Patients and doctors **must** be separate tables (non-negotiable)
- ✅ **Role switching is removed** — role is immutable after registration

---

## Part 1 — The structural recommendation

### 🔴 Recommendation: fully independent `patients` and `doctors` tables

**Not** a shared base table with extension tables.

### Why (evidence-driven, not default)

Phase 2 asked whether these entities actually diverge. They do — decisively:

| Evidence | Finding |
|---|---|
| **Column disjointness** | 8 doctor-only columns are **100% populated for doctors, 0% for patients**. Zero overlap. |
| **Code already separates them** | `backend/db/users.js:325-334` manually NULLs 10 doctor columns for non-doctors — hand-written table separation. |
| **Registration paths already diverge** | `auth.js:686` (patient) vs `auth.js:709` (doctor) are separate flows with different required fields. |
| **Relationships already respect the split** | `doctor_patient.doctor_id` resolves **only** to doctors; `patient_id` **only** to patients. |
| **Role switching is now removed** | The single strongest argument *for* a shared table (cheap role flips) no longer applies. |

Truly shared columns are only: `id`, `email`, `name`, `picture`,
`password_hash`, `auth_provider`, `phone`, `dob`, `gender`, `verification_status`,
`created_at`, `updated_at` — 12 of 25.

### Tradeoffs — honestly stated

| | Independent tables ✅ recommended | Shared base + extensions |
|---|---|---|
| Login lookup by email | ❌ Must query 2 tables (or a `UNION` view) | ✅ One table |
| Referential integrity | ⚠️ `reports.patient_id` → `patients`, but `doctor_patient` needs FKs to two different tables | ✅ One FK target |
| Schema clarity | ✅ Each table only has columns that apply | ⚠️ Still need joins everywhere |
| Duplicate shared columns | ⚠️ 12 columns exist twice | ✅ Defined once |
| Matches your requirement | ✅ Literally separate tables | ⚠️ Arguably still "one users table" |
| Code simplification | ✅ Deletes the NULL-out block | ❌ Keeps most branching |

**The login-lookup cost is the real tradeoff.** Mitigation: a
`SELECT … UNION ALL` view (`auth_identities`) exposing
`id, email, password_hash, role, auth_provider` for the login path only.
This is a read-only convenience view — it does **not** merge the tables.

> ⚠️ **Decision needed (D1):** approve independent tables + the login view, or
> tell me you prefer the shared-base variant. Everything below assumes
> independent tables.

---

## Part 2 — Blockers that must be resolved first

### 🔴 B1 — Orphaned rows (blocks every new FK)

7 IDs are referenced by child rows but **have no `users` row**. Verified
against the backup: their account rows are **permanently gone** — not
recoverable.

| Orphaned ID | reports | embeddings | vault | family | dp(doctor) | total |
|---|---:|---:|---:|---:|---:|---:|
| `usr_1786275555392` | **5** | **5** | 1 | 1 | 0 | **12** |
| `usr_g_114095392347691733256` | 0 | 0 | 1 | 3 | 0 | 4 |
| `usr_1784871342308` | 0 | 0 | 1 | 1 | 0 | 2 |
| `usr_1786391556878` | 0 | 0 | 1 | 1 | 0 | 2 |
| `usr_g_102810539866948845814` | 0 | 0 | 1 | 1 | 0 | 2 |
| `usr_1786986155114` | 0 | 0 | 0 | 0 | **1** | 1 |
| `usr_1787143143325` | 0 | 0 | 0 | 0 | **1** | 1 |

**Critical context — this data is already unreachable:**
- Every query is scoped by `user_id` from a JWT
- Login requires a `users` row → these accounts **cannot log in**
- `usr_1786275555392` is **not linked to any doctor** → no doctor can see it either

**So it is dead weight today, not live records.** That materially lowers the
risk of deletion — but it is still real medical data, so **I will not delete
it without explicit approval.**

**Options:**

| | Approach | Pros | Cons |
|---|---|---|---|
| **B1-a** ✅ *recommended* | **Archive then delete.** Copy all 24 orphaned rows into `archive_orphaned_2026_08` tables, then delete from live tables. | Reversible; clean FKs; nothing silently lost | Extra tables (can drop later) |
| B1-b | Recreate placeholder `patients` rows (`email = orphan+<id>@invalid`, no password) | Data stays queryable | Fake accounts pollute the table forever |
| B1-c | Hard delete, no archive | Simplest | **Irreversible** |
| B1-d | Skip FKs on affected tables | No data touched | Leaves the integrity problem unfixed — defeats the point |

> ⚠️ **Decision needed (D2):** which option? (I recommend **B1-a**.)

### 🟡 B2 — The `role='none'` user

`pvats6153@gmail.com` (email auth, verified, no role). Mid-onboarding: they
registered but never picked a role. With role switching removed, this user
has **no destination table**.

| | Approach | Notes |
|---|---|---|
| **B2-a** ✅ *recommended* | Keep a small `pending_registrations` table for role-less accounts; move them to `patients`/`doctors` on role selection | Preserves the existing onboarding flow (`RoleSelection.jsx`) |
| B2-b | Default them to `patients` | Wrong if they meant to be a doctor |
| B2-c | Delete the account | Destroys a real signup |

> ⚠️ **Decision needed (D3):** which option? (I recommend **B2-a** — it's
> required anyway, since `RoleSelection.jsx` needs somewhere to put users
> between signup and role choice.)

### 🟡 B3 — A doctor holding `patient_code`

`singhpragya701@gmail.com` is `role='doctor'` but has `patient_code='873636'`
— residue from before doctor registration. On split, `patient_code` is a
**patients-only** column, so this value is dropped.

> ⚠️ **Decision needed (D4):** drop it (recommended — it's meaningless for a
> doctor), or preserve it somewhere?

### 🔴 B4 — `ensure_rls` will lock new tables

The `ensure_rls` event trigger auto-runs `ENABLE ROW LEVEL SECURITY` on every
new table. So `patients`, `doctors`, etc. will be created **RLS-enabled with
zero policies = deny-all** to anon/authenticated.

**This will not break the app** (both services use the service-role key, which
bypasses RLS) — but it must be a conscious choice, not a surprise.

> ⚠️ **Decision needed (D5):** (a) accept service-role-only access, matching
> today's posture ✅ recommended, or (b) write real RLS policies. Note from
> Phase 2: **Supabase Auth is not used**, so policies cannot use `auth.uid()`
> — (b) requires a custom JWT-claims integration and is a separate project.

---

## Part 3 — Target schema

```
┌──────────────┐         ┌──────────────────┐
│   patients   │         │     doctors      │
│──────────────│         │──────────────────│
│ id (PK)      │         │ id (PK)          │
│ email UQ     │         │ email UQ         │
│ name         │         │ name             │
│ picture      │         │ picture          │
│ password_hash│         │ password_hash    │
│ auth_provider│         │ auth_provider    │
│ phone, dob   │         │ phone, dob       │
│ gender       │         │ gender           │
│ verification_│         │ verification_    │
│   status     │         │   status         │
│ blood_group  │◄patient │ specialty        │
│ patient_code │  only   │ license_number   │◄doctor
│ created_at   │         │ council, degree  │  only
│ updated_at   │         │ experience       │
└──────┬───────┘         │ hospital_name    │
       │                 │ address          │
       │                 │ reg_certificate_ │
       │                 │   url            │
       │                 │ created_at       │
       │                 │ updated_at       │
       │                 └────────┬─────────┘
       │                          │
       │      ┌───────────────────┴──┐
       ├─────►│   doctor_patient     │
       │      │  doctor_id  → doctors│
       │      │  patient_id → patients
       │      │  UNIQUE(doctor,patient)
       │      └──────────────────────┘
       │
       ├─────► reports (patient_id → patients)
       │            └─► report_embeddings (report_id → reports)
       ├─────► vault_table (patient_id → patients)
       └─────► family_members (patient_id → patients)

  pending_registrations  ← role-less signups (B2-a)
```

**Dropped from both tables:** `role` (implied by table), `cert_extracted_data`
and `license_expiry_date` (0/9 populated, feature incomplete — see D6).

---

## Part 4 — Migration sequence

Ordered so **nothing breaks mid-way**: additive first, destructive last, and
no rename without its code change in the same step.

### M1 — Cleanup & archive (safe, prerequisite) 🟢

```sql
-- Archive orphans before deleting (B1-a)
create schema if not exists archive;
create table archive.orphaned_reports_2026_08 as
  select r.* from public.reports r
  left join public.users u on u.id = r.user_id where u.id is null;
create table archive.orphaned_report_embeddings_2026_08 as
  select e.* from public.report_embeddings e
  left join public.users u on u.id = e.user_id where u.id is null;
create table archive.orphaned_vault_2026_08 as
  select v.* from public.vault_table v
  left join public.users u on u.id = v.user_id where u.id is null;
create table archive.orphaned_family_2026_08 as
  select f.* from public.family_members f
  left join public.users u on u.id = f.user_id where u.id is null;
create table archive.orphaned_doctor_patient_2026_08 as
  select d.* from public.doctor_patient d
  left join public.users u on u.id = d.doctor_id where u.id is null;

-- Then delete (child rows first)
delete from public.report_embeddings e
  where not exists (select 1 from public.users u where u.id = e.user_id);
delete from public.reports r
  where not exists (select 1 from public.users u where u.id = r.user_id);
delete from public.vault_table v
  where not exists (select 1 from public.users u where u.id = v.user_id);
delete from public.family_members f
  where not exists (select 1 from public.users u where u.id = f.user_id);
delete from public.doctor_patient d
  where not exists (select 1 from public.users u where u.id = d.doctor_id);
```

- **Code changes:** none
- **Risk:** 🟢 Safe — data is unreachable today, and archived first
- **Revert:** `insert into public.reports select * from archive.orphaned_reports_2026_08;` (etc.)
- **Affects:** 24 rows

### M2 — Create `patients` / `doctors` / `pending_registrations` (additive) 🟢

```sql
create table public.patients (
  id             varchar primary key,
  email          varchar not null unique,
  name           varchar,
  picture        text,
  password_hash  varchar,
  auth_provider  varchar,
  phone          text,
  dob            text,
  gender         text,
  blood_group    text,
  patient_code   text unique,
  verification_status text default 'verified',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.doctors (
  id             varchar primary key,
  email          varchar not null unique,
  name           varchar,
  picture        text,
  password_hash  varchar,
  auth_provider  varchar,
  phone          text,
  dob            text,
  gender         text,
  specialty            varchar,
  license_number       varchar,
  council              text,
  degree               text,
  experience           text,
  hospital_name        text,
  address              text,
  reg_certificate_url  text,
  verification_status  text default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.pending_registrations (
  id             varchar primary key,
  email          varchar not null unique,
  name           varchar,
  picture        text,
  password_hash  varchar,
  auth_provider  varchar,
  verification_status text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Login lookup across both (read-only convenience, D1)
create view public.auth_identities as
  select id, email, password_hash, auth_provider, 'patient' as role from public.patients
  union all
  select id, email, password_hash, auth_provider, 'doctor'  as role from public.doctors
  union all
  select id, email, password_hash, auth_provider, 'none'    as role from public.pending_registrations;
```

- **Code changes:** none yet (tables unused)
- **Risk:** 🟢 Safe — purely additive, `users` untouched
- **⚠️ Note:** `ensure_rls` will auto-enable RLS on all three (B4/D5)
- **Revert:** `drop view public.auth_identities; drop table public.patients, public.doctors, public.pending_registrations;`

### M3 — Backfill from `users` (additive) 🟢

```sql
insert into public.patients
  (id,email,name,picture,password_hash,auth_provider,phone,dob,gender,
   blood_group,patient_code,verification_status,created_at,updated_at)
select id,email,name,picture,password_hash,auth_provider,phone,dob,gender,
       blood_group,patient_code,coalesce(verification_status,'verified'),
       coalesce(created_at, now()), coalesce(updated_at, now())
from public.users where role = 'patient';

insert into public.doctors
  (id,email,name,picture,password_hash,auth_provider,phone,dob,gender,
   specialty,license_number,council,degree,experience,hospital_name,address,
   reg_certificate_url,verification_status,created_at,updated_at)
select id,email,name,picture,password_hash,auth_provider,phone,dob,gender,
       specialty,license_number,council,degree,experience,hospital_name,address,
       reg_certificate_url,coalesce(verification_status,'pending'),
       coalesce(created_at, now()), coalesce(updated_at, now())
from public.users where role = 'doctor';   -- drops patient_code (B3/D4)

insert into public.pending_registrations
  (id,email,name,picture,password_hash,auth_provider,verification_status,created_at,updated_at)
select id,email,name,picture,password_hash,auth_provider,verification_status,
       coalesce(created_at, now()), coalesce(updated_at, now())
from public.users where role is null or role = 'none';
```

**Verify before proceeding:**
```sql
select (select count(*) from public.users)                 as users_total,      -- 9
       (select count(*) from public.patients)              as patients,         -- 4
       (select count(*) from public.doctors)               as doctors,          -- 4
       (select count(*) from public.pending_registrations) as pending;          -- 1
```

- **Risk:** 🟢 Safe — `users` still the live source of truth
- **Revert:** `truncate public.patients, public.doctors, public.pending_registrations;`

### M4 — Switch code to the new tables 🔴 **highest risk**

**This is the cutover.** DB and code must ship together.

| File | Change |
|---|---|
| `backend/db/users.js` | Split `createOrUpdateUser` into patient/doctor paths; `findUserByEmail`/`findUserById` query `auth_identities` then the right table; **delete `updateUserRole` entirely** (role switching removed); **fix the `created_at` bug** |
| `backend/routes/auth.js` | `/role` becomes "promote from `pending_registrations`" (one-way, not a switch); registration writes to the correct table |
| `backend/db/doctorPatients.js` | Patient lookups → `patients`; doctor lookups → `doctors` |

- **Risk:** 🔴 **Risky** — auth-critical. Test login (email + Google), registration (both roles), role selection, and doctor-patient linking before proceeding.
- **Revert:** redeploy previous code (`users` still intact and current)
- **⚠️ Dual-write window:** to be fully safe, M4 can write to **both** `users`
  and the new tables for one deploy, so rollback needs no data replay.
  > **Decision needed (D7):** dual-write for one deploy (safer, more work), or
  > straight cutover (simpler — acceptable at 9 users)? I recommend
  > **straight cutover** here given the tiny dataset and verified backups.

### M5 — Add FKs and indexes (additive, after M1) 🟢

```sql
alter table public.reports           rename column user_id to patient_id;
alter table public.report_embeddings rename column user_id to patient_id;
alter table public.vault_table       rename column user_id to patient_id;
alter table public.family_members    rename column user_id to patient_id;

alter table public.reports
  add constraint reports_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;
alter table public.report_embeddings
  add constraint report_embeddings_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;
alter table public.vault_table
  add constraint vault_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;
alter table public.family_members
  add constraint family_members_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;
alter table public.doctor_patient
  add constraint dp_doctor_fk  foreign key (doctor_id)  references public.doctors(id)  on delete cascade,
  add constraint dp_patient_fk foreign key (patient_id) references public.patients(id) on delete cascade,
  add constraint dp_unique unique (doctor_id, patient_id);

create index if not exists reports_patient_id_idx        on public.reports(patient_id);
create index if not exists vault_table_patient_id_idx    on public.vault_table(patient_id);
create index if not exists family_members_patient_id_idx on public.family_members(patient_id);
create index if not exists doctor_patient_doctor_id_idx  on public.doctor_patient(doctor_id);
create index if not exists doctor_patient_patient_id_idx on public.doctor_patient(patient_id);
```

⚠️ **The `user_id` → `patient_id` renames require code changes in the same
step** (Phase 2 blast radius):

| Table | Files |
|---|---|
| `reports` | `backend/db/reports.js`, `rag/…/searchService.js`, `rag/…/conversationalSearchService.js` |
| `report_embeddings` | `rag/…/embeddingService.js`, `rag/…/reportRetriever.js`, **`match_report_embeddings()` must be recreated** |
| `vault_table`, `family_members` | `backend/db/family.js` |

- **Risk:** 🟡 Needs code change in same deploy
- **Revert:** drop constraints; rename columns back
- **Alternative:** keep the `user_id` name (FKs only) to cut the code churn.
  > **Decision needed (D8):** rename to `patient_id` (clearer, more churn) or
  > keep `user_id` (less churn)? I lean **rename** — `user_id` is misleading
  > once `users` no longer exists.

### M6 — Recreate `match_report_embeddings` (only if D8 = rename) 🟡

```sql
create or replace function public.match_report_embeddings(
  p_user_id varchar, p_query_embedding vector(768), p_match_count integer default 5
) returns table (id bigint, report_id bigint, chunk_text text, chunk_index integer, similarity float)
language sql stable as $$
  select re.id, re.report_id, re.chunk_text, re.chunk_index,
         1 - (re.embedding <=> p_query_embedding) as similarity
  from public.report_embeddings re
  where re.patient_id = p_user_id          -- was re.user_id
  order by re.embedding <=> p_query_embedding
  limit p_match_count;
$$;
```

- **Risk:** 🟡 Breaks search if wrong. Parameter name kept as `p_user_id` so
  **no calling code changes** (`searchService.js:40`, `reportRetriever.js:47`).
- **Revert:** re-run `rag/migrations/002`

### M7 — Drop dead objects (destructive, LAST) 🔴

```sql
alter table public.reports        drop column updated_date;    -- 0 refs, 0/12
alter table public.doctor_patient drop column updated_at;      -- 0 refs, 0/4
drop table public.users;                                       -- only after M4 verified
```

- **Risk:** 🔴 Irreversible without backup restore
- **Prerequisite:** M4 running clean in production for a few days
- **Revert:** restore from `backups/schema-2026-08-19.sql` + `data-2026-08-19.sql`

> **Decision needed (D6):** also drop `cert_extracted_data` and
> `license_expiry_date` (0/9 populated, feature incomplete), or keep them for
> planned HPR work? I recommend **keeping** them on `doctors` — they're
> clearly intended for the certificate flow.

---

## Part 5 — Risk summary

| # | Migration | Risk | Code change? | Reversible? |
|---|---|---|---|---|
| M1 | Archive + delete orphans | 🟢 Safe | No | ✅ from archive |
| M2 | Create new tables | 🟢 Safe | No | ✅ drop |
| M3 | Backfill | 🟢 Safe | No | ✅ truncate |
| M4 | **Cutover** | 🔴 **Risky** | **Yes — same deploy** | ✅ redeploy old code |
| M5 | FKs + indexes + renames | 🟡 Medium | Yes — same deploy | ✅ drop/rename back |
| M6 | Recreate RPC | 🟡 Medium | No | ✅ re-run migration 002 |
| M7 | Drop dead objects | 🔴 Irreversible | No | ⚠️ backup restore only |

**Frontend changes required: none** (Phase 2 — the frontend never touches Supabase).

---

## Part 6 — Decisions — ✅ ALL SETTLED

| # | Question | **Decision** | Source |
|---|---|---|---|
| **D1** | Independent tables + `auth_identities` view, or shared base? | ✅ **Independent + view** | Follows from "separate tables" requirement + no role switching |
| **D2** | Orphaned rows | ✅ **Archive, then delete** (B1-a) | **You chose** |
| **D3** | `role='none'` user | ✅ **`pending_registrations` table** (B2-a) | **You chose** |
| **D4** | Doctor's stray `patient_code` | ✅ **Drop it** | Default — meaningless on a doctor |
| **D5** | RLS strategy | ✅ **Service-role only** (unchanged from today) | Default — `auth.uid()` unavailable, Supabase Auth not used |
| **D6** | `cert_extracted_data` / `license_expiry_date` | ✅ **Keep** on `doctors` | Default — intended for the HPR certificate flow |
| **D7** | Cutover style | ✅ **Straight cutover** | Default — 9 users, backups verified |
| **D8** | `user_id` → `patient_id` | ✅ **Rename** | **You chose** |

**Also settled earlier:** role switching is **removed**. `updateUserRole()` is
deleted in M4; `POST /api/auth/role` becomes a one-way promotion out of
`pending_registrations`.

### Notes on the defaults I applied

- **D5 (RLS)** keeps the *current* security posture exactly — nothing gets
  weaker. Real policies are a worthwhile separate project, but they'd need a
  custom JWT-claims integration first since Supabase Auth isn't in use.
- **D6** costs nothing to keep; dropping them would discard work-in-progress.
- **D7**: dual-write is insurance for large datasets. With 9 users and two
  verified backups, rollback is redeploying old code — `users` stays intact
  until M7.

Any of these can be changed before the relevant migration runs — say so and
I'll adjust.

---

## Part 7 — Suggested logical grouping

```
IDENTITY    patients · doctors · pending_registrations
RELATIONSHIP  doctor_patient
CLINICAL    reports · report_embeddings
FAMILY      vault_table (→ family_vaults?) · family_members
ARCHIVE     archive.* (temporary; drop once M7 is confirmed stable)
```

Optional cosmetic renames (🟢 low risk — both are **env-overridable**, so DB
and code can be decoupled): `vault_table` → `family_vaults`, and rename PK
`family_vault_pkey` → `family_members_pkey`.

---

**Phase 3 COMPLETE. Nothing applied.**
**Reply with your D1–D8 answers, then approve migrations one at a time
("apply migration M1") per Hard Rule #4.**
