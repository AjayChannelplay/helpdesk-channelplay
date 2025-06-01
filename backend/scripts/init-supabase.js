const { supabaseAdmin } = require('../config/supabase.config');
const bcrypt = require('bcrypt');

async function createTables() {
  console.log('Creating tables in Supabase...');
  
  try {
    // Create users table
    const { error: usersError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'agent',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (usersError) {
      console.error('Error creating users table:', usersError);
    } else {
      console.log('Users table created successfully');
    }
    
    // Create desks table
    const { error: desksError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS desks (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          email_address VARCHAR(100),
          provider_type VARCHAR(50) DEFAULT 'MICROSOFT',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (desksError) {
      console.error('Error creating desks table:', desksError);
    } else {
      console.log('Desks table created successfully');
    }
    
    // Create desk_assignments table
    const { error: assignmentsError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS desk_assignments (
          id SERIAL PRIMARY KEY,
          desk_id INTEGER REFERENCES desks(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(desk_id, user_id)
        );
      `
    });
    
    if (assignmentsError) {
      console.error('Error creating desk_assignments table:', assignmentsError);
    } else {
      console.log('Desk assignments table created successfully');
    }
    
    // Create email_integrations table
    const { error: integrationsError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS email_integrations (
          id SERIAL PRIMARY KEY,
          desk_id INTEGER REFERENCES desks(id) ON DELETE CASCADE,
          provider_type VARCHAR(50) NOT NULL,
          client_id VARCHAR(255),
          client_secret VARCHAR(255),
          refresh_token TEXT,
          access_token TEXT,
          token_expires_at TIMESTAMP,
          email_address VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (integrationsError) {
      console.error('Error creating email_integrations table:', integrationsError);
    } else {
      console.log('Email integrations table created successfully');
    }
    
    // Create tickets table
    const { error: ticketsError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          subject VARCHAR(255) NOT NULL,
          description TEXT,
          priority VARCHAR(50) DEFAULT 'medium',
          status VARCHAR(50) DEFAULT 'new',
          desk_id INTEGER REFERENCES desks(id) ON DELETE SET NULL,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
          customer_email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (ticketsError) {
      console.error('Error creating tickets table:', ticketsError);
    } else {
      console.log('Tickets table created successfully');
    }
    
    // Create messages table
    const { error: messagesError } = await supabaseAdmin.rpc('pg_execute', {
      query: `
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          is_internal BOOLEAN DEFAULT FALSE,
          email_message_id VARCHAR(255),
          has_attachments BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (messagesError) {
      console.error('Error creating messages table:', messagesError);
    } else {
      console.log('Messages table created successfully');
    }
    
    console.log('All tables created successfully');
    
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

async function createDefaultUsers() {
  console.log('Creating default users...');
  
  try {
    // Hash passwords
    const adminPassword = await bcrypt.hash('password123', 10);
    const agentPassword = await bcrypt.hash('password', 10);
    
    // Check if admin user exists
    const { data: existingAdmin } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'admin@example.com')
      .single();
    
    // Insert admin user if not exists
    if (!existingAdmin) {
      const { error: adminError } = await supabaseAdmin
        .from('users')
        .insert([
          {
            username: 'Admin User',
            email: 'admin@example.com',
            password: adminPassword,
            role: 'admin'
          }
        ]);
      
      if (adminError) {
        console.error('Error creating admin user:', adminError);
      } else {
        console.log('Admin user created successfully');
      }
    } else {
      console.log('Admin user already exists');
    }
    
    // Check if agent user exists
    const { data: existingAgent } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', 'agent@example.com')
      .single();
    
    // Insert agent user if not exists
    if (!existingAgent) {
      const { error: agentError } = await supabaseAdmin
        .from('users')
        .insert([
          {
            username: 'Agent User',
            email: 'agent@example.com',
            password: agentPassword,
            role: 'agent'
          }
        ]);
      
      if (agentError) {
        console.error('Error creating agent user:', agentError);
      } else {
        console.log('Agent user created successfully');
      }
    } else {
      console.log('Agent user already exists');
    }
    
    console.log('Default users setup completed');
    
  } catch (error) {
    console.error('Error creating default users:', error);
  }
}

async function initializeSupabase() {
  try {
    // Create tables
    await createTables();
    
    // Create default users
    await createDefaultUsers();
    
    console.log('Supabase initialization completed successfully');
  } catch (error) {
    console.error('Error initializing Supabase:', error);
  }
}

// Run the initialization
initializeSupabase();
