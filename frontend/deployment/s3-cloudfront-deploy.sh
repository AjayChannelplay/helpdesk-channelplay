#!/bin/bash
# S3 & CloudFront Deployment Script

# Variables - customize these
S3_BUCKET="channelplaydesk-frontend"
CLOUDFRONT_DISTRIBUTION_ID="your-cloudfront-distribution-id"
REGION="ap-south-1"
API_URL="https://api.channelplay.in"

# Create production environment file
echo "Creating production environment file..."
cat > .env.production << EOL
# API Configuration
VITE_API_URL=${API_URL}

# Authentication
VITE_JWT_STORAGE_KEY=helpdesk_auth_token

# Application Settings
VITE_APP_NAME=Helpdesk
VITE_DEFAULT_DASHBOARD_ROUTE=/tickets
EOL

# Build the React application
echo "Building React application..."
npm run build

# Deploy to S3
echo "Deploying to S3..."
aws s3 sync dist/ s3://$S3_BUCKET/ --delete --region $REGION

# Invalidate CloudFront cache
echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"

echo "Frontend deployment complete!"
