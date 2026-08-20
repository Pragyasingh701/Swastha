ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS parent_member_id text,
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_family_members_parent_member_id
  ON public.family_members (parent_member_id);
