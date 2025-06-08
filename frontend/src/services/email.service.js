import API from './api.service';

const EmailService = {
  // Get Microsoft OAuth URL
  getMicrosoftAuthUrl: async (deskId) => {
    try {
      const response = await API.get('/email-auth/microsoft/auth-url', {
        params: { desk_id: deskId }
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get Gmail OAuth URL
  getGmailAuthUrl: async (deskId) => {
    try {
      const response = await API.get('/email-auth/gmail/auth-url', {
        params: { desk_id: deskId }
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Send email
  sendEmail: async (formData) => {
    try {
      const ticketId = formData.get('ticketId');
      const deskId = formData.get('desk_id');
      
      // Debug the FormData contents
      console.log('Send Email - FormData contents:');
      for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + (pair[0] === 'attachments' ? pair[1].name : pair[1]));
      }
      
      // Remove desk_id from FormData and pass as query parameter
      if (deskId) {
        formData.delete('desk_id');
      }
      
      const response = await API.post(
        `/emails/send/${ticketId}${deskId ? `?desk_id=${encodeURIComponent(deskId)}` : ''}`, 
        formData
      );
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Reply to an email directly using Microsoft Graph API
  replyToEmail: async (formData) => {
    try {
      const emailId = formData.get('emailId');
      const deskId = formData.get('desk_id');
      
      // Debug the FormData contents
      console.log('Email Service - FormData contents:');
      for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + (pair[0] === 'attachments' ? pair[1].name : pair[1]));
      }
      
      // IMPORTANT: Remove the desk_id from the FormData since we'll pass it as a query parameter
      // This avoids issues with how FormData is processed by multer and body-parser
      formData.delete('desk_id');
      
      // When sending FormData, we don't need to set headers manually
      // The API service already handles auth headers via interceptors
      // And axios will automatically set the correct Content-Type with boundary parameter
      
      // Pass desk_id as a query parameter instead of in the form data
      const response = await API.post(
        `/emails/${emailId}/reply?desk_id=${encodeURIComponent(deskId)}`, 
        formData
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in replyToEmail:', error);
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Fetch unread emails for a desk
  fetchUnreadEmails: async (deskId) => {
    try {
      const response = await API.get('/emails/unread', {
        params: { desk_id: deskId }
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Fetch all emails (both read and unread) for a desk with conversation history
  fetchAllEmails: async (deskId) => {
    try {
      const response = await API.get('/emails', {
        params: { desk_id: deskId }
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Fetch email conversation for a ticket
  fetchConversation: async (ticketId) => {
    try {
      console.log('Fetching conversation for ticket:', ticketId);
      const response = await API.get(`/emails/conversation/${ticketId}`);
      
      console.log('Conversation response:', response.data);
      // Handle both response formats (array or {data: array})
      const conversation = Array.isArray(response.data) ? response.data : 
                         (response.data && response.data.data) ? response.data.data : [];
      
      return conversation;
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Mark email as read
  markAsRead: async (emailId, deskId) => {
    try {
      const response = await API.post(`/emails/mark-read/${emailId}`, {}, {
        params: { deskId }
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  

  
  // Send resolution feedback email with emoji rating options
  sendResolutionEmail: async (emailId, deskId, feedbackType = null) => {
    try {
      console.log(`Sending resolution email for ${emailId} from desk ${deskId}`);
      
      // Base resolution message
      let content = '<p>Your ticket has been resolved. Thank you for contacting us!</p>';
      
      // Add feedback request with emojis
      content += '<p>How was your experience? Please let us know:</p>';
      content += '<p>';
      content += '😀 Great | ';
      content += '🙂 Good | ';
      content += '😐 Average | ';
      content += '🙁 Poor | ';
      content += '😞 Bad';
      content += '</p>';
      
      // Add any specific feedback that was selected
      if (feedbackType) {
        content += `<p>You selected: ${feedbackType}</p>`;
      }
      
      const response = await API.post(`/emails/${emailId}/resolve`, {
        content,
        deskId,
        subject: 'Ticket Resolved - Feedback Request'
      });
      
      return response.data;
    } catch (error) {
      console.error('Error sending resolution email:', error);
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Download S3 attachment
  downloadS3Attachment: async (s3Key, deskId) => {
    try {
      const response = await API.get('/emails/s3-download', {
        params: { 
          s3Key: s3Key, // Axios will URL-encode this
          desk_id: deskId 
        },
        responseType: 'blob' // Important for file downloads
      });
      return response.data; // This will be the blob
    } catch (error) {
      console.error('Error downloading S3 attachment in EmailService:', error);
      throw error.response ? error.response.data : error.message;
    }
  },

  // Fetch emails by status (e.g., 'open', 'closed')
  fetchEmails: async (deskId, status = 'open') => { 
    try {
      const response = await API.get('/emails', {
        params: { 
          desk_id: deskId,
          status: status  
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching emails with status ${status} for desk ${deskId}:`, error);
      throw error.response ? error.response.data : error.message;
    }
  }
};

export default EmailService;
