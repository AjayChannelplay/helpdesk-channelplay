const { supabaseAdmin } = require('../config/supabase-client');
const bcrypt = require('bcrypt');

async function setupSupabase() {
  console.log('Setting up Supabase database...');

  try {
    // Create test users
    console.log('Creating test users...');
    
    // Hash passwords
    const adminPassword = await bcrypt.hash('password123', 10);
    const agentPassword = await bcrypt.hash('password', 10);

    // Create admin user
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('users')
      .upsert([
        {
          username: 'Admin User',
          email: 'admin@example.com',
          password: adminPassword,
          role: 'admin'
        }
      ], { onConflict: 'email' })
      .select();

    if (adminError) {
      console.error('Error creating admin user:', adminError);
    } else {
      console.log('Admin user created/updated successfully:', adminUser);
    }

    // Create agent user
    const { data: agentUser, error: agentError } = await supabaseAdmin
      .from('users')
      .upsert([
        {
          username: 'Agent User',
          email: 'agent@example.com',
          password: agentPassword,
          role: 'agent'
        }
      ], { onConflict: 'email' })
      .select();

    if (agentError) {
      console.error('Error creating agent user:', agentError);
    } else {
      console.log('Agent user created/updated successfully:', agentUser);
    }

    // Create a test desk
    // First check if desk already exists
    const { data: existingDesk } = await supabaseAdmin
      .from('desks')
      .select('*')
      .eq('name', 'Support Desk')
      .maybeSingle();

    let desk;
    let deskError;

    // If desk doesn't exist, create it
    if (!existingDesk) {
      const result = await supabaseAdmin
        .from('desks')
        .insert([
          {
            name: 'Support Desk',
            description: 'General support inquiries',
            email_address: 'support@example.com',
            provider_type: 'MICROSOFT'
          }
        ])
        .select();

      desk = result.data;
      deskError = result.error;
    } else {
      console.log('Support desk already exists');
      desk = [existingDesk];
    }

    if (deskError) {
      console.error('Error creating desk:', deskError);
    } else {
      console.log('Support desk created/updated successfully:', desk);
    }

    console.log('Database setup completed successfully!');
  } catch (error) {
    console.error('Error setting up Supabase database:', error);
  }
}

// Run the setup
setupSupabase();
