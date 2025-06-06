// Load environment variables first
require('dotenv').config();

// Then import S3 service
const { uploadFileToS3 } = require('./services/s3.service');
const fs = require('fs');
const path = require('path');

// Log environment variables (without revealing secrets)
console.log('AWS Environment Check:');
console.log('- AWS_ACCESS_KEY_ID exists:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('- AWS_SECRET_ACCESS_KEY exists:', !!process.env.AWS_SECRET_ACCESS_KEY);
console.log('- AWS_REGION:', process.env.AWS_REGION);
console.log('- S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME);

async function testS3Upload() {
  try {
    // Create a simple test file
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'This is a test file for S3 upload');
    
    // Create a file object similar to what multer would produce
    const file = {
      originalname: 'test-upload.txt',
      buffer: fs.readFileSync(testFilePath),
      mimetype: 'text/plain',
      size: fs.statSync(testFilePath).size
    };
    
    console.log(`\n🔍 Testing S3 upload with file: ${file.originalname} (${file.size} bytes)`);
    
    // Upload to S3
    const result = await uploadFileToS3(file, 'test');
    console.log(`\n✅ Test upload successful!`);
    console.log('File URL:', result.url);
    console.log('File Name:', result.originalName);
    console.log('S3 Key:', result.s3Key);
    
    // Clean up test file
    fs.unlinkSync(testFilePath);
    return result;
  } catch (error) {
    console.error(`\n❌ Test upload failed:`, error);
    throw error;
  }
}

// Run the test
testS3Upload()
  .then(result => {
    console.log('\nℹ️ S3 Configuration is working correctly!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ S3 Configuration has issues!', error);
    process.exit(1);
  });
