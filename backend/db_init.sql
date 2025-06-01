-- Database initialization script for Channelplay Helpdesk System

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'agent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create desks table
CREATE TABLE IF NOT EXISTS desks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  email_address VARCHAR(100),
  provider_type VARCHAR(50) DEFAULT 'MICROSOFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create desk_assignments table for agent-desk relationships
CREATE TABLE IF NOT EXISTS desk_assignments (
  id SERIAL PRIMARY KEY,
  desk_id INTEGER REFERENCES desks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(desk_id, user_id)
);

-- Create email_integrations table
CREATE TABLE IF NOT EXISTS email_integrations (
  id SERIAL PRIMARY KEY,
  desk_id INTEGER REFERENCES desks(id) ON DELETE CASCADE,
  provider_type VARCHAR(50) NOT NULL, -- 'GMAIL' or 'MICROSOFT'
  client_id VARCHAR(255),
  client_secret VARCHAR(255),
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMP,
  email_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tickets table
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

-- Create messages table
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

-- Insert default admin user
INSERT INTO users (username, email, password, role)
VALUES (
  'admin',
  'admin@example.com',
  '$2b$10$9tEVBEA7Sj22XoEQvWSTdugF1K3qvY8Ni7J6HCZ6AGMIZRdmQujMG', -- password123
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insert default agent user
INSERT INTO users (username, email, password, role)
VALUES (
  'agent',
  'agent@example.com',
  '$2b$10$mjfhrm8gN1nEJ7.Q/U6VgOZaS1HEwNVc9D/QKsC3UwEcRoach4Pv2', -- password
  'agent'
) ON CONFLICT (email) DO NOTHING;
