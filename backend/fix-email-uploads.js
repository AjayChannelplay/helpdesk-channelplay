// Apply the sequential upload fix to email.controller.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'controllers', 'email.controller.js');

// Read the file content
let content = fs.readFileSync(filePath, 'utf8');

// Find the target section using a unique pattern
const targetPattern = `// Step 1: Upload files to S3 in parallel
        const uploadPromises = attachments.map(file => uploadFileToS3(file, \`attachments/\${desk_id}\`));
        const uploadedFiles = await Promise.all(uploadPromises);`;

// Replace with the sequential upload code
const replacementCode = `// Step 1: Upload files to S3 sequentially for better error handling
        const uploadedFiles = [];
        for (const file of attachments) {
          // Validate file buffer before attempting upload
          if (!file.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
            console.error(\`❌ Invalid buffer for file \${file.originalname}:\`, 
                        typeof file.buffer, 
                        file.buffer ? \`length: \${file.buffer.length}\` : 'null');
            throw new Error(\`Invalid buffer for attachment: \${file.originalname}\`);
          }
          
          console.log(\`📤 Uploading \${file.originalname} (\${file.buffer.length} bytes) to S3...\`);
          const result = await uploadFileToS3(file, \`attachments/\${desk_id}\`);
          uploadedFiles.push(result);
        }`;

// Replace the target pattern with the sequential code
if (content.includes(targetPattern)) {
  content = content.replace(targetPattern, replacementCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Successfully updated email.controller.js to use sequential S3 uploads');
  console.log('This should fix the AWS signature mismatch error');
} else {
  console.error('❌ Target pattern not found in email.controller.js');
}
