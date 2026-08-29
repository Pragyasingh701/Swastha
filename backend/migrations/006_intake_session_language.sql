-- Migration: add language column to intake_sessions (Module A, Phase 7a).
--
-- Set once at /intake/start and stored on the session row, rather than
-- passed per-turn (Voice Layer PRD §6, resolved): per-turn auto-detection
-- would let the TTS voice switch identity mid-conversation on a
-- code-mixed answer — worse for the elderly/low-literacy patients this
-- phase exists to serve than one consistent voice.
--
-- Default 'hi-IN' matches the PRD's suggested default. Values are BCP-47
-- codes constrained to what Sarvam Bulbul accepts; only the two languages
-- Phase 7 ships with are allowed (PRD §4 non-goal: not all 22 at once).
-- Existing rows backfill to the default, so the dialogue engine and the
-- /intake/turn JSON contract are untouched by this change.
--
-- The check constraint mirrors how status / priority / doctor_action are
-- already constrained in 003 and 005 — the two-language non-goal is
-- enforced by the schema rather than left as a convention. Expanding
-- language coverage later means dropping and recreating this constraint.
--
-- Byte-identical copy of supabase/migrations/20260829000000_intake_
-- session_language.sql (same dual-copy convention as every other
-- migration pair in this repo).

begin;

alter table public.intake_sessions
  add column language text not null default 'hi-IN'
    check (language in ('hi-IN', 'en-IN'));

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.intake_sessions drop column language;
-- ═══════════════════════════════════════════════════════════════════════
