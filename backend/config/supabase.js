import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env variables if not already loaded
if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log(`⚡ [Supabase] Initialized Supabase Client successfully (${SUPABASE_URL})`);
} else {
  console.log('ℹ️ [Supabase] Add SUPABASE_URL and SUPABASE_ANON_KEY to backend/.env to connect your Supabase database');
}

export default supabase;
