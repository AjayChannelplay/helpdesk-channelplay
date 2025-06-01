#!/bin/bash
# EC2 Backend Setup Script

# Update the system
sudo yum update -y

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install -y nodejs

# Install Nginx
sudo amazon-linux-extras install nginx1 -y
sudo systemctl start nginx
sudo systemctl enable nginx

# Setup Firewall
sudo yum install -y firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
mkdir -p /home/ec2-user/helpdesk/backend

# Copy Nginx configuration
sudo cp /home/ec2-user/helpdesk/backend/deployment/nginx.conf /etc/nginx/conf.d/helpdesk.conf
sudo systemctl restart nginx

# Setup systemd service
sudo cp /home/ec2-user/helpdesk/backend/deployment/helpdesk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable helpdesk
sudo systemctl start helpdesk

# Setup SSL with Let's Encrypt (optional)
# sudo yum install -y certbot python2-certbot-nginx
# sudo certbot --nginx -d api.your-domain.com

echo "Backend setup complete!"
