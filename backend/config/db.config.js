const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Supabase client initialized');

// Legacy support for code still using query method
const query = async (text, params) => {
  console.warn('Warning: Using legacy db.query method. Update to use Supabase client.');
  const { data, error } = await supabase.rpc('pg_execute', { query: text, params });
  if (error) throw error;
  return { rows: data || [], rowCount: data ? data.length : 0 };
};

module.exports = { query, supabase };
