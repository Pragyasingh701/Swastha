import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { supabaseFetch } from './supabaseFetch.js';

// Load env variables if not already loaded
if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  // supabaseFetch retries a write whose connection never opened (see that file).
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: supabaseFetch } });
  console.log(`⚡ [Supabase] Initialized Supabase Client successfully (${SUPABASE_URL})`);
} else {
  console.log('ℹ️ [Supabase] Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env to connect your Supabase database');
}

export default supabase;
