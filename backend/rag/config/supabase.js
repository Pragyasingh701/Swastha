import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.js';

// Service-role client: server-side only. This bypasses RLS, which is what
// lets the embedding pipeline write report_embeddings rows and the search
// endpoint read across the reports/report_embeddings join. Because RLS is
// bypassed, every query in this codebase MUST manually scope by user_id —
// there is no database-level safety net backing this up.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
