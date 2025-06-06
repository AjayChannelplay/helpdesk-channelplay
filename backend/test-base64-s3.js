require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadFileToS3 } = require('./services/s3.service');

// Verify that all required environment variables are available
console.log('Checking environment variables...');
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME'];
const missingVars = [];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
  } else {
    // Only log the first character, mask the rest for security
    console.log(`${varName} is set: ${process.env[varName].substring(0, 1)}${'*'.repeat(5)}`);
  }
});

if (missingVars.length > 0) {
  console.error('ERROR: Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);

// Test function: Upload a base64 string to S3
async function testBase64Upload() {
  try {
    console.log('===== TEST: UPLOADING BASE64 DATA TO S3 =====');
    
    // Create a simple text file as base64
    const testText = 'Hello World! This is a test file for base64 upload.';
    const base64Content = Buffer.from(testText).toString('base64');
    console.log(`Created base64 content: ${base64Content.substring(0, 30)}...`);
    
    // Convert back to buffer (simulating what we do with email attachments)
    const fileBuffer = Buffer.from(base64Content, 'base64');
    console.log(`Converted back to buffer: ${fileBuffer.length} bytes`);
    
    // Create a file object like what we'd get from an email attachment
    const file = {
      originalname: 'test-base64-file.txt',
      buffer: fileBuffer,
      mimetype: 'text/plain',
      size: fileBuffer.length
    };
    
    console.log('Uploading to S3...');
    const result = await uploadFileToS3(file, 'test-base64');
    
    console.log('===== UPLOAD RESULT =====');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('===== TEST COMPLETED =====');
    return result;
  } catch (error) {
    console.error('ERROR IN TEST:', error);
  }
}

// Run the test
testBase64Upload()
  .then(result => {
    console.log(`Test completed with URL: ${result?.url}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
