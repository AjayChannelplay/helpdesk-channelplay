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

// Determine region and log it
const configuredRegion = process.env.AWS_REGION;
console.log(`----------------->[s3.service] Value of process.env.AWS_REGION at module load: ${configuredRegion}`);

const regionToUse = configuredRegion || 'us-east-1'; // Default to us-east-1 if not set
console.log(`---------------->[s3.service] Region being used for S3 client: ${regionToUse}`);

// Instantiate S3 client with explicit configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: regionToUse,
  signatureVersion: 'v4', // Important for many regions, ensures V4 signatures
  endpoint: `https://s3.${regionToUse}.amazonaws.com` // Explicitly set the endpoint URL
});

const bucketName = process.env.S3_BUCKET_NAME;
console.log(`[s3.service] S3 client initialized. Target bucket: ${bucketName}, Region: ${regionToUse}`);

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
    // Create a unique file name to prevent collisions and sanitize the extension
    const fileExtension = path.extname(file.originalname)
      .toLowerCase()  // Convert extension to lowercase
      .replace(/[^a-z0-9.]/g, ''); // Remove any non-alphanumeric chars except period
    
    // Using UUID to avoid any filename collision issues
    const fileName = `${folder}/${uuidv4()}${fileExtension ? `.${fileExtension.replace(/^\./,'')}` : ''}`;
    
    // Log sanitized filename
    console.log(`🔄 Original filename: ${file.originalname}, Sanitized S3 path: ${fileName}`);
    
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
      ContentDisposition: `inline; filename="${encodeURIComponent(file.originalname)}"` // URL encode the filename to avoid special character issues
    };
    
    console.log('S3 Upload Params:', JSON.stringify(params, (key, value) => (key === 'Body' ? '(buffer content omitted)' : value), 2));
    console.log(`*****************[s3.service] PRE-UPLOAD CHECK - s3.config.region: ${s3.config.region}, s3.config.signatureVersion: ${s3.config.signatureVersion}`);
    console.log('Uploading file to S3...');
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

// Function to get a readable stream for an S3 object
const getS3ObjectStream = (s3Key) => {
  if (!s3Key) {
    console.error('[s3.service] s3Key is required for getS3ObjectStream');
    throw new Error('S3 key is required to get object stream.');
  }
  console.log(`[s3.service] Creating read stream for S3 key: ${s3Key}`);
  const params = {
    Bucket: bucketName,
    Key: s3Key,
  };
  try {
    return s3.getObject(params).createReadStream();
  } catch (error) {
    console.error(`[s3.service] Error creating S3 object stream for key ${s3Key}:`, error);
    throw error; // Re-throw to be caught by the caller
  }
};

module.exports = {
  upload,
  uploadFileToS3,
  s3,
  bucketName,
  getS3ObjectStream
};
