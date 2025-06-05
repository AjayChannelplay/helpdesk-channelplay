const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Verify that environment variables are set
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`ERROR: Required environment variable ${varName} is not set!`);
  }
});

// Configure AWS SDK
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
};

AWS.config.update(awsConfig);
console.log(`AWS SDK configured for region: ${awsConfig.region}`);

const s3 = new AWS.S3();
const bucketName = process.env.S3_BUCKET_NAME;

console.log(`S3 service initialized. Target bucket: ${bucketName}`);

// Verify S3 bucket exists and is accessible
async function verifyBucketAccess() {
  try {
    await s3.headBucket({ Bucket: bucketName }).promise();
    console.log(`✅ Successfully connected to S3 bucket: ${bucketName}`);
    return true;
  } catch (error) {
    console.error(`❌ ERROR: Could not access S3 bucket ${bucketName}:`, error.code);
    console.error('Please check your AWS credentials and bucket permissions');
    return false;
  }
}

// Run verification on startup
verifyBucketAccess();

const uploadFileToS3 = async (file, folder = 'attachments') => {
  // Validate input
  if (!file || !file.buffer || !file.originalname) {
    console.error('Invalid file object received:', file);
    throw new Error('Invalid file object: missing required properties');
  }
  
  console.log(`🔄 Starting upload for file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
  
  try {
    // Create a unique file name to prevent collisions
    const fileExtension = path.extname(file.originalname);
    const fileName = `${folder}/${uuidv4()}${fileExtension}`;
    
    console.log(`📂 Target path in S3: ${fileName}`);
    
    // Verify bucket exists before attempting upload
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
    } catch (bucketError) {
      console.error(`❌ S3 bucket access error: ${bucketError.code}`);
      if (bucketError.code === 'NotFound') {
        throw new Error(`S3 bucket '${bucketName}' not found. Please create it first.`);
      } else if (bucketError.code === 'Forbidden') {
        throw new Error(`No permission to access S3 bucket '${bucketName}'.`);
      }
      throw bucketError;
    }
    
    // Upload the file to S3
    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL: 'public-read', // Removed ACL as bucket doesn't support it
      ContentDisposition: `inline; filename="${file.originalname}"` // Original name when downloaded
    };
    
    console.log('S3 upload params:', { ...params, Body: '(buffer content omitted)' });
    
    console.log(`⬆️ Uploading file to S3...`);
    const uploadResult = await s3.upload(params).promise();
    
    console.log(`✅ Upload successful! File URL: ${uploadResult.Location}`);
    
    // Return information about the uploaded file
    return {
      originalName: file.originalname,
      name: path.basename(fileName),
      url: uploadResult.Location,
      contentType: file.mimetype,
      size: file.size,
      s3Key: fileName
    };
  } catch (error) {
    console.error(`❌ Error uploading file to S3: ${error.message}`);
    console.error('Error details:', error);
    // Consider adding a fallback handling strategy here
    throw new Error(`S3 upload failed: ${error.message}`);
  }
};

// Configure multer for handling file uploads
const storage = multer.memoryStorage(); // Store files in memory for S3 upload
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  }
});

module.exports = {
  upload,
  uploadFileToS3,
  s3,
  bucketName
};
