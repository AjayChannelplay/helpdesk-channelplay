const axios = require('axios');
const { supabase } = require('../config/db.config');
const Message = require('../models/message.model');
// TODO: Refactor getMicrosoftAccessToken into a shared utility to avoid potential circular dependencies
const { getMicrosoftAccessToken } = require('../utils/microsoftGraph.utils');

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
    };

    const response = await axios.get(graphApiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    const emails = response.data.value;
    console.log(`[Polling] Fetched ${emails.length} unread emails for desk_id: ${deskIntegration.desk_id}`);

    for (const email of emails) {
      try {
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
        };

        const savedMessage = await Message.findOrCreateByMicrosoftId(messageData);
        if (savedMessage) {
          console.log(`[Polling] Successfully processed and stored/updated email ${email.id} for desk ${deskIntegration.desk_id}`);
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