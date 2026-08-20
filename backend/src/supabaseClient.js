const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy backend/.env.example to backend/.env and fill in your Supabase credentials.'
  );
}

// service_role bypasses RLS — appropriate for this trusted Express backend.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = supabase;
