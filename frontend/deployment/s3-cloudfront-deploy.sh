#!/bin/bash
# S3 & CloudFront Deployment Script

# Variables - customize these
S3_BUCKET="your-s3-bucket-name"
CLOUDFRONT_DISTRIBUTION_ID="your-cloudfront-distribution-id"
REGION="us-east-1"

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
