const axios = require('axios');
const { google } = require('googleapis');
const EmailIntegration = require('../models/email-integration.model');

class EmailService {
  constructor(desk) {
    this.desk = desk;
    this.emailIntegration = null;
  }

  // Initialize the email service with the appropriate provider
  async init() {
    try {
      // Get email integration settings for the desk
      this.emailIntegration = await EmailIntegration.findByDeskId(this.desk.id);
      
      if (!this.emailIntegration) {
        throw new Error('No email integration found for this desk');
      }
      
      // Initialize the appropriate email provider
      const providerType = String(this.emailIntegration.provider_type).toUpperCase();
      if (providerType === 'MICROSOFT') {
        await this.initMicrosoftClient();
      } else if (providerType === 'GMAIL') {
        await this.initGmailClient();
      } else {
        throw new Error(`Unsupported provider type: ${this.emailIntegration.provider_type}`);
      }
      
      return true;
    } catch (error) {
      console.error('Error initializing email service:', error);
      throw error;
    }
  }

  // Initialize Microsoft Graph API client
  async initMicrosoftClient() {
    // Check if token is expired and refresh if needed
    const now = new Date();
    const tokenExpiresAt = new Date(this.emailIntegration.token_expires_at);
    
    if (now >= tokenExpiresAt) {
      await this.refreshMicrosoftToken();
    }
    
    this.microsoftAccessToken = this.emailIntegration.access_token;
  }

  // Initialize Gmail API client
  async initGmailClient() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    
    // Check if token is expired and refresh if needed
    const now = new Date();
    const tokenExpiresAt = new Date(this.emailIntegration.token_expires_at);
    
    if (now >= tokenExpiresAt) {
      await this.refreshGmailToken(oauth2Client);
    }
    
    oauth2Client.setCredentials({
      access_token: this.emailIntegration.access_token,
      refresh_token: this.emailIntegration.refresh_token
    });
    
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  // Refresh Microsoft access token
  async refreshMicrosoftToken() {
    try {
      const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
      
      const params = new URLSearchParams();
      params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
      params.append('client_secret', process.env.MICROSOFT_CLIENT_SECRET);
      params.append('refresh_token', this.emailIntegration.refresh_token);
      params.append('grant_type', 'refresh_token');
      
      const response = await axios.post(tokenEndpoint, params);
      
      // Calculate token expiration time (response.data.expires_in is in seconds)
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + response.data.expires_in);
      
      // Update tokens in database
      await EmailIntegration.updateOAuthTokens(this.desk.id, {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || this.emailIntegration.refresh_token,
        token_expires_at: expiresAt
      });
      
      // Update current instance
      this.emailIntegration.access_token = response.data.access_token;
      this.emailIntegration.refresh_token = response.data.refresh_token || this.emailIntegration.refresh_token;
      this.emailIntegration.token_expires_at = expiresAt;
      this.microsoftAccessToken = response.data.access_token;
      
      return true;
    } catch (error) {
      console.error('Error refreshing Microsoft token:', error);
      throw new Error(`Failed to refresh Microsoft token: ${error.message}`);
    }
  }

  // Refresh Gmail access token
  async refreshGmailToken(oauth2Client) {
    try {
      const { tokens } = await oauth2Client.refreshToken(this.emailIntegration.refresh_token);
      
      // Calculate token expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);
      
      // Update tokens in database
      await EmailIntegration.updateOAuthTokens(this.desk.id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || this.emailIntegration.refresh_token,
        token_expires_at: expiresAt
      });
      
      // Update current instance
      this.emailIntegration.access_token = tokens.access_token;
      this.emailIntegration.refresh_token = tokens.refresh_token || this.emailIntegration.refresh_token;
      this.emailIntegration.token_expires_at = expiresAt;
      
      // Update oauth client
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || this.emailIntegration.refresh_token
      });
      
      return true;
    } catch (error) {
      console.error('Error refreshing Gmail token:', error);
      throw new Error(`Failed to refresh Gmail token: ${error.message}`);
    }
  }

  // Send email using the appropriate provider
  // Can accept either (to, subject, textBody, htmlBody, ticketId, messageId) parameters
  // or a single emailData object with those properties
  async sendEmail(toOrEmailData, subject, textBody, htmlBody, ticketId, messageId) {
    try {
      await this.init();
      
      // Determine if we're using the single object or multiple parameters approach
      let emailData;
      if (typeof toOrEmailData === 'object' && toOrEmailData !== null) {
        // Single object parameter
        emailData = toOrEmailData;
      } else {
        // Multiple parameters
        emailData = {
          to: toOrEmailData,
          subject,
          body: htmlBody || textBody,
          ticketId: ticketId || null,
          messageId: messageId || null
        };
      }
      
      const providerType = String(this.emailIntegration.provider_type).toUpperCase();
      if (providerType === 'MICROSOFT') {
        return await this.sendMicrosoftEmail(emailData);
      } else if (providerType === 'GMAIL') {
        return await this.sendGmailEmail(emailData);
      } else {
        throw new Error(`Unsupported provider type: ${this.emailIntegration.provider_type}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // Send email using Microsoft Graph API
  async sendMicrosoftEmail(emailData) {
    try {
      const { to, subject, body, ticketId, messageId } = emailData;
      
      if (!to) {
        throw new Error('Recipient email address is required');
      }
      
      if (!subject) {
        throw new Error('Email subject is required');
      }
      
      if (!body) {
        throw new Error('Email body content is required');
      }
      
      // Format the email
      const email = {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ],
          internetMessageHeaders: []
        },
        saveToSentItems: 'true'
      };
      
      // Add optional headers only if values are provided
      if (ticketId) {
        email.message.internetMessageHeaders.push({
          name: 'X-Ticket-ID',
          value: String(ticketId)
        });
      }
      
      if (messageId) {
        email.message.internetMessageHeaders.push({
          name: 'X-Message-ID',
          value: String(messageId)
        });
      }
      
      // Send the email using Microsoft Graph API
      const response = await axios.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        email,
        {
          headers: {
            'Authorization': `Bearer ${this.microsoftAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { success: true, response: response.data };
    } catch (error) {
      console.error('Error sending Microsoft email:', error);
      throw new Error(`Failed to send Microsoft email: ${error.message}`);
    }
  }

  // Send email using Gmail API
  async sendGmailEmail(emailData) {
    try {
      const { to, subject, body, ticketId, messageId } = emailData;
      
      // Format the email content
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `From: ${this.emailIntegration.email_address}`,
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        `X-Ticket-ID: ${ticketId}`,
        `X-Message-ID: ${messageId}`,
        '',
        body
      ];
      const message = messageParts.join('\n');
      
      // Encode the email in base64
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      // Send the email using Gmail API
      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });
      
      return { success: true, response: res.data };
    } catch (error) {
      console.error('Error sending Gmail email:', error);
      throw new Error(`Failed to send Gmail email: ${error.message}`);
    }
  }

  // Fetch emails using the appropriate provider
  async fetchEmails() {
    try {
      await this.init();
      
      const providerType = String(this.emailIntegration.provider_type).toUpperCase();
      if (providerType === 'MICROSOFT') {
        return await this.fetchMicrosoftEmails();
      } else if (providerType === 'GMAIL') {
        return await this.fetchGmailEmails();
      } else {
        throw new Error(`Unsupported provider type: ${this.emailIntegration.provider_type}`);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  // Fetch emails using Microsoft Graph API
  async fetchMicrosoftEmails() {
    try {
      // Fetch unread emails from inbox
      const response = await axios.get(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=50',
        {
          headers: {
            'Authorization': `Bearer ${this.microsoftAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data.value;
    } catch (error) {
      console.error('Error fetching Microsoft emails:', error);
      throw new Error(`Failed to fetch Microsoft emails: ${error.message}`);
    }
  }

  // Fetch emails using Gmail API
  async fetchGmailEmails() {
    try {
      // Fetch unread emails from inbox
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread in:inbox'
      });
      
      const emails = [];
      
      // Get detailed information for each email
      for (const message of response.data.messages || []) {
        const email = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        
        emails.push(email.data);
      }
      
      return emails;
    } catch (error) {
      console.error('Error fetching Gmail emails:', error);
      throw new Error(`Failed to fetch Gmail emails: ${error.message}`);
    }
  }
}

module.exports = EmailService;
