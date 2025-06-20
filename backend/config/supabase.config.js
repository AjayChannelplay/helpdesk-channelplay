const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;

// Create a client with the anonymous key (for client-side operations)
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a client with the service role key (for server-side admin operations)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

console.log('Supabase client initialized');

module.exports = {
  supabase,
  supabaseAdmin
};
