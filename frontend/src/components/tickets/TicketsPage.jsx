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
    setExpandedMessages(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
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
      
      // Load resolved emails from localStorage
      try {
        const storedResolvedEmails = JSON.parse(localStorage.getItem('resolvedEmails') || '[]');
        console.log('[TicketsPage] Loaded resolved emails from localStorage:', storedResolvedEmails);
        setResolvedEmails(storedResolvedEmails);
      } catch (e) {
        console.error('Error loading resolved emails from localStorage:', e);
        // If there's an error, initialize with empty array
        setResolvedEmails([]);
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
    // Reset states when selectedDeskId changes or becomes null to clear previous desk's data
    console.log('[TicketsPage] selectedDeskId changed to:', selectedDeskId, "Resetting ticket states."); // DEBUG LOG
    setTickets([]);
    setSelectedTicket(null);
    setConversation([]);
    // setError(null); // Clear general errors, or handle more specifically
    // setSuccess(null);

    if (selectedDeskId) {
      setLoading(true); // Indicate loading for the new desk's data
      fetchTickets();
      if (showAllEmails) {
        fetchAllEmails();
      } else {
        fetchUnreadEmails();
      }
    } else {
      setLoading(false); // No desk selected, nothing to load
    }
  }, [selectedDeskId, showAllEmails]);
  
  // Fetch tickets
  const fetchTickets = async () => {
    if (!selectedDeskId) {
      setTickets([]);
      setLoading(false); // Ensure loading is false if no desk is selected
      // setError('No desk selected or you do not have access to any desks.'); // Optional: provide a message
      return;
    }
    try {
      setLoading(true);
      const response = await TicketService.getTickets({ deskId: selectedDeskId });
      setTickets(response.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets. ' + (err.response?.data?.message || 'Please try again.'));
      setTickets([]);
      setLoading(false);
    }
  };
  
  // Fetch unread emails
  const fetchUnreadEmails = async () => {
    try {
      setRefreshing(true);
      if (!selectedDeskId) {
        console.log('No desk selected, skipping unread emails fetch');
        setUnreadEmails([]);
        setRefreshing(false);
        return;
      }
      
      console.log('Fetching unread emails for desk:', selectedDeskId);
      const response = await EmailService.fetchUnreadEmails(selectedDeskId);
      console.log('Unread emails response:', response);
      
      // Handle both response formats for backward compatibility
      const emails = Array.isArray(response) ? response : 
                    (response.data && Array.isArray(response.data)) ? response.data : [];
      
      setUnreadEmails(emails);
      setRefreshing(false);
    } catch (err) {
      console.error('Error fetching unread emails:', err);
      setUnreadEmails([]);
      setRefreshing(false);
      setError('Failed to load unread emails. Please try again.');
    }
  };
  
  // Fetch all emails (both read and unread) with conversation history
  const fetchAllEmails = async () => {
    try {
      setRefreshing(true);
      if (!selectedDeskId) {
        console.log('No desk selected, skipping all emails fetch');
        setAllEmails([]);
        setRefreshing(false);
        return;
      }
      
      console.log('Fetching all emails for desk:', selectedDeskId);
      const response = await EmailService.fetchAllEmails(selectedDeskId);
      console.log('All emails response:', response);
      
      // Handle both response formats for backward compatibility
      const conversations = Array.isArray(response) ? response : 
                           (response.data && Array.isArray(response.data)) ? response.data : [];
      
      console.log('Processed conversations:', conversations.length);
      setAllEmails(conversations);
      setRefreshing(false);
    } catch (err) {
      console.error('Error fetching all emails:', err);
      setAllEmails([]);
      setRefreshing(false);
      setError('Failed to load all emails. Please try again.');
    }
  };
  
  // Handle refresh button click
  const handleRefresh = () => {
    fetchTickets();
    if (showAllEmails) {
      fetchAllEmails();
    } else {
      fetchUnreadEmails();
    }
  };
  
  // Load conversation when ticket is selected
  useEffect(() => {
    const loadConversation = async () => {
      if (!selectedTicket) return;
      
      try {
        setLoading(true);
        setError(null); // Clear any previous errors
        console.log('Selected ticket changed:', selectedTicket);
        
        // For email conversations, use the messages array that was already fetched
        if (selectedTicket.id && selectedTicket.id.toString().startsWith('email-') && selectedTicket.messages) {
          console.log('Using existing conversation messages:', selectedTicket.messages.length);
          setConversation(selectedTicket.messages);
        }
        // For regular tickets, fetch conversation from server
        else if (selectedTicket.id && !selectedTicket.id.toString().startsWith('email-')) {
          const ticketId = selectedTicket.id;
          console.log('Fetching conversation for ticket ID:', ticketId);
          
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
        } else {
          // For individual email previews without conversation data
          console.log('Email preview selected without messages array');
          setConversation([]);
        }
        
        setLoading(false);
        
        // Scroll to bottom of conversation
        setTimeout(() => {
          if (messagesEndRef.current) {
            console.log('Scrolling to bottom of conversation');
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      } catch (err) {
        console.error('Error fetching conversation:', err);
        setConversation([]);
        setLoading(false);
        setError('Failed to load conversation. Please try again.');
      }
    };
    
    loadConversation();
  }, [selectedTicket]);

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
        fetchConversation(selectedTicket.id);
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
      
      const response = await EmailService.sendResolutionEmail(emailId, selectedDeskId);
      console.log('Resolution email response:', response);
      
      // Find the email in allEmails that matches this emailId
      const emailToResolve = allEmails.find(email => {
        // Check if it's a direct match on ID
        if (email.id === emailId) return true;
        // Or if it's a conversation with this message
        if (email.latestMessageId === emailId) return true;
        return false;
      });
      
      if (emailToResolve) {
        // Add the resolved email to the resolved list
        setResolvedEmails(prev => [...prev, {
          ...emailToResolve,
          resolvedAt: new Date().toISOString()
        }]);
        
        // Store in localStorage to persist resolved status
        const storedResolvedEmails = JSON.parse(localStorage.getItem('resolvedEmails') || '[]');
        localStorage.setItem('resolvedEmails', JSON.stringify([
          ...storedResolvedEmails,
          {
            id: emailToResolve.id,
            resolvedAt: new Date().toISOString()
          }
        ]));
      }
      
      // Remove the email from unread emails list
      setUnreadEmails(unreadEmails.filter(email => email.id !== emailId));
      
      // Show success message
      setSuccess('Resolution email sent successfully!');
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
                  onChange={(e) => setEmailStatusFilter(e.target.value)}
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
                                  time: new Date(email.receivedDateTime).toLocaleTimeString(),
                                  isEmail: true,
                                  emailId: email.id
                                };
                                setSelectedTicket(newTicket);
                              }}
                            >
                              <div className="ticket-header">
                                <div className="ticket-subject">{email.subject}</div>
                                <small className="ticket-time">{new Date(email.receivedDateTime).toLocaleTimeString()}</small>
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
                      {showAllEmails && allEmails.length > 0 && (
                        <div className="ticket-section">
                          <div className="ticket-section-header">
                            <small>
                              <FaEnvelope className="me-1" /> 
                              {emailStatusFilter === 'open' ? 'Open' : 'Closed'} Email Conversations 
                              {emailStatusFilter === 'open' ? 
                                `(${allEmails.filter(email => !resolvedEmails.some(resolved => 
                                  resolved.id === email.id || resolved.id === email.latestMessageId
                                )).length})` : 
                                `(${resolvedEmails.length})`
                              }
                            </small>
                          </div>
                          {allEmails
                            .filter(email => {
                              // Check if this email is in the resolvedEmails list
                              const isResolved = resolvedEmails.some(resolved => 
                                resolved.id === email.id || resolved.id === email.latestMessageId
                              );
                              
                              // For 'open' filter, show emails that are NOT resolved
                              // For 'closed' filter, show emails that ARE resolved
                              return emailStatusFilter === 'open' ? !isResolved : isResolved;
                            })
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
                                  time: new Date(conversation.receivedDateTime).toLocaleTimeString(),
                                  isEmail: true,
                                  emailId: conversation.latestMessageId,
                                  conversationId: conversation.id,
                                  messages: conversation.messages,
                                  messageCount: conversation.messageCount || 1
                                };
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
                                <small className="ticket-time">{new Date(conversation.receivedDateTime).toLocaleTimeString()}</small>
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
                              className={`ticket-item ${selectedTicket?.id === ticket.id ? 'active' : ''}`}
                              onClick={() => setSelectedTicket(ticket)}
                            >
                              <div className="ticket-header">
                                <div className="ticket-subject">{ticket.subject}</div>
                                <small className="ticket-time">{new Date(ticket.created_at).toLocaleTimeString()}</small>
                              </div>
                              <div className="ticket-info">
                                <small className="ticket-customer">{ticket.customer_email}</small>
                                <Badge 
                                  bg={ticket.status === 'new' ? 'info' : 
                                     ticket.status === 'open' ? 'success' : 
                                     ticket.status === 'closed' ? 'secondary' : 'warning'} 
                                  pill
                                >
                                  {ticket.status}
                                </Badge>
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
                          return new Date(selectedTicket.created_at || selectedTicket.created || Date.now()).toLocaleString();
                        } catch (e) {
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
                                      return message.receivedDateTime ? new Date(message.receivedDateTime).toLocaleString() : 'Unknown time';
                                    } catch (e) {
                                      return new Date().toLocaleString();
                                    }
                                  })()}
                                </small>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="p-0 text-muted" 
                                  onClick={() => toggleMessageDetails(message.id || `msg-${index}`)}
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
                              
                              {/* Display attachments if any */}
                              {message.hasAttachments && message.attachments && message.attachments.length > 0 && (
                                <div className="message-attachments mt-3">
                                  <div className="attachments-header mb-2">
                                    <FaPaperclip className="me-1" /> Attachments ({message.attachments.length})
                                  </div>
                                  <div className="attachments-list">
                                    {message.attachments.map((attachment, i) => {
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
                                        <div key={attachment.id} className="attachment-item p-2 border rounded mb-2 d-flex align-items-center">
                                          <div className="attachment-icon me-2">
                                            {icon}
                                          </div>
                                          <div className="attachment-details flex-grow-1">
                                            <div className="attachment-name">{attachment.name}</div>
                                            <small className="text-muted">{formatFileSize(attachment.size)}</small>
                                          </div>
                                          <div className="attachment-actions">
                                            <Button 
                                              variant="outline-primary" 
                                              size="sm"
                                              href={`${apiUrl}/emails/${message.id}/attachments/${attachment.id}?desk_id=${selectedTicket.desk_id}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              <FaDownload /> Download
                                            </Button>
                                          </div>
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
                                        {message.from.emailAddress.name} &lt;{message.from.emailAddress.address}&gt;
                                      </small>
                                    </div>
                                  )}
                                  
                                  {message.toRecipients && message.toRecipients.length > 0 && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>To: </strong>
                                        {message.toRecipients.map((recipient, i) => (
                                          <span key={i}>
                                            {recipient.emailAddress.name ? 
                                              `${recipient.emailAddress.name} <${recipient.emailAddress.address}>` : 
                                              recipient.emailAddress.address}
                                            {i < message.toRecipients.length - 1 ? ', ' : ''}
                                          </span>
                                        ))}
                                      </small>
                                    </div>
                                  )}
                                  
                                  {message.ccRecipients && message.ccRecipients.length > 0 && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>CC: </strong>
                                        {message.ccRecipients.map((recipient, i) => (
                                          <span key={i}>
                                            {recipient.emailAddress.name ? 
                                              `${recipient.emailAddress.name} <${recipient.emailAddress.address}>` : 
                                              recipient.emailAddress.address}
                                            {i < message.ccRecipients.length - 1 ? ', ' : ''}
                                          </span>
                                        ))}
                                      </small>
                                    </div>
                                  )}
                                  
                                  {message.receivedDateTime && (
                                    <div>
                                      <small className="text-muted">
                                        <strong>Received: </strong>
                                        {new Date(message.receivedDateTime).toLocaleString()}
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