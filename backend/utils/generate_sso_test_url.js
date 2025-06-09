const crypto = require('crypto');

// The email to encrypt - using harshit@channelplay.in as requested
const email = 'harshit@channelplay.in';

// Load environment variables
require('dotenv').config();

// The secret key for AES-256 encryption from environment variables (must be exactly 32 bytes/characters)
const SECRET_KEY = process.env.AES_SECRET_KEY || 'channelplay_1office_helpdesk_prd';
// Convert text string to buffer for crypto operations - using utf8 encoding
const KEY_BUFFER = Buffer.from(SECRET_KEY, 'utf8');

// Function to encrypt email in a format compatible with our decryption
const encryptEmail = (email) => {
  try {
    // Generate a random initialization vector (IV)
    const iv = crypto.randomBytes(16);
    
    // Create cipher using key and IV
    const cipher = crypto.createCipheriv('aes-256-cbc', KEY_BUFFER, iv);
    
    // Encrypt the email
    let encrypted = cipher.update(email, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Format 1: IV:Ciphertext
    const format1 = `${iv.toString('hex')}:${encrypted}`;
    const base64Format1 = Buffer.from(format1).toString('base64');
    
    // Format 2: Prepend IV to ciphertext (binary)
    const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
    const base64Format2 = combined.toString('base64');
    
    // Return both formats so we can test which one works with our decryption
    return {
      format1: encodeURIComponent(base64Format1),
      format2: encodeURIComponent(base64Format2)
    };
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
};

// Generate encrypted email parameter
const encryptedFormats = encryptEmail(email);

// Generate test URLs
if (encryptedFormats) {
  // Local development URLs
  console.log('\n--- LOCAL TEST URLs ---');
  console.log(`\nFormat 1 (IV:Ciphertext):`);
  console.log(`http://localhost:5173/access?email=${encryptedFormats.format1}`);
  
  console.log(`\nFormat 2 (Binary IV+Ciphertext):`);
  console.log(`http://localhost:5173/access?email=${encryptedFormats.format2}`);
  
  // Production URLs
  console.log('\n\n--- PRODUCTION TEST URLs ---');
  console.log(`\nFormat 1 (IV:Ciphertext):`);
  console.log(`https://d1hp5pkc3976q6.cloudfront.net/access?email=${encryptedFormats.format1}`);
  
  console.log(`\nFormat 2 (Binary IV+Ciphertext):`);
  console.log(`https://d1hp5pkc3976q6.cloudfront.net/access?email=${encryptedFormats.format2}`);
  
  console.log('\n\nTry both formats - our decryption code handles both possibilities.');
  console.log('Remember to replace "test@example.com" with a valid email from your database!');
} else {
  console.error('Failed to generate encrypted email');
}
