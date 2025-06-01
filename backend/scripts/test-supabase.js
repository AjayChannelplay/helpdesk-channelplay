const { supabase } = require('../config/supabase-client');

async function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  
  try {
    // Get database health
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.error('Error connecting to Supabase:', error);
    } else {
      console.log('Successfully connected to Supabase!');
      console.log('Connection test result:', data);
    }
  } catch (error) {
    console.error('Unexpected error during Supabase connection test:', error);
  }
}

testSupabaseConnection();
