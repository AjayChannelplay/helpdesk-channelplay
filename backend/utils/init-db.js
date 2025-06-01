const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../config/supabase.config');
const dotenv = require('dotenv');

dotenv.config();

async function initializeDatabase() {
  try {
    console.log('Reading SQL initialization script...');
    const sqlScript = fs.readFileSync(
      path.join(__dirname, '..', 'db_init.sql'),
      'utf8'
    );

    // Split the SQL script into individual statements
    const statements = sqlScript
      .split(';')
      .filter(statement => statement.trim() !== '')
      .map(statement => statement.trim() + ';');

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement sequentially
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabaseAdmin.rpc('pg_execute', { query: statement });
      
      if (error) {
        console.error(`Error executing statement ${i + 1}:`, error);
      }
    }

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Run the initialization function
initializeDatabase();
