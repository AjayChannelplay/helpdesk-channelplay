import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  Container, Row, Col, Card, ListGroup, Badge, Button, Form, Spinner, Alert, Dropdown, InputGroup, OverlayTrigger, Tooltip
} from 'react-bootstrap';
import { 
  FaEnvelope, FaTicketAlt, FaUser, FaUserCog, FaComments, 
  FaInbox, FaHistory, FaSyncAlt, FaFilter, FaSort,
  FaSmile, FaReply, FaCheck, FaExclamationCircle, FaBell, 
  FaHeadset, FaPaperPlane, FaCheckCircle, FaInfoCircle, FaAngleDown, FaAngleUp,
  FaPaperclip, FaDownload, FaFile, FaFileImage, FaFilePdf, FaFileWord, 
  FaFileExcel, FaFilePowerpoint, FaFileArchive, FaFileAlt, FaPlus, FaRegClock, FaRegCalendarAlt
} from 'react-icons/fa';
import EmailService from '../../services/email.service';
import TicketService from '../../services/ticket.service';
import AuthService from '../../services/auth.service';
import API from '../../services/api.service';
import { API_URL } from "../../constants";

import './TicketsPage.css';

const apiUrl = API_URL;

const TicketsPage = () => {
  const { deskId: paramDeskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef(null);
  
  // State for tickets and emails
  const [tickets, setTickets] = useState([]);
  const [unreadEmails, setUnreadEmails] = useState([]);
  const [showAllEmails, setShowAllEmails] = useState(true); // Default to showing all emails
  const [allEmails, setAllEmails] = useState([]);
  const [resolvedEmails, setResolvedEmails] = useState([]);
  const [emailStatusFilter, setEmailStatusFilter] = useState('open'); // 'open' or 'closed'
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [replyText, setReplyText] = useState('');
  
  // Auto-refresh settings - always enabled by default for conversations (like ticket list)
  const [autoRefreshEnabled] = useState(true); // Removed setter to keep it always enabled
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedDeskId, setSelectedDeskId] = useState(null);
  const [desks, setDesks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState({});
  const [ccRecipients, setCcRecipients] = useState('');
  const [showCcField, setShowCcField] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const [userInfo, setUserInfo] = useState(null);
  
  // Toggle message details visibility
  const toggleMessageDetails = (messageId) => {
    console.log('Toggle message details for:', messageId);
    setExpandedMessages(prev => {
      const newState = {
        ...prev,
        [messageId]: !prev[messageId]
      };
      console.log('Updated expanded messages state:', newState);
      return newState;
    });
  };
  
  // Get user info from auth service on component mount only
  useEffect(() => {
    try {
      // Load user info
      const user = AuthService.getCurrentUser();
      if (user) {
        console.log('[TicketsPage] Initial userInfo from localStorage:', user);
        setUserInfo(user);
      }
    } catch (err) {
      console.error('Error getting user info:', err);
    }
  }, []);

  // Function to normalize desk objects to ensure consistent structure
  const normalizeDesks = useCallback((desks) => {
    if (!Array.isArray(desks)) return [];
    
    return desks.map(desk => {
      if (!desk) return null;
      
      // Create a normalized desk object with id and name
      const normalizedDesk = {
        ...desk,
        id: desk.id || desk.desk_id || (typeof desk === 'string' ? desk : null),
        name: desk.name || desk.desk_name || `Desk ${desk.id || desk.desk_id || ''}`
      };
      
      return normalizedDesk;
    }).filter(Boolean); // Remove any null entries
  }, []);

  const handleS3Download = async (attachment, messageDeskId) => {
    if (!attachment || !attachment.s3Key) {
      console.error('Invalid attachment object for S3 download:', attachment);
      setError('Cannot download: Invalid attachment data.'); // Assuming setError is a state setter
      return;
    }
    // Use message.desk_id if available, otherwise fallback to selectedDeskId from component state
    const deskIdToUse = messageDeskId || selectedDeskId; 

    if (!deskIdToUse) {
      console.error('Missing desk_id for S3 download. messageDeskId:', messageDeskId, 'selectedDeskId:', selectedDeskId);
      setError('Cannot download: Desk ID is missing.'); // Assuming setError is a state setter
      return;
    }

    console.log(`Attempting to download S3 attachment: ${attachment.name} (Key: ${attachment.s3Key}) for desk: ${deskIdToUse}`);
    setSending(true); // Assuming setSending is a state setter
    setError(null);
    try {
      // This EmailService.downloadS3Attachment method will need to be created
      const blob = await EmailService.downloadS3Attachment(attachment.s3Key, deskIdToUse);
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', attachment.name || 'downloaded_file'); 
      document.body.appendChild(link);
      link.click();
      
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
      setSending(false);
    } catch (err) {
      console.error('Error downloading S3 attachment:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Server error during download.';
      setError(`Download failed: ${errorMessage}`);
      setSending(false);
    }
  };

  // Effect to handle desk fetching - runs only when userInfo changes
  useEffect(() => {
    if (!userInfo) return;
    
    console.log('[TicketsPage] Desk fetching useEffect - userInfo.id:', userInfo.id);
    
    const fetchDesks = async () => {
      try {
        // For admin users, fetch all desks
        if (userInfo.role === 'admin') {
          console.log('[TicketsPage] Fetching all desks for admin user');
          const response = await API.get('/desks');
          setDesks(response.data || []);
          return;
        }
        
        // For agent users, first check if we already have assigned desks
        if (userInfo.role === 'agent') {
          // If we already have assigned desks in userInfo, use those first
          if (Array.isArray(userInfo.assignedDesks) && userInfo.assignedDesks.length > 0) {
            console.log('[TicketsPage] Using existing assignedDesks from userInfo:', userInfo.assignedDesks);
            const normalizedDesks = normalizeDesks(userInfo.assignedDesks);
            setDesks(normalizedDesks);
          } 
          // Otherwise fetch from API once
          else {
            console.log('[TicketsPage] No assignedDesks in userInfo, fetching from API');
            const freshUserInfoResponse = await API.get(`/users/${userInfo.id}`);
            const freshAgentData = freshUserInfoResponse.data;
            
            if (freshAgentData) {
              // Extract assignedDesks from the API response
              let assignedDesks = [];
              
              if (Array.isArray(freshAgentData.assignedDesks)) {
                assignedDesks = freshAgentData.assignedDesks;
              } else if (freshAgentData.user && Array.isArray(freshAgentData.user.assignedDesks)) {
                assignedDesks = freshAgentData.user.assignedDesks;
              }
              
              // Normalize the desk objects
              const normalizedDesks = normalizeDesks(assignedDesks);
              console.log('[TicketsPage] Normalized desks from API:', normalizedDesks);
              
              // Update desk dropdown
              setDesks(normalizedDesks);
              
              // Update localStorage but DON'T update the userInfo state to avoid re-render loop
              const updatedUser = {
                ...userInfo,
                assignedDesks: normalizedDesks
              };
              
              // Only update localStorage, not state
              AuthService.updateCurrentUserInStorage(updatedUser);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching desks:', err);
      }
    };
    
    fetchDesks();
  }, [userInfo?.id, userInfo?.role, normalizeDesks]);

  // Effect to set default selectedDeskId when desks change
  useEffect(() => {
    // Skip if we already have a selectedDeskId or if there's a paramDeskId
    if (selectedDeskId || paramDeskId || !userInfo) return;
    
    // If we have desks, select the first one
    if (desks && desks.length > 0 && !selectedDeskId) {
      console.log('[TicketsPage] Setting default desk:', desks[0].id);
      setSelectedDeskId(desks[0].id.toString());
    }
  }, [desks, selectedDeskId, paramDeskId, userInfo]);

  // Effect to handle deskId from URL parameters (paramDeskId)
  useEffect(() => {
    if (!userInfo || !paramDeskId) return;
    
    console.log('[TicketsPage] Handling URL desk parameter:', paramDeskId);
    
    // For agents, verify they have access to this desk
    if (userInfo.role === 'agent') {
      const isAssigned = Array.isArray(userInfo.assignedDesks) && 
                        userInfo.assignedDesks.some(d => {
                          const deskId = d.id || d.desk_id;
                          return deskId && deskId.toString() === paramDeskId.toString();
                        });
      
      if (!isAssigned) {
        setError('Access Denied: You are not assigned to this desk.');
        setSelectedDeskId(null);
        return;
      }
    }
    
    // Set the selected desk from URL parameter
    setSelectedDeskId(paramDeskId);
    setError(''); // Clear previous errors
  }, [paramDeskId, userInfo]);

  // Effect for when selectedDeskId changes - fetch tickets and emails
  useEffect(() => {
    console.log('Selected desk changed to:', selectedDeskId);
    setTickets([]);
    setSelectedTicket(null);
    setConversation([]);
    
    if (!selectedDeskId) return;
    
    // Set a loading state to show spinner while initial load happens
    setLoading(true);
    
    // Create a flag to track if component is still mounted
    let isMounted = true;
    
    const loadInitialData = async () => {
      try {
        // Fetch tickets and emails in parallel
        const promises = [];
        
        // Fetch tickets
        promises.push(
          TicketService.getTickets(selectedDeskId)
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) setTickets(data);
              console.log('Initial tickets loaded:', data?.length || 0);
            })
            .catch(err => console.error('Error loading initial tickets:', err))
        );
        
        // Fetch emails based on view preference
        if (showAllEmails) {
          promises.push(
            EmailService.fetchEmails(selectedDeskId, 'open')
              .then(data => {
                if (!isMounted) return;
                if (Array.isArray(data)) {
                  setAllEmails(data);
                  setUnreadEmails(data.filter(email => !email.isRead));
                }
                console.log('Initial all emails loaded:', data?.length || 0);
              })
              .catch(err => console.error('Error loading initial all emails:', err))
          );
        } else {
          promises.push(
            EmailService.fetchUnreadEmails(selectedDeskId)
              .then(data => {
                if (!isMounted) return;
                if (Array.isArray(data)) setUnreadEmails(data);
                console.log('Initial unread emails loaded:', data?.length || 0);
              })
              .catch(err => console.error('Error loading initial unread emails:', err))
          );
        }
        
        // Fetch closed emails
        promises.push(
          EmailService.fetchEmails(selectedDeskId, 'closed')
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) setResolvedEmails(data);
              console.log('Initial closed emails loaded:', data?.length || 0);
            })
            .catch(err => console.error('Error loading initial closed emails:', err))
        );
        
        // Wait for all requests to complete
        await Promise.all(promises);
        
        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in loadInitialData:', err);
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    loadInitialData();
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [selectedDeskId, showAllEmails]);

  // Fetch tickets
  const fetchTickets = async () => {
    if (!selectedDeskId) return;
    
    try {
      setLoading(true);
      const ticketsData = await TicketService.getTickets(selectedDeskId);
      console.log('Tickets data:', ticketsData);
      // Only update tickets if we received valid data
      if (Array.isArray(ticketsData)) {
        setTickets(ticketsData);
      } else {
        console.warn('Invalid tickets data received:', ticketsData);
        // Keep previous state
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setLoading(false);
      // Keep previous tickets state on error
    }
  };

  // Fetch unread emails based on desk ID
  const fetchUnreadEmails = async () => {
    if (!selectedDeskId) return;
    
    try {
      setLoading(true);
      const unreadData = await EmailService.fetchUnreadEmails(selectedDeskId);
      console.log('Unread emails data:', unreadData);
      // Only update if we got valid data
      if (Array.isArray(unreadData)) {
        setUnreadEmails(unreadData);
      } else {
        console.warn('Invalid unread emails data received:', unreadData);
        // Keep previous state
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching unread emails:', err);
      setLoading(false);
      // Keep previous unread emails state on error
    }
  };

  // Fetch all emails based on desk ID
  const fetchAllEmails = async () => {
    if (!selectedDeskId) return;
    
    try {
      setLoading(true);
      const emailsData = await EmailService.fetchEmails(selectedDeskId, 'open');
      console.log('All emails data:', emailsData);
      // Only update if we got valid data
      if (Array.isArray(emailsData)) {
        setAllEmails(emailsData);
        // Also update unread emails in case they changed
        setUnreadEmails(emailsData.filter(email => !email.isRead));
      } else {
        console.warn('Invalid emails data received:', emailsData);
        // Keep previous state
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching all emails:', err);
      setLoading(false);
      // Keep previous emails state on error
    }
  };

  // Fetch closed emails with status='closed'
  const fetchClosedEmails = async () => {
    if (!selectedDeskId) return;
    
    try {
      const closedEmailsData = await EmailService.fetchEmails(selectedDeskId, 'closed');
      console.log('Closed emails data:', closedEmailsData);
      // Only update if we got valid data
      if (Array.isArray(closedEmailsData)) {
        setResolvedEmails(closedEmailsData);
      } else {
        console.warn('Invalid closed emails data received:', closedEmailsData);
        // Keep previous state
      }
    } catch (err) {
      console.error('Error fetching closed emails:', err);
      // Keep previous resolved emails state on error
    }
  };

  // Handle refresh button click
  const handleRefresh = useCallback(() => {
    console.log('[TicketsPage] Manual refresh triggered');
    
    // Show loading spinner for manual refresh
    setLoading(true);
    
    // Create a flag to track if component is still mounted
    let isMounted = true;
    
    const refreshAllData = async () => {
      try {
        // Fetch tickets and emails in parallel for better performance
        const promises = [];
        
        // Fetch tickets
        promises.push(
          TicketService.getTickets(selectedDeskId)
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) setTickets(data);
              console.log('Tickets refreshed:', data?.length || 0);
            })
            .catch(err => console.error('Error refreshing tickets:', err))
        );
        
        // Fetch emails based on view preference
        if (showAllEmails) {
          promises.push(
            EmailService.fetchEmails(selectedDeskId, 'open')
              .then(data => {
                if (!isMounted) return;
                if (Array.isArray(data)) {
                  setAllEmails(data);
                  setUnreadEmails(data.filter(email => !email.isRead));
                }
                console.log('All emails refreshed:', data?.length || 0);
              })
              .catch(err => console.error('Error refreshing all emails:', err))
          );
        } else {
          promises.push(
            EmailService.fetchUnreadEmails(selectedDeskId)
              .then(data => {
                if (!isMounted) return;
                if (Array.isArray(data)) setUnreadEmails(data);
                console.log('Unread emails refreshed:', data?.length || 0);
              })
              .catch(err => console.error('Error refreshing unread emails:', err))
          );
        }
        
        // Fetch closed emails
        promises.push(
          EmailService.fetchEmails(selectedDeskId, 'closed')
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) setResolvedEmails(data);
              console.log('Closed emails refreshed:', data?.length || 0);
            })
            .catch(err => console.error('Error refreshing closed emails:', err))
        );
        
        // Wait for all requests to complete
        await Promise.all(promises);
        
        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in refreshAllData:', err);
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    // Only proceed if we have a selected desk
    if (selectedDeskId) {
      refreshAllData();
    } else {
      setLoading(false);
    }
    
    return () => {
      isMounted = false;
    };
  }, [selectedDeskId, showAllEmails]);

  // Auto-refresh functionality for tickets and emails
  useEffect(() => {
    if (!autoRefreshEnabled || !selectedDeskId) return;
    
    console.log(`[TicketsPage] Setting up auto-refresh interval: ${refreshInterval} seconds`);
    
    // Initial load when component mounts or selectedDeskId changes is now done separately
    // to avoid race conditions. Don't call handleRefresh() here as it might lead to state inconsistencies.
    
    // Set up interval for auto-refresh
    const intervalId = setInterval(() => {
      console.log('[TicketsPage] Auto-refresh triggered');
      // Instead of handleRefresh(), call individual fetch functions to better handle errors
      fetchTickets().catch(err => {
        console.error('[Auto-refresh] Error refreshing tickets:', err);
        // Don't update loading state or error state for auto-refresh errors
      });
      
      // Fetch emails based on current view
      if (showAllEmails) {
        fetchAllEmails().catch(err => {
          console.error('[Auto-refresh] Error refreshing all emails:', err);
        });
      } else {
        fetchUnreadEmails().catch(err => {
          console.error('[Auto-refresh] Error refreshing unread emails:', err);
        });
      }
      
      // Fetch closed emails too
      fetchClosedEmails().catch(err => {
        console.error('[Auto-refresh] Error refreshing closed emails:', err);
      });
    }, refreshInterval * 1000);
    
    // Clean up interval on component unmount
    return () => {
      console.log('[TicketsPage] Cleaning up auto-refresh interval');
      clearInterval(intervalId);
    };
  }, [selectedDeskId, autoRefreshEnabled, refreshInterval, showAllEmails, fetchTickets, fetchAllEmails, fetchUnreadEmails, fetchClosedEmails]);

  // Create a fetchConversationData function that can be called both initially and for auto-refresh
  // Use a ref to track if we've just sent a reply and need to force refresh
  const justSentReply = useRef(false);

  // Function to refresh email conversation after reply
  const refreshEmailConversation = useCallback(async (emailId, deskId, replyContent) => {
    try {
      console.log('Refreshing email conversation after reply, email ID:', emailId);
      
      // First, try to get any new conversation data from the server
      const response = await API.get(`/emails/${emailId}?desk_id=${encodeURIComponent(deskId)}`);
      
      if (response.data && response.data.messages) {
        console.log('Got fresh email data with messages:', response.data.messages.length);
        // Return updated messages from the server if available
        return response.data.messages;
      }
      
      // If we get here, we couldn't get updated messages from server, so we'll create a synthetic update
      console.log('No fresh data from server, creating synthetic update');
      return null;
    } catch (err) {
      console.error('Error refreshing email conversation:', err);
      return null;
    }
  }, []);

  const fetchConversationData = useCallback(async (ticket, forceRefresh = false, newReplyContent = null) => {
    if (!ticket) return;
    
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      console.log('Fetching conversation data for ticket:', ticket.id);
      
      // For email conversations without forced refresh
      if (ticket.id && ticket.id.toString().startsWith('email-') && ticket.messages && !forceRefresh) {
        console.log('Using existing conversation messages:', ticket.messages.length);
        setConversation(ticket.messages);
      }
      // Either a regular ticket or we need to force refresh for an email
      else {
        const ticketId = ticket.id;
        console.log(`Fetching ${forceRefresh ? 'fresh' : 'regular'} conversation for ticket ID:`, ticketId);
        
        // Special handling for email tickets that need fresh data after a reply
        if (forceRefresh && ticket.id.toString().startsWith('email-')) {
          const emailId = ticket.id.replace('email-', '');
          console.log('Forcing refresh for email conversation:', emailId);
          
          // Try to get fresh email data
          const freshMessages = await refreshEmailConversation(emailId, selectedDeskId, newReplyContent);
          
          if (freshMessages) {
            // We got fresh message data from server - use it
            console.log('Using fresh message data from server');
            setConversation(freshMessages);
            
            // Also update the ticket.messages so future views are up to date
            if (selectedTicket && selectedTicket.id === ticket.id) {
              setSelectedTicket({
                ...selectedTicket,
                messages: freshMessages
              });
            }
            
            setLoading(false);
            return; // Exit early since we've handled everything
          }
          
          // If we couldn't get fresh data, we'll add our reply to the existing messages
          if (newReplyContent && ticket.messages) {
            console.log('Adding synthetic reply to conversation');
            
            // Clone the messages array
            const updatedMessages = [...ticket.messages];
            
            // Add our reply as a new message
            const newReply = {
              id: `temp-${Date.now()}`,
              subject: ticket.subject || 'Re: ' + (ticket.subject || ''),
              bodyPreview: newReplyContent,
              body: { content: newReplyContent },
              from: { emailAddress: { name: userInfo?.name || 'Support Agent', address: userInfo?.email || '' } },
              sentDateTime: new Date().toISOString(),
              // Add other fields as needed
              isFromCurrentUser: true
            };
            
            updatedMessages.push(newReply);
            
            // Update the conversation and selected ticket
            setConversation(updatedMessages);
            
            // Also update the selected ticket to include our new message
            if (selectedTicket && selectedTicket.id === ticket.id) {
              setSelectedTicket({
                ...selectedTicket,
                messages: updatedMessages
              });
            }
            
            setLoading(false);
            return; // Exit early
          }
        }
        
        // Standard path for regular tickets or if other approaches fail
        const conversationData = await EmailService.fetchConversation(ticketId);
        console.log('Conversation data received:', conversationData);
        
        // Ensure we have an array of conversation messages
        if (conversationData) {
          const messageArray = Array.isArray(conversationData) ? conversationData : 
                            (conversationData.data ? conversationData.data : []);
          
          // Process messages to handle complex objects
          const processedMessages = messageArray.map(message => {
            // Handle complex from object from Microsoft Graph API
            if (message.from && typeof message.from === 'object' && message.from.emailAddress) {
              return {
                ...message,
                fromName: message.from.emailAddress.name || message.from.emailAddress.address
              };
            }
            return message;
          });
          
          setConversation(processedMessages);
        } else {
          setConversation([]);
        }
      }
      
      setLoading(false);
      
      // Scroll to bottom of conversation automatically
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    } catch (error) {
      console.error('Error loading conversation:', error);
      setError('Failed to load conversation. ' + (error.response?.data?.message || 'Please try again.'));
      setLoading(false);
    }
  }, []);
  
  // Initial load of conversation when ticket is selected
  useEffect(() => {
    fetchConversationData(selectedTicket);
  }, [selectedTicket, fetchConversationData]);
  
  // Auto-refresh for conversation
  useEffect(() => {
    if (!autoRefreshEnabled || !selectedTicket) return;
    
    console.log(`[TicketsPage] Setting up conversation auto-refresh: ${refreshInterval} seconds`);
    
    const intervalId = setInterval(() => {
      console.log('[TicketsPage] Auto-refreshing conversation');
      fetchConversationData(selectedTicket);
    }, refreshInterval * 1000);
    
    return () => {
      console.log('[TicketsPage] Cleaning up conversation auto-refresh');
      clearInterval(intervalId);
    };
  }, [selectedTicket, autoRefreshEnabled, refreshInterval, fetchConversationData]);

  // Handle sending a reply to a ticket or email
  const handleSendReply = async () => {
    if (!replyText.trim()) {
      setError('Reply cannot be empty');
      return;
    }
    
    try {
      setSending(true);
      setError(null);
      
      // Check if this is an email preview (not a ticket)
      if (selectedTicket.id && selectedTicket.id.toString().startsWith('email-')) {
        console.log('Sending direct email reply...');
        const emailId = selectedTicket.emailId || selectedTicket.id.replace('email-', '');
        
        // Get the CC recipients from the input field
        const ccAddresses = ccRecipients.split(',').map(cc => cc.trim()).filter(cc => cc);
        
        // Get support agent name and email from current user
        const senderName = userInfo?.name || 'Support Agent';
        const senderEmail = userInfo?.email;

        const formData = new FormData();
        formData.append('emailId', emailId);
        formData.append('desk_id', selectedDeskId); // Use desk_id to match backend expectation
        formData.append('content', replyText);
        ccAddresses.forEach(cc => formData.append('cc_recipients[]', cc));
        formData.append('sender_name', senderName);
        formData.append('sender_email', senderEmail);
        attachments.forEach(file => {
          formData.append('attachments', file);
        });
        
        // Debug FormData contents
        console.log('Email ID:', emailId);
        console.log('Desk ID:', selectedDeskId);
        console.log('FormData entries:');
        for (let pair of formData.entries()) {
          console.log(pair[0] + ': ' + (pair[0] === 'attachments' ? pair[1].name : pair[1]));
        }
        
        // Send reply directly to the email using Microsoft Graph API
        await EmailService.replyToEmail(formData);
        console.log('Attachments sent:', attachments.length > 0 ? attachments.map(file => file.name).join(', ') : 'None');
        
        // Mark email as read after replying
        await EmailService.markAsRead(emailId, selectedDeskId);
        
        // Force refresh the conversation with the latest data and pass the reply content
        // so we can add it to the conversation even if server refresh fails
        fetchConversationData(selectedTicket, true, replyText);
        
        // Set success message
        setSuccess('Email reply sent successfully!');
        setReplyText('');
        setCcRecipients('');
        setAttachments([]); // Clear attachments after successful send
        
        // Refresh unread emails
        if (showAllEmails) {
          await fetchAllEmails();
        } else {
          await fetchUnreadEmails();
        }
      } else {
        // Normal ticket reply
        console.log('Replying to ticket:', selectedTicket.id);
        const formData = new FormData();
        formData.append('ticketId', selectedTicket.id);
        formData.append('content', replyText);
        formData.append('is_internal', false); // Internal note UI removed, defaulting to false
        // No need to append updateStatus if it's null
        attachments.forEach(file => {
          formData.append('attachments', file);
        });

        await EmailService.sendEmail(formData);
        console.log('Attachments sent for ticket reply:', attachments.length > 0 ? attachments.map(file => file.name).join(', ') : 'None');
        
        // Refresh conversation
        fetchConversationData(selectedTicket);
        setReplyText('');
        setSuccess('Reply sent successfully!');
        setAttachments([]); // Clear attachments after successful send
      }
      
      setSending(false);
    } catch (err) {
      console.error('Error sending reply:', err);
      setSending(false);
      setError('Failed to send reply: ' + (err.response?.data?.message || err.message || 'Please try again'));
    }
  };

  const handleFileChange = (event) => {
    const newFiles = Array.from(event.target.files);
    setAttachments(prevAttachments => [...prevAttachments, ...newFiles]);
    // Clear the file input value to allow selecting the same file again if removed and re-added
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (fileName) => {
    setAttachments(prevAttachments => prevAttachments.filter(file => file.name !== fileName));
  };

  // Send resolution email with feedback options
  const resolveEmail = async (emailId) => {
    if (!emailId) {
      setError('Email ID is missing. Cannot resolve.');
      return null;
    }
    
    if (!selectedDeskId) {
      setError('Please select a desk before resolving.');
      return null;
    }
    
    try {
      console.log(`Resolving email ID: ${emailId} for desk: ${selectedDeskId}`);
      setSending(true);
      setError(null); // Clear any previous errors
      
      // Store the conversation ID before resolution to properly track the thread
      let conversationId = null;
      if (selectedTicket && selectedTicket.conversationId) {
        conversationId = selectedTicket.conversationId;
        console.log(`Resolving ticket in conversation: ${conversationId}`);
      } else {
        // Try to find the conversation ID from all emails
        const emailToResolve = allEmails.find(email => 
          email.messages && email.messages.some(msg => msg.id === emailId));
        if (emailToResolve) {
          conversationId = emailToResolve.id;
          console.log(`Found conversation ID from emails list: ${conversationId}`);
        }
      }
      
      // Send the resolution email
      const response = await EmailService.sendResolutionEmail(emailId, selectedDeskId);
      console.log('Resolution email response:', response);
      
      // After successful resolution, wait a moment for database updates to complete
      console.log('Waiting for database updates to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // After delay, re-fetch emails from the backend
      console.log('Re-fetching emails after resolution...');
      
      try {
        // Fetch closed emails FIRST - this is important for proper UI update
        const closedEmailsResponse = await EmailService.fetchEmails(selectedDeskId, 'closed');
        console.log('Fetched closed emails:', closedEmailsResponse);
        
        // Important: check if the resolved thread is now in closed emails
        if (conversationId) {
          const threadInClosedEmails = closedEmailsResponse.some(email => email.id === conversationId);
          console.log(`Is conversation ${conversationId} now in closed emails? ${threadInClosedEmails}`);
        }
        
        // Update resolved emails list with data from backend
        setResolvedEmails(closedEmailsResponse);
        
        // Fetch open emails (using the new status parameter)
        const openEmailsResponse = await EmailService.fetchEmails(selectedDeskId, 'open');
        console.log('Fetched open emails:', openEmailsResponse);
        
        // Update the UI with fresh data from the backend
        setAllEmails(openEmailsResponse);
        setUnreadEmails(openEmailsResponse.filter(email => !email.isRead));
      } catch (fetchError) {
        console.error('Error re-fetching emails after resolution:', fetchError);
      }
      
      // Show success message
      setSuccess('Email resolved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      
      setSending(false);
      return response;
    } catch (err) {
      console.error('Error resolving email:', err);
      setError('Failed to resolve: ' + (err.response?.data?.message || err.message || 'Please try again.'));
      setSending(false);
      return null;
    }
  };
  
  // Update ticket status
  const updateTicketStatus = async (ticketId, status) => {
    try {
      await TicketService.updateTicket(ticketId, { status });
      
      // Update the selected ticket if it's the one being modified
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }
      
      // Refresh tickets list
      fetchTickets();
    } catch (err) {
      console.error('Error updating ticket status:', err);
      setError('Failed to update ticket status. ' + (err.response?.data?.message || 'Please try again.'));
    }
  };

  return (
    <div className="tickets-container">
      <Row>
        <Col md={3} className="tickets-sidebar">
          <Card className="mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <div className="me-2">
                  <Form.Select 
                    size="sm" 
                    value={selectedDeskId || ''}
                    onChange={(e) => setSelectedDeskId(e.target.value)}
                  >
                    <option value="">Select Desk</option>
                    {console.log('[DEBUG] Rendering dropdown with desks:', JSON.stringify(desks))}
                    {Array.isArray(desks) && desks.length > 0 ? (
                      desks.map(desk => {
                        console.log('[DEBUG] Processing desk for dropdown:', desk);
                        return desk && desk.id ? (
                          <option key={desk.id} value={desk.id}>
                            {desk.name || `Desk ${desk.id}`}
                          </option>
                        ) : (
                          console.log('[DEBUG] Skipping desk with missing id:', desk)
                        );
                      })
                    ) : (
                      <option disabled value="">No desks assigned</option>
                    )}
                  </Form.Select>
                </div>
                <Form.Select 
                  size="sm" 
                  value={emailStatusFilter}
                  onChange={(e) => {
                    console.log('Email status filter changed to:', e.target.value);
                    console.log('Current resolved emails count:', resolvedEmails.length);
                    setEmailStatusFilter(e.target.value);
                  }}
                  className="mx-2"
                  style={{ width: 'auto' }}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </Form.Select>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <FaSyncAlt />
                  )}
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              {error && (
                <Alert variant="danger" className="m-2" dismissible onClose={() => setError(null)}>
                  <FaExclamationCircle className="me-2" /> {error}
                </Alert>
              )}
              
              {loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </Spinner>
                </div>
              ) : (
                <div className="ticket-list">
                  {tickets.length === 0 && unreadEmails.length === 0 && allEmails.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="mb-0">No tickets or emails found</p>
                    </div>
                  ) : (
                    <>
                      {/* Email Previews Section */}
                      {!showAllEmails && unreadEmails.length > 0 && (
                        <div className="ticket-section">
                          <div className="ticket-section-header">
                            <small><FaInbox className="me-1" /> Unread Emails ({unreadEmails.length})</small>
                          </div>
                          {unreadEmails.map(email => (
                            <div 
                              key={email.id} 
                              className={`ticket-item ${selectedTicket?.emailId === email.id ? 'active' : ''}`}
                              onClick={() => {
                                const newTicket = {
                                  id: `email-${email.id}`,
                                  subject: email.subject,
                                  from: email.fromName || (email.from?.emailAddress?.name || email.from?.emailAddress?.address),
                                  preview: email.preview,
                                  created: new Date(email.receivedDateTime).toLocaleDateString(),
                                  time: (() => {
                                    const dateObj = new Date(email.receivedDateTime);
                                    return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0)
                                      ? new Date().toLocaleTimeString()
                                      : dateObj.toLocaleTimeString();
                                  })(),
                                  isEmail: true,
                                  emailId: email.id
                                };
                                // Mark email as read when opened
                                EmailService.markAsRead(email.id, selectedDeskId)
                                  .then(() => {
                                    console.log(`Marked email ${email.id} as read`);
                                    // Update the unreadEmails list by removing this email
                                    setUnreadEmails(prev => prev.filter(e => e.id !== email.id));
                                  })
                                  .catch(err => console.error('Error marking email as read:', err));
                                setSelectedTicket(newTicket);
                              }}
                            >
                              <div className="ticket-header">
                                <div className="ticket-subject">{email.subject}</div>
                                <small className="ticket-time">{
                                  (() => {
                                    const dateObj = new Date(email.receivedDateTime);
                                    // Check if hours, minutes, seconds are all zero
                                    return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) 
                                      ? new Date().toLocaleTimeString() 
                                      : dateObj.toLocaleTimeString();
                                  })()
                                }</small>
                              </div>
                              <div className="ticket-info">
                                <small className="ticket-customer">{email.fromName || email.from}</small>
                                <Badge bg="info" pill>New</Badge>
                              </div>
                              <div className="ticket-message">
                                <small>{email.preview}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* All Emails Section (grouped by conversation) */}
                      {showAllEmails && (emailStatusFilter === 'open' ? allEmails.length > 0 : resolvedEmails.length > 0) && (
                        <div className="ticket-section">
                          <div className="ticket-section-header">
                            <small>
                              <FaEnvelope className="me-1" /> 
                              {emailStatusFilter === 'open' ? 'Open' : 'Closed'} Email Conversations 
                              {emailStatusFilter === 'open' ? 
                                `(${allEmails.length})` : 
                                `(${resolvedEmails.length})`
                              }
                            </small>
                          </div>
                          {/* For Open emails, show from allEmails, for Closed emails show from resolvedEmails */}
                          {(emailStatusFilter === 'open' ? allEmails : resolvedEmails)
                            .map(conversation => (
                            <div 
                              key={conversation.id} 
                              className={`ticket-item ${selectedTicket?.conversationId === conversation.id ? 'active' : ''}`}
                              onClick={() => {
                                const newTicket = {
                                  id: `email-${conversation.latestMessageId}`,
                                  subject: conversation.subject,
                                  from: conversation.fromName,
                                  preview: conversation.preview,
                                  created: new Date(conversation.receivedDateTime).toLocaleDateString(),
                                  time: (() => {
                                    const dateObj = new Date(conversation.receivedDateTime);
                                    return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0)
                                      ? new Date().toLocaleTimeString()
                                      : dateObj.toLocaleTimeString();
                                  })(),
                                  isEmail: true,
                                  emailId: conversation.latestMessageId,
                                  conversationId: conversation.id,
                                  messages: conversation.messages,
                                  messageCount: conversation.messageCount || 1
                                };
                                // Mark conversation as read when opened if it has unread messages
                                if (conversation.hasUnread) {
                                  EmailService.markAsRead(conversation.latestMessageId, selectedDeskId)
                                    .then(() => {
                                      console.log(`Marked conversation ${conversation.id} as read`);
                                      // Update the allEmails or resolvedEmails list to remove the unread marker
                                      const updatedConversations = (emailStatusFilter === 'open' ? [...allEmails] : [...resolvedEmails])
                                        .map(conv => {
                                          if (conv.id === conversation.id) {
                                            return {...conv, hasUnread: false};
                                          }
                                          return conv;
                                        });
                                      
                                      if (emailStatusFilter === 'open') {
                                        setAllEmails(updatedConversations);
                                      } else {
                                        setResolvedEmails(updatedConversations);
                                      }
                                    })
                                    .catch(err => console.error('Error marking conversation as read:', err));
                                }
                                setSelectedTicket(newTicket);
                              }}
                            >
                              <div className="ticket-header">
                                <div className="ticket-subject">
                                  {conversation.subject}
                                  {conversation.messageCount > 1 && (
                                    <Badge bg="secondary" className="ms-2" pill>{conversation.messageCount}</Badge>
                                  )}
                                </div>
                                <small className="ticket-time">{
                                  (() => {
                                    const dateObj = new Date(conversation.receivedDateTime);
                                    // Check if hours, minutes, seconds are all zero
                                    return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) 
                                      ? new Date().toLocaleTimeString() 
                                      : dateObj.toLocaleTimeString();
                                  })()
                                }</small>
                              </div>
                              <div className="ticket-info">
                                <small className="ticket-customer">{conversation.fromName}</small>
                                {conversation.hasUnread && <Badge bg="info" pill>New</Badge>}
                              </div>
                              <div className="ticket-message">
                                <small>{conversation.preview}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Tickets Section */}
                      {tickets.length > 0 && (
                        <div className="ticket-section">
                          <div className="ticket-section-header">
                            <small><FaTicketAlt className="me-1" /> Tickets ({tickets.length})</small>
                          </div>
                          {tickets.map(ticket => (
                            <div 
                              key={ticket.id} 
                              className={`ticket-item ${selectedTicket?.id === ticket.id ? 'active' : ''} ${ticket.reopened_from_closed ? 'reopened-ticket' : ''}`}
                              onClick={() => {
                                // For regular tickets, mark as read if status is 'new'
                                if (ticket.status === 'new') {
                                  TicketService.updateTicket(ticket.id, { status: 'open' })
                                    .then(() => {
                                      console.log(`Updated ticket ${ticket.id} status from new to open`);
                                      // Update the local tickets array to reflect the status change
                                      setTickets(prev => prev.map(t => {
                                        if (t.id === ticket.id) {
                                          return {...t, status: 'open'};
                                        }
                                        return t;
                                      }));
                                    })
                                    .catch(err => console.error('Error updating ticket status:', err));
                                }
                                setSelectedTicket(ticket);
                              }}
                            >
                              <div className="ticket-header">
                                <div className="ticket-subject">{ticket.subject}</div>
                                <small className="ticket-time">{
                                  (() => {
                                    const dateObj = new Date(ticket.created_at);
                                    // Check if hours, minutes, seconds are all zero
                                    return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) 
                                      ? new Date().toLocaleTimeString() 
                                      : dateObj.toLocaleTimeString();
                                  })()
                                }</small>
                              </div>
                              <div className="ticket-info">
                                <small className="ticket-customer">{ticket.customer_email || ticket.email}</small>
                                <div>
                                  <Badge 
                                    bg={ticket.status === 'new' ? 'info' : 
                                       ticket.status === 'open' ? 'success' : 
                                       ticket.status === 'closed' ? 'secondary' : 'warning'} 
                                    pill
                                    className="me-1"
                                  >
                                    {ticket.status}
                                  </Badge>
                                  {ticket.reopened_from_closed && (
                                    <Badge bg="purple" pill title="This ticket was created from a reply to a closed conversation">
                                      Reopened
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="ticket-message">
                                <small>{ticket.description?.substring(0, 60)}...</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={9}>
          {selectedTicket ? (
            <Card className="ticket-detail">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <div>
                  <h5 className="mb-0">
                    {selectedTicket.subject}
                    {selectedTicket.messageCount > 1 && (
                      <Badge bg="secondary" className="ms-2">{selectedTicket.messageCount} messages</Badge>
                    )}
                  </h5>
                  <small className="text-muted">
                    {selectedTicket.isEmail ? 
                      <>From: {selectedTicket.from}</> : 
                      <>Customer: {selectedTicket.customer_name || selectedTicket.customer_email}</>} | 
                    {!selectedTicket.isEmail && <>
                      <Badge 
                        bg={selectedTicket.status === 'new' ? 'info' : 
                           selectedTicket.status === 'open' ? 'success' : 
                           selectedTicket.status === 'closed' ? 'secondary' : 'warning'} 
                        pill
                      >
                        {selectedTicket.status}
                      </Badge> | 
                    </>}
                    <FaRegCalendarAlt className="mx-1" /> {
                      (() => {
                        try {
                          // Make sure the date object is properly created with time information
                          const timestamp = selectedTicket.created_at || selectedTicket.created || Date.now();
                          const dateObj = new Date(timestamp);
                          // Check if the timestamp is valid and has proper time values
                          const isTimeValid = !isNaN(dateObj.getTime()) && 
                                            !(dateObj.getHours() === 0 && 
                                              dateObj.getMinutes() === 0 && 
                                              dateObj.getSeconds() === 0);
                          
                          // Use the current time if time component is zeroed out (00:00:00)
                          const displayDate = isTimeValid ? dateObj : new Date();
                          return displayDate.toLocaleString();
                        } catch (e) {
                          console.error('Error formatting date:', e);
                          return new Date().toLocaleString();
                        }
                      })()
                    }
                  </small>
                </div>
                <div>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="me-2"
                    onClick={handleRefresh}
                  >
                    <FaSyncAlt className="me-1" /> Refresh
                  </Button>
                  
                  {/* Auto-refresh is always enabled by default - removed toggle button */}
                  
                  {selectedTicket.isEmail ? (
                    <></>
                  ) : (
                    <Dropdown className="d-inline-block">
                      <Dropdown.Toggle variant="outline-primary" size="sm" id="ticket-actions">
                        <FaUserCog className="me-1" /> Actions
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => updateTicketStatus(selectedTicket.id, 'open')}>
                          <Badge bg="success" className="me-2">Open</Badge> Mark as Open
                        </Dropdown.Item>
                        <Dropdown.Item onClick={() => updateTicketStatus(selectedTicket.id, 'pending')}>
                          <Badge bg="warning" className="me-2">Pending</Badge> Mark as Pending
                        </Dropdown.Item>
                        <Dropdown.Item onClick={() => updateTicketStatus(selectedTicket.id, 'closed')}>
                          <Badge bg="secondary" className="me-2">Closed</Badge> Close Ticket
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item>
                          <FaUserCog className="me-2" /> Assign Ticket
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  )}
                </div>
              </Card.Header>
              <Card.Body className="conversation-container p-0">
                {error && (
                  <Alert variant="danger" className="m-2" dismissible onClose={() => setError(null)}>
                    <FaExclamationCircle className="me-2" /> {error}
                  </Alert>
                )}
                
                {success && (
                  <Alert variant="success" className="m-2" dismissible onClose={() => setSuccess(null)}>
                    <FaCheckCircle className="me-2" /> {success}
                  </Alert>
                )}
                
                {loading ? (
                  <div className="text-center py-4">
                    <Spinner animation="border" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </Spinner>
                  </div>
                ) : (
                  <div className="conversation">
                    {conversation.length === 0 ? (
                      // Initial message based on selected ticket
                      <div className="message-item customer">
                        <div className="message-avatar">
                          <FaUser />
                        </div>
                        <div className="message-content">
                          <div className="message-header">
                            <strong>
                              {selectedTicket.customer_email || 
                               (selectedTicket.customer && typeof selectedTicket.customer === 'object' && selectedTicket.customer.emailAddress ? 
                                 (selectedTicket.customer.emailAddress.name || selectedTicket.customer.emailAddress.address) : 
                                 (typeof selectedTicket.customer === 'string' ? selectedTicket.customer : ''))
                              }
                            </strong>
                            <small>
                              {new Date(selectedTicket.created_at || selectedTicket.created || Date.now()).toLocaleString()}
                            </small>
                          </div>
                          <div className="message-body">
                            {selectedTicket.description || selectedTicket.preview || "No content available"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Show full conversation
                      conversation.map((message, index) => (
                        <div 
                          key={message.id || `msg-${index}`} 
                          className={`message-item ${message.is_internal ? 'internal' : (message.type === 'ticket' ? 'customer' : 'agent')}`}
                        >
                          <div className="message-avatar">
                            <FaUser />
                          </div>
                          <div className="message-content">
                            <div className="message-header d-flex justify-content-between align-items-center">
                              <div>
                                <strong>
                                  {message.fromName || 
                                   (message.from && typeof message.from === 'object' && message.from.emailAddress ? 
                                     (message.from.emailAddress.name || message.from.emailAddress.address) : 
                                     (typeof message.from === 'string' ? message.from : '')) || 
                                   'Unknown'}
                                </strong>
                                {message.is_internal && <Badge bg="warning" className="ms-2">Internal Note</Badge>}
                              </div>
                              <div className="d-flex align-items-center">
                                <small className="me-2">
                                  {(() => {
                                    try {
                                      if (!message.receivedDateTime) return 'Unknown time';
                                      const dateObj = new Date(message.receivedDateTime);
                                      // Check if hours, minutes, seconds are all zero
                                      if (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) {
                                        return new Date().toLocaleString();
                                      } else {
                                        return dateObj.toLocaleString();
                                      }
                                    } catch (e) {
                                      return new Date().toLocaleString();
                                    }
                                  })()}
                                </small>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="p-0 text-muted info-icon-button" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const msgId = message.id || `msg-${index}`;
                                    console.log('Info icon clicked for message:', msgId);
                                    toggleMessageDetails(msgId);
                                  }}
                                  title="Show/Hide Details"
                                >
                                  {expandedMessages[message.id || `msg-${index}`] ? <FaAngleUp /> : <FaInfoCircle />}
                                </Button>
                              </div>
                            </div>
                            <div className="message-body">
                              {message.body && message.body.content ? (
                                <div dangerouslySetInnerHTML={{ __html: message.body.content }} />
                              ) : message.bodyPreview ? (
                                <p>{message.bodyPreview}</p>
                              ) : (
                                <p>No message content</p>
                              )}
                              
                              {/* Display attachments section - handles both Microsoft Graph attachments and S3 attachments */}
                              {(message.hasAttachments || (message.attachments_urls && message.attachments_urls.length > 0)) && (
                                <div className="message-attachments mt-3">
                                  <div className="attachments-header mb-2">
                                    <FaPaperclip className="me-1" /> Attachments
                                    {message.attachments && message.attachments.length > 0 && <span> ({message.attachments.length})</span>}
                                    {message.attachments_urls && message.attachments_urls.length > 0 && <span> ({message.attachments_urls.length})</span>}
                                  </div>
                                  <div className="attachments-list">
                                    {/* Handle Microsoft Graph attachments */}
                                    {message.attachments && message.attachments.length > 0 && message.attachments.map((attachment, i) => {
                                      // Determine icon based on file type
                                      let icon = <FaFile />;
                                      if (attachment.name) {
                                        const extension = attachment.name.split('.').pop().toLowerCase();
                                        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
                                          icon = <FaFileImage />;
                                        } else if (['pdf'].includes(extension)) {
                                          icon = <FaFilePdf />;
                                        } else if (['doc', 'docx'].includes(extension)) {
                                          icon = <FaFileWord />;
                                        } else if (['xls', 'xlsx'].includes(extension)) {
                                          icon = <FaFileExcel />;
                                        } else if (['ppt', 'pptx'].includes(extension)) {
                                          icon = <FaFilePowerpoint />;
                                        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
                                          icon = <FaFileArchive />;
                                        } else if (['txt', 'text'].includes(extension)) {
                                          icon = <FaFileAlt />;
                                        }
                                      }
                                      
                                      // Format file size
                                      const formatFileSize = (bytes) => {
                                        if (!bytes) return 'Unknown size';
                                        const units = ['B', 'KB', 'MB', 'GB'];
                                        let size = bytes;
                                        let unitIndex = 0;
                                        while (size >= 1024 && unitIndex < units.length - 1) {
                                          size /= 1024;
                                          unitIndex++;
                                        }
                                        return `${size.toFixed(1)} ${units[unitIndex]}`;
                                      };
                                      
                                      return (
                                        <div key={`ms-${attachment.id || i}`} className="attachment-item p-2 border rounded mb-2">
                                          <div className="d-flex align-items-center mb-2">
                                            <div className="attachment-icon me-2">
                                              {/* Show file icon if not an image or if URL is missing */}
                                              {!(attachment.contentType && attachment.contentType.startsWith('image/') && attachment.url) && icon}
                                            </div>
                                            <div className="attachment-details flex-grow-1">
                                              <div className="attachment-name">{attachment.name}</div>
                                              <small className="text-muted">{formatFileSize(attachment.size)}</small>
                                            </div>
                                            <div className="attachment-actions">
                                              <Button 
                                                variant="outline-primary" 
                                                size="sm"
                                                onClick={() => handleS3Download(attachment, message.desk_id)}
                                              >
                                                <FaDownload /> Download
                                              </Button>
                                            </div>
                                          </div>
                                          {/* Image Preview Area */}
                                          {attachment.contentType && attachment.contentType.startsWith('image/') && attachment.url && (
                                            <div className="attachment-preview mt-2 text-center">
                                              <img 
                                                src={attachment.url} 
                                                alt={`Preview of ${attachment.name}`} 
                                                style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid #ddd', borderRadius: '4px' }} 
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                    

                                  </div>
                                </div>
                              )}
                              
                              {/* Show recipients information when expanded */}
                              {expandedMessages[message.id || `msg-${index}`] && (
                                <div className="message-details mt-3 p-2 border-top">
                                  {message.from && message.from.emailAddress && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>From: </strong>
                                        {(() => {
                                          const address = message.from.emailAddress.address || 'no-email';
                                          const name = message.from.emailAddress.name || '';
                                          return name ? `${name} <${address}>` : address;
                                        })()} 
                                      </small>
                                    </div>
                                  )}
                                  
                                  {message.ccRecipients && message.ccRecipients.length > 0 && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>CC: </strong>
                                        {message.ccRecipients.map((recipient, i) => {
                                          // Case 1: Microsoft Graph API format
                                          if (recipient && recipient.emailAddress) {
                                            const address = recipient.emailAddress.address || '';
                                            const name = recipient.emailAddress.name || '';
                                            return (
                                              <span key={i}>
                                                {name ? `${name} <${address}>` : address}
                                                {i < message.ccRecipients.length - 1 ? ', ' : ''}
                                              </span>
                                            );
                                          }
                                          
                                          // Case 2: Simple string format
                                          else if (typeof recipient === 'string') {
                                            return (
                                              <span key={i}>
                                                {recipient}
                                                {i < message.ccRecipients.length - 1 ? ', ' : ''}
                                              </span>
                                            );
                                          }
                                          
                                          // Case 3: Simple object format
                                          else if (recipient && typeof recipient === 'object') {
                                            // Try to find address in common property names
                                            const address = recipient.address || recipient.email || recipient.mail || '';
                                            const name = recipient.name || recipient.displayName || '';
                                            
                                            if (address) {
                                              return (
                                                <span key={i}>
                                                  {name ? `${name} <${address}>` : address}
                                                  {i < message.ccRecipients.length - 1 ? ', ' : ''}
                                                </span>
                                              );
                                            }
                                          }
                                          
                                          // Final fallback
                                          return <span key={i}>{JSON.stringify(recipient).replace(/[{}"\']/g, '')}{i < message.ccRecipients.length - 1 ? ', ' : ''}</span>;
                                        })}
                                      </small>
                                    </div>
                                  )}
                                  
                                  {message.receivedDateTime && (
                                    <div>
                                      <small className="text-muted">
                                        <strong>Received: </strong>
                                        {(() => {
                                          const dateObj = new Date(message.receivedDateTime);
                                          // Check if hours, minutes, seconds are all zero
                                          return (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) 
                                            ? new Date().toLocaleString() 
                                            : dateObj.toLocaleString();
                                        })()}
                                      </small>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </Card.Body>
              {/* Only show reply section for non-closed tickets/emails */}
              {(emailStatusFilter !== 'closed' && (selectedTicket.status !== 'closed')) && (
                <Card.Footer>
                  <Form>
                    <Form.Group>
                      {showCcField && (
                        <InputGroup className="mb-2">
                          <InputGroup.Text>CC:</InputGroup.Text>
                          <Form.Control 
                            type="text" 
                            placeholder="recipient1@example.com, recipient2@example.com"
                            value={ccRecipients}
                            onChange={(e) => setCcRecipients(e.target.value)}
                            disabled={sending}
                          />
                        </InputGroup>
                      )}
                      <InputGroup>
                        <Form.Control 
                          as="textarea" 
                          rows={3} 
                          placeholder="Type your reply here..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          disabled={sending}
                        />
                      </InputGroup>
                      {attachments.length > 0 && (
                        <div className="mt-2 mb-2">
                          <small className="text-muted d-block mb-1">Attachments:</small>
                          <ListGroup variant="flush" className="attachment-list">
                            {attachments.map((file, index) => (
                              <ListGroup.Item key={index} className="d-flex justify-content-between align-items-center p-1 border-0 bg-light rounded mb-1">
                                <small className="text-truncate" style={{ maxWidth: 'calc(100% - 30px)' }}>
                                  <FaPaperclip size={12} className="me-1 flex-shrink-0" />
                                  {file.name} ({ (file.size / 1024).toFixed(1) } KB)
                                </small>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="p-0 text-danger ms-2 flex-shrink-0" 
                                  onClick={() => handleRemoveAttachment(file.name)} 
                                  aria-label={`Remove ${file.name}`}
                                >
                                  &times;
                                </Button>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        </div>
                      )}
                      <div className="d-flex justify-content-between align-items-center mt-2">
                        <div>
                          <OverlayTrigger
                            placement="top"
                            overlay={<Tooltip>Attach files</Tooltip>}
                          >
                            <Button variant="link" className="text-muted p-0 me-2" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                              <FaPaperclip />
                            </Button>
                          </OverlayTrigger>
                          <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            style={{ display: 'none' }} 
                          />
                          <Button
                            variant="link"
                            className="text-muted p-0"
                            onClick={() => setShowCcField(!showCcField)}
                          >
                            CC{showCcField ? ' ▲' : ' ▼'}
                          </Button>
                        </div>
                        <div>
                          {selectedTicket.isEmail ? (
                            <Button 
                              variant="info"
                              className="me-2"
                              onClick={() => resolveEmail(selectedTicket.emailId)}
                              disabled={sending}
                            >
                              <FaCheckCircle className="me-1" /> Resolve Email
                            </Button>
                          ) : (
                            <Button 
                              variant="outline-secondary" 
                              className="me-2"
                              onClick={() => updateTicketStatus(selectedTicket.id, 'closed')}
                            >
                              <FaCheck className="me-1" /> Close
                            </Button>
                          )}
                          <Button 
                            variant="primary"
                            onClick={handleSendReply}
                            disabled={!replyText.trim() || sending}
                          >
                            {sending ? (
                              <>
                                <Spinner animation="border" size="sm" className="me-1" /> Sending...
                              </>
                            ) : (
                              <>
                                <FaPaperPlane className="me-1" /> {selectedTicket.isEmail ? "Reply" : "Send"}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </Form.Group>
                  </Form>
                </Card.Footer>
              )}
              {/* Show a notice for closed tickets */}
              {(emailStatusFilter === 'closed' || selectedTicket.status === 'closed') && (
                <Card.Footer className="text-center text-muted py-3">
                  <FaInfoCircle className="me-2" /> This conversation is closed. Replying is not available.
                </Card.Footer>
              )}
            </Card>
          ) : (
            <div className="text-center py-5">
              <FaEnvelope size={40} className="text-muted mb-3" />
              <h4>Select a ticket to view details</h4>
              <p className="text-muted">Choose a ticket from the list to view and reply to conversations.</p>
            </div>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default TicketsPage;