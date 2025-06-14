import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and anon key from environment variables
// You might want to store these in your .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Print connection info for debugging
console.log('[Supabase] Initializing Supabase client with:', {
  url: supabaseUrl ? `${supabaseUrl.substring(0, 8)}...` : 'missing',
  keyAvailable: !!supabaseAnonKey,
});

// Create Supabase client with debugging enabled
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    debug: true, // Enable detailed realtime debugging
  },
});

// Helper function to check if realtime is connected and working
export const checkRealtimeConnection = async () => {
  try {
    // Create a test channel
    const testChannel = supabase.channel('test-connection');
    
    // Try to subscribe
    const subscription = testChannel.subscribe((status) => {
      console.log('Supabase Realtime connection status:', status);
      
      // Remove the test channel after confirming connection
      setTimeout(() => {
        supabase.removeChannel(testChannel);
      }, 2000);
    });
    
    return subscription !== null;
  } catch (error) {
    console.error('Supabase Realtime connection check failed:', error);
    return false;
  }
};

// Export a function to enable realtime on specific tables
export const enableRealtimeForTables = async (tables = ['messages']) => {
  try {
    tables.forEach(async (table) => {
      // Try to enable realtime for this table
      const { data, error } = await supabase.rpc('supabase_realtime', { 
        table_name: table, 
        action: 'enable' 
      });
      
      if (error) throw error;
      console.log(`Realtime enabled for ${table} table:`, data);
    });
    
    return true;
  } catch (error) {
    console.error('Failed to enable realtime for tables:', error);
    return false;
  }
};
