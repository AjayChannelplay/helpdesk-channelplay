const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// The secret key for AES-256 decryption
const SECRET_KEY = 'dbcd6f9d779dfb85cbdb1fc1c15010dc5cb508414ab452b8ccece1cfb192c877';
// Convert hex string to buffer for crypto operations
const KEY_BUFFER = Buffer.from(SECRET_KEY, 'hex');

// JWT settings
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRY = '24h'; // Token expires after 24 hours

/**
 * Decrypt the encrypted email using AES-256
 * @param {string} encryptedEmail - The encrypted email from the URL
 * @returns {string|null} - The decrypted email or null if decryption fails
 */
const decryptEmail = (encryptedEmail) => {
  try {
    // URL decode the encrypted email first
    const decodedEmail = decodeURIComponent(encryptedEmail);
    
    // Split into parts - assuming format is iv:ciphertext
    // If the format is different, this will need adjustment
    const parts = Buffer.from(decodedEmail, 'base64').toString('utf8').split(':');
    
    if (parts.length !== 2) {
      console.error('Invalid encrypted format - expected iv:ciphertext');
      return null;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const ciphertext = Buffer.from(parts[1], 'hex');
    
    // Create decipher with key and IV
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUFFER, iv);
    
    // Decrypt
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

/**
 * Alternative decryption method if the encrypted format is different
 * @param {string} encryptedEmail - The encrypted email from the URL
 * @returns {string|null} - The decrypted email or null if decryption fails
 */
const alternativeDecrypt = (encryptedEmail) => {
  try {
    // URL decode and Base64 decode
    const decodedEmail = decodeURIComponent(encryptedEmail);
    const buffer = Buffer.from(decodedEmail, 'base64');
    
    // Extract IV (first 16 bytes) and ciphertext (remaining bytes)
    const iv = buffer.slice(0, 16);
    const ciphertext = buffer.slice(16);
    
    // Create decipher with key and IV
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUFFER, iv);
    
    // Decrypt
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Alternative decryption error:', error);
    return null;
  }
};

/**
 * Process SSO access request with encrypted email
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.processAccess = async (req, res) => {
  console.log('Processing access request');
  const { email: encryptedEmail } = req.query;
  
  if (!encryptedEmail) {
    console.error('No encrypted email provided');
    return res.status(400).json({ 
      success: false, 
      message: 'Missing encrypted email parameter' 
    });
  }
  
  console.log(`Received encrypted email: ${encryptedEmail}`);
  
  // Try to decrypt the email
  let decryptedEmail = decryptEmail(encryptedEmail);
  
  // If primary decryption fails, try alternative method
  if (!decryptedEmail) {
    console.log('Primary decryption failed, trying alternative method');
    decryptedEmail = alternativeDecrypt(encryptedEmail);
  }
  
  if (!decryptedEmail) {
    console.error('Failed to decrypt email');
    return res.status(400).json({ 
      success: false, 
      message: 'Failed to decrypt email parameter' 
    });
  }
  
  console.log(`Decrypted email: ${decryptedEmail}`);
  
  try {
    // Look up the user in the database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', decryptedEmail)
      .single();
    
    if (error || !user) {
      console.error('User not found:', error || 'No user with this email');
      return res.status(404).json({ 
        success: false, 
        message: 'User not found with the provided email' 
      });
    }
    
    console.log(`Found user: ${user.id} (${user.email})`);
    
    // Fetch assigned desks for the user
    const { data: deskAssignments, error: desksError } = await supabase
      .from('desk_assignments')
      .select('desk_id, desk:desks(id, name)')
      .eq('user_id', user.id);
    
    if (desksError) {
      console.error('Error fetching assigned desks:', desksError);
      // Continue without desk data
    }
    
    console.log(`Fetched ${deskAssignments?.length || 0} desk assignments for user`);
    
    // Transform desk assignments into the expected format
    const assignedDesks = deskAssignments?.map(assignment => {
      return {
        id: assignment.desk_id,
        name: assignment.desk?.name || assignment.desk_id,
        desk_id: assignment.desk_id
      };
    }) || [];
    
    console.log('Formatted desk assignments:', JSON.stringify(assignedDesks, null, 2));
    
    // Create JWT token for the user
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    console.log('JWT token generated successfully');
    
    // Format the response to match the structure expected by frontend
    const response = {
      success: true,
      message: 'Authentication successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],  // Use part before @ if no name
        display_name: user.display_name || user.name || user.email.split('@')[0],
        role: user.role || 'user',
        assignedDesks: assignedDesks
      },
      assignedDesks: assignedDesks,
      redirectUrl: '/'  // Redirect to home page after successful login
    };
    
    console.log('Sending SSO response:', JSON.stringify(response, null, 2));
    res.json(response);
    
  } catch (err) {
    console.error('Server error during access processing:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication process' 
    });
  }
};
