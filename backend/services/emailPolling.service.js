const axios = require('axios');
const { supabase } = require('../config/db.config');
const Message = require('../models/message.model');
// TODO: Refactor getMicrosoftAccessToken into a shared utility to avoid potential circular dependencies
const { getMicrosoftAccessToken } = require('../utils/microsoftGraph.utils');
const { uploadFileToS3 } = require('../services/s3.service');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const POLLING_INTERVAL_MS = 30 * 1000; // 30 seconds
let pollingTimeoutId = null;

async function fetchAndProcessEmailsForDesk(deskIntegration) {
  console.log(`[Polling] Starting email fetch for desk_id: ${deskIntegration.desk_id}`);
  try {
    const accessToken = await getMicrosoftAccessToken(deskIntegration.desk_id);
    if (!accessToken) {
      console.error(`[Polling] Could not get access token for desk_id: ${deskIntegration.desk_id}`);
      return;
    }

    const graphApiUrl = 'https://graph.microsoft.com/v1.0/me/messages';
    const params = {
      $filter: 'isRead eq false',
      $top: 25, // Process up to 25 unread emails per poll cycle per desk
      $select: 'id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,hasAttachments,importance,isRead,parentFolderId,sender,internetMessageId',
      $orderby: 'receivedDateTime asc', // Process oldest unread first
      $expand: 'attachments' // Expand attachments to get them in the initial response
    };

    const response = await axios.get(graphApiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    const emails = response.data.value;
    console.log(`[Polling] Fetched ${emails.length} unread emails for desk_id: ${deskIntegration.desk_id}`);

    // Filter out unwanted emails (spam, no-reply, auto-replies, bounces, and bounce notifications)
    const filteredEmails = emails.filter(email => {
      const fromEmail = email.from?.emailAddress?.address?.toLowerCase() || '';
      const subject = (email.subject || '').toLowerCase();
      const body = (email.bodyPreview || '').toLowerCase();
      const bodyHtml = (email.body?.content || '').toLowerCase();
      
      // Common no-reply and notification emails
      const isNoReply = fromEmail.includes('noreply') || 
                       fromEmail.includes('no-reply') ||
                       fromEmail.includes('notification') ||
                       fromEmail.includes('bounce') ||
                       fromEmail.includes('mailer-daemon') ||
                       fromEmail.includes('mailer@') ||
                       fromEmail.includes('postmaster@') ||
                       fromEmail === 'jira@channelplay.atlassian.net' ||
                       fromEmail.endsWith('@mailer.helpscout.net') ||
                       fromEmail.endsWith('@notifications.helpscout.com') ||
                       fromEmail.endsWith('@reply.helpscout.com') ||
                       fromEmail.endsWith('@reply.helpscout.email') ||
                       fromEmail.endsWith('@reply.helpscoutapp.com') ||
                       fromEmail.endsWith('@reply.helpscout.io') ||
                       fromEmail.endsWith('@reply.helpscout-mail.com') ||
                       fromEmail.endsWith('@bounces.helpscout.com') ||
                       fromEmail.endsWith('@bounce.helpscout.com') ||
                       fromEmail.endsWith('@mail.helpscout.com') ||
                       fromEmail.endsWith('@bounce.mail.helpscout.com') ||
                       fromEmail.endsWith('@bounce.helpscout.net');
      
      // Spam detection
      const isSpam = email.internetMessageHeaders?.some(header => 
        (header.name.toLowerCase() === 'x-spam-flag' && header.value.toLowerCase() === 'yes') ||
        (header.name.toLowerCase() === 'x-spam-status' && header.value.toLowerCase().includes('yes')) ||
        (header.name.toLowerCase() === 'x-spam-level' && parseInt(header.value) > 3)
      ) || false;
      
      // Auto-reply detection
      const isAutoReply = email.internetMessageHeaders?.some(header => 
        (header.name.toLowerCase() === 'auto-submitted' && header.value.toLowerCase() !== 'no') ||
        (header.name.toLowerCase() === 'x-auto-response-suppress' && 
         ['oof', 'autoreply', 'automatic'].some(v => header.value.toLowerCase().includes(v)))
      ) || 
      subject.includes('out of office') ||
      subject.includes('auto') && (subject.includes('reply') || subject.includes('response')) ||
      body.includes('this is an automatic response') ||
      body.includes('this is an automated response') ||
      body.includes('automatic reply') ||
      body.includes('automatic response') ||
      body.includes('vacation') ||
      body.includes('away from my email');
      
      // Bounce detection - more comprehensive check
      const isBounce = subject.includes('undeliverable') || 
                      subject.includes('delivery status') ||
                      subject.includes('delivery failure') ||
                      subject.includes('returned mail') ||
                      subject.includes('delivery has failed') ||
                      subject.includes('delivery notification') ||
                      subject.includes('failure notice') ||
                      subject.includes('mail delivery failed') ||
                      subject.includes('mail system error') ||
                      subject.includes('mail delivery system') ||
                      subject.includes('returned to sender') ||
                      subject.includes('undelivered mail') ||
                      subject.includes('delivery problem') ||
                      subject.includes('mail delivery problem') ||
                      subject.includes('returned email') ||
                      subject.includes('undeliverable message') ||
                      subject.includes('message blocked') ||
                      subject.includes('delivery error') ||
                      subject.includes('mail delivery failed') ||
                      subject.includes('could not be delivered') ||
                      subject.includes('delivery has been delayed') ||
                      subject.includes('mail could not be delivered') ||
                      subject.includes('delivery incomplete') ||
                      subject.includes('mail not delivered') ||
                      subject.includes('message rejected') ||
                      subject.includes('too many hops') ||
                      subject.includes('loop detected') ||
                      subject.includes('mail loop') ||
                      subject.includes('routing loop');
      
      // Check for bounce content in the body
      const hasBounceContent = body.includes('your message could not be delivered') ||
                             body.includes('this is the mail system at') ||
                             body.includes('the following message could not be delivered') ||
                             body.includes('delivery to the following recipient failed') ||
                             body.includes('the mail system') && body.includes('could not deliver') ||
                             body.includes('original message') && (body.includes('returned to sender') || body.includes('undeliverable'));

      // Check for bounce headers in the email
      const hasBounceHeaders = email.internetMessageHeaders?.some(header => 
        header.name.toLowerCase().includes('x-failed-recipients') ||
        header.name.toLowerCase().includes('x-failure') ||
        header.name.toLowerCase().includes('x-delivery-status') ||
        header.name.toLowerCase().includes('x-postfix-sender') ||
        header.name.toLowerCase().includes('x-failed-recipient')
      ) || false;

      const shouldFilter = isNoReply || isSpam || isAutoReply || isBounce || hasBounceContent || hasBounceHeaders;

      if (shouldFilter) {
        console.log(`[Polling] Filtered out email from ${fromEmail} - ` +
                   `isNoReply: ${isNoReply}, isSpam: ${isSpam}, ` +
                   `isAutoReply: ${isAutoReply}, isBounce: ${isBounce}, ` +
                   `hasBounceContent: ${hasBounceContent}, hasBounceHeaders: ${hasBounceHeaders}`);
        return false;
      }
      
      return true;
    });

    console.log(`[Polling] Processing ${filteredEmails.length} emails after filtering (${emails.length - filteredEmails.length} filtered out)`);

    for (const email of filteredEmails) {
      try {
        // Initialize message data structure
        const messageData = {
          desk_id: deskIntegration.desk_id,
          microsoft_message_id: email.id,
          microsoft_conversation_id: email.conversationId,
          subject: email.subject,
          body_preview: email.bodyPreview,
          body_html: email.body.contentType === 'html' ? email.body.content : null,
          body_text: email.body.contentType === 'text' ? email.body.content : (email.body.contentType === 'html' ? '' : email.body.content),
          from_address: email.from?.emailAddress?.address,
          from_name: email.from?.emailAddress?.name,
          to_recipients: email.toRecipients?.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })) || [],
          cc_recipients: email.ccRecipients?.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })) || [],
          bcc_recipients: email.bccRecipients?.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })) || [],
          received_at: email.receivedDateTime,
          is_read_on_server: email.isRead, // This will be false as per $filter, but good to capture
          has_attachments: email.hasAttachments,
          importance: email.importance,
          direction: 'incoming',
          in_reply_to_microsoft_id: null, // TODO: Implement robust reply detection using email.references or internetMessageHeaders 
          is_internal: false,
          attachments_urls: [], // Initialize as empty array
        };

        // Process attachments if any
        let attachmentUrlsToSave = [];
        let attachmentsToProcess = [];
        let attachmentsSource = ''; // For logging

        if (email.attachments && email.attachments.length > 0) {
          attachmentsToProcess = email.attachments;
          attachmentsSource = 'expanded from message object';
          console.log(`[Polling] Email ${email.id} has ${attachmentsToProcess.length} attachments directly in message object (from $expand).`);
        } else if (email.hasAttachments) {
          console.log(`[Polling] Email ${email.id} has hasAttachments=true, but no attachments in expanded response. Fetching separately...`);
          try {
            const separateAttachmentsResponse = await axios.get(
              `https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            attachmentsToProcess = separateAttachmentsResponse.data.value || [];
            attachmentsSource = 'fetched via separate API call';
            if (attachmentsToProcess.length > 0) {
              console.log(`[Polling] Found ${attachmentsToProcess.length} attachments for email ${email.id} via separate call.`);
            } else {
              console.log(`[Polling] Attachments API call returned no attachments for ${email.id}, despite hasAttachments being true.`);
            }
          } catch (fetchErr) {
            console.error(`[Polling] Error fetching attachments separately for email ${email.id}:`, fetchErr);
            attachmentsToProcess = [];
          }
        } else {
          console.log(`[Polling] Email ${email.id} has no attachments indicated by hasAttachments flag or in expanded response.`);
        }

        if (attachmentsToProcess.length > 0) {
          console.log(`[Polling] Processing ${attachmentsToProcess.length} attachments for email ${email.id} from source: ${attachmentsSource}`);
          console.log(`[Polling] Email ${email.id} has attachments. Fetching and processing...`);
          
          try {
            // Get attachments list from Microsoft Graph
            const attachmentsResponse = await axios.get(
              `https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            
            // const attachments = attachmentsResponse.data.value || []; // This line is now part of the logic above
            // console.log(`[Polling] Found ${attachments.length} attachments for email ${email.id}`);
            
            const s3UploadResults = [];
            
            // Process each attachment from attachmentsToProcess array
            for (const attachment of attachmentsToProcess) {
              try {
                // REMOVED: Explicit skipping of inline attachments
                // if (attachment.isInline) {
                //   console.log(`[Polling] Skipping inline attachment ${attachment.name}`);
                //   continue;
                // }

                console.log(`[Polling] Processing attachment: ${attachment.name}, Inline: ${attachment.isInline}, ContentID: ${attachment.contentId}`);
                
                // Extract the file content and convert from base64
                const fileContent = Buffer.from(attachment.contentBytes, 'base64');
                
                // Create a file object similar to multer for S3 upload
                const file = {
                  originalname: attachment.name,
                  buffer: fileContent,
                  mimetype: attachment.contentType,
                  size: fileContent.length
                };
                
                // Upload to S3
                console.log(`[Polling] Uploading ${file.originalname} (${file.size} bytes) to S3`);
                const s3Result = await uploadFileToS3(file, 'email-attachments');
                console.log(`[Polling] S3 Upload result:`, s3Result.url);
                
                // Add to results
                s3UploadResults.push({
                  url: s3Result.url,
                  name: attachment.name,       // from Graph API attachment
                  contentType: attachment.contentType, // from Graph API attachment
                  size: file.size,             // Corrected size: size of the decoded file content
                  s3Key: s3Result.s3Key,       // from S3 upload result
                  originalName: attachment.name,  // from Graph API attachment
                  isInline: attachment.isInline || false, // Ensure isInline is captured
                  contentId: attachment.contentId || null // Ensure contentId is captured
                });
              } catch (attachmentError) {
                console.error(`[Polling] Error processing attachment ${attachment.name}:`, attachmentError);
              }
            }
            
            // Store complete attachment objects, not just URLs
            // This ensures the frontend has all the metadata it needs
            attachmentUrlsToSave = s3UploadResults.map(att => ({
              url: att.url,
              name: att.name,
              contentType: att.contentType,
              size: att.size,
              s3Key: att.s3Key,
              originalName: att.originalName,
              isInline: att.isInline, // Pass through isInline
              contentId: att.contentId // Pass through contentId
            }));
            console.log(`[Polling] Attachment metadata to save:`, JSON.stringify(attachmentUrlsToSave));
            
            // Add attachments to message data
            messageData.attachments_urls = attachmentUrlsToSave;
          } catch (attachmentsError) {
            console.error(`[Polling] Error fetching/processing attachments for email ${email.id}:`, attachmentsError);
          }
        }
        
        // Create or update the message in the database
        const savedMessage = await Message.findOrCreateByMicrosoftId(messageData);
        
        if (savedMessage) {
          console.log(`[Polling] Successfully processed and stored/updated email ${email.id} for desk ${deskIntegration.desk_id}`);
          
          // If there are attachment URLs, ensure they are saved.
          // The Message.findOrCreateByMicrosoftId should handle saving attachments_urls if provided in messageData.
          // This explicit update might still be useful if findOrCreateByMicrosoftId doesn't overwrite/update attachments_urls correctly for existing messages.
          if (attachmentUrlsToSave.length > 0 && savedMessage.attachments_urls?.length !== attachmentUrlsToSave.length) {
             console.log(`[Polling] Message ${savedMessage.id} has ${savedMessage.attachments_urls?.length || 0} attachments, but processed ${attachmentUrlsToSave.length}. Updating.`);
            try {
              const { error: updateError } = await supabase
                .from('messages')
                .update({
                  attachments_urls: attachmentUrlsToSave,
                  has_attachments: true
                })
                .eq('microsoft_message_id', email.id);
                
              if (updateError) {
                console.error(`[Polling] Error updating attachment URLs in database:`, updateError);
              } else {
                console.log(`[Polling] Successfully updated attachment URLs for message ${email.id}`);
              }
            } catch (dbError) {
              console.error(`[Polling] Database error while updating attachment URLs:`, dbError);
            }
          }
          
          // Mark email as read on the server AFTER successful processing
          await axios.patch(`${graphApiUrl}/${email.id}`, 
            { isRead: true }, 
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          console.log(`[Polling] Marked email ${email.id} as read on server.`);
        } else {
          console.error(`[Polling] Failed to save email ${email.id} for desk ${deskIntegration.desk_id}`);
        }
      } catch (emailProcessingError) {
        console.error(`[Polling] Error processing individual email ${email.id} for desk ${deskIntegration.desk_id}:`, emailProcessingError.message, emailProcessingError.stack);
      }
    }
  } catch (error) {
    console.error(`[Polling] Error fetching emails for desk_id ${deskIntegration.desk_id}:`, error.response?.data || error.message);
    if (error.response?.status === 401 || error.response?.status === 403) {
        console.error(`[Polling] Token might be invalid for desk_id: ${deskIntegration.desk_id}. Re-authentication might be needed.`);
    }
  }
}

async function pollAllDesks() {
  console.log('[Polling] Starting polling cycle for all desks...');
  try {
    const { data: integrations, error } = await supabase
      .from('email_integrations')
      .select('*')
      // .eq('is_active', true); // Add this back if you have an 'is_active' flag in your email_integrations table

    if (error) {
      console.error('[Polling] Error fetching email integrations:', error.message);
      // If this is due to the Supabase API key issue, this will fail.
      if (error.message.includes('Invalid API key')) {
        console.error("[Polling] CRITICAL: Supabase API key is invalid. Polling cannot fetch integrations.");
      }
      return;
    }

    if (!integrations || integrations.length === 0) {
      console.log('[Polling] No email integrations found to poll. Ensure they are in the email_integrations table and, if applicable, marked as active.');
      return;
    }

    for (const integration of integrations) {
      // Ensure the integration has a desk_id before proceeding
      if (!integration.desk_id) {
        console.warn(`[Polling] Skipping integration ID ${integration.id} as it's missing a desk_id.`);
        continue;
      }
      await fetchAndProcessEmailsForDesk(integration);
    }
  } catch (error) {
    console.error('[Polling] Error in pollAllDesks:', error.message);
  }
}

function startPolling() {
  if (pollingTimeoutId) {
    clearTimeout(pollingTimeoutId);
  }
  console.log(`[Polling] Email polling service started. Interval: ${POLLING_INTERVAL_MS / 1000 / 60} minutes.`);
  
  const runPoll = async () => {
    await pollAllDesks();
    pollingTimeoutId = setTimeout(runPoll, POLLING_INTERVAL_MS);
  };
  
  // Run initial poll, then set interval
  // Consider a small delay before the first poll to allow the app to initialize fully
  setTimeout(runPoll, 5000); // e.g., 5-second delay before first poll
}

function stopPolling() {
  if (pollingTimeoutId) {
    clearTimeout(pollingTimeoutId);
    pollingTimeoutId = null;
    console.log('[Polling] Email polling service stopped.');
  }
}

module.exports = {
  startPolling,
  stopPolling,
  pollAllDesks // For manual trigger if needed
};