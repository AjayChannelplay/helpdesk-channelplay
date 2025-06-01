# Helpdesk Application Deployment Guide

This document provides detailed instructions for deploying the Helpdesk application on AWS infrastructure:
- Backend: Amazon EC2
- Frontend: Amazon S3 + CloudFront

## Architecture Overview

- **Backend**: Node.js/Express API deployed on EC2, with Nginx as reverse proxy
- **Frontend**: React application hosted on S3 and distributed via CloudFront
- **Database**: Supabase (external service)
- **Authentication**: JWT + Microsoft OAuth2 for email integration

## Prerequisites

- AWS Account with appropriate permissions
- Domain name with access to DNS configuration
- Supabase account and project
- Microsoft Azure account for OAuth2 email integration
- AWS CLI configured locally
- Node.js and npm installed locally

## Backend Deployment (EC2)

### 1. Launch EC2 Instance

1. Launch an Amazon Linux 2 EC2 instance (t2.micro or larger recommended)
2. Configure Security Group:
   - Allow HTTP (80) and HTTPS (443) from anywhere
   - Allow SSH (22) from your IP address
3. Create or use an existing key pair for SSH access

### 2. Setup Environment

1. SSH into your EC2 instance:
   ```
   ssh -i your-key.pem ec2-user@your-ec2-public-ip
   ```

2. Clone the repository:
   ```
   git clone https://your-repo-url.git /home/ec2-user/helpdesk
   cd /home/ec2-user/helpdesk/backend
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Create .env file based on .env.example:
   ```
   cp .env.example .env
   nano .env  # Edit with your actual values
   ```

5. Run the setup script:
   ```
   chmod +x deployment/ec2-setup.sh
   ./deployment/ec2-setup.sh
   ```

### 3. Configure Nginx and SSL

1. Update the Nginx configuration:
   ```
   sudo nano /etc/nginx/conf.d/helpdesk.conf
   ```
   Replace `api.your-domain.com` with your actual domain.

2. Set up SSL with Let's Encrypt:
   ```
   sudo amazon-linux-extras install epel -y
   sudo yum install certbot python2-certbot-nginx -y
   sudo certbot --nginx -d api.your-domain.com
   ```

3. Update DNS:
   Create an A record pointing your backend subdomain (e.g., api.your-domain.com) to your EC2 instance's public IP.

### 4. Start the Service

```
sudo systemctl enable helpdesk
sudo systemctl start helpdesk
```

## Frontend Deployment (S3 + CloudFront)

### 1. Create S3 and CloudFront Resources

Use the provided CloudFormation template:

1. Navigate to AWS CloudFormation console
2. Create new stack → Upload template → Select `frontend/deployment/cloudformation-template.yaml`
3. Enter parameters:
   - Domain name for frontend (e.g., helpdesk.your-domain.com)
   - SSL Certificate ARN (from AWS Certificate Manager)
4. Create stack and wait for completion
5. Note the outputs (S3 bucket name, CloudFront distribution ID)

### 2. Configure Environment and Build

1. Create frontend environment file:
   ```
   cd frontend
   cp .env.example .env
   ```

2. Edit .env file with your API domain:
   ```
   VITE_API_URL=https://api.your-domain.com
   ```

3. Update deployment script:
   ```
   nano deployment/s3-cloudfront-deploy.sh
   ```
   Update variables with your S3 bucket name and CloudFront distribution ID

### 3. Deploy Frontend

1. Build and deploy:
   ```
   chmod +x deployment/s3-cloudfront-deploy.sh
   ./deployment/s3-cloudfront-deploy.sh
   ```

2. Update DNS:
   Create a CNAME record pointing your frontend domain (e.g., helpdesk.your-domain.com) to your CloudFront distribution domain.

## DNS Configuration

Set up the following records with your DNS provider:

1. Backend:
   ```
   api.your-domain.com → A record → EC2 Public IP
   ```

2. Frontend:
   ```
   helpdesk.your-domain.com → CNAME → d1234abcd.cloudfront.net
   ```

## Microsoft OAuth2 Configuration

1. In your Microsoft Azure Portal:
   - Update the redirect URI to match your production domain:
     `https://api.your-domain.com/api/email-auth/microsoft/callback`

2. Update your backend .env file with the correct OAuth2 credentials

## Monitoring and Maintenance

1. Check backend status:
   ```
   https://api.your-domain.com/api/health
   ```

2. View backend logs:
   ```
   sudo journalctl -u helpdesk
   ```

3. Update application:
   ```
   cd /home/ec2-user/helpdesk
   git pull
   cd backend
   npm install
   sudo systemctl restart helpdesk
   cd ../frontend
   ./deployment/s3-cloudfront-deploy.sh
   ```

## Troubleshooting

- If the backend service fails to start, check logs:
  ```
  sudo journalctl -u helpdesk
  ```

- If the frontend doesn't update after deployment:
  1. Verify the S3 bucket contents
  2. Check CloudFront cache invalidation status
  3. Manually create a CloudFront invalidation if needed

- For SSL issues, check certbot logs:
  ```
  sudo certbot certificates
  ```
