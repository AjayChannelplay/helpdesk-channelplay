import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Collapse } from 'react-bootstrap'; // Or wherever your Collapse component comes from
import { FaChevronDown, FaChevronUp, FaUserPlus } from 'react-icons/fa'; // Icons from react-icons
// Email acknowledgment is now handled by the backend
import { useNavigate, useLocation, useParams, unstable_setDevServerHooks } from 'react-router-dom';
import {
  Container, Row, Col, Card, ListGroup, Badge, Button, Form, Spinner, Alert, Dropdown, InputGroup, OverlayTrigger, Tooltip, Pagination, Tab, Nav, Tabs, Modal
} from 'react-bootstrap';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  FaEnvelope, FaTicketAlt, FaUser, FaUserCog, FaComments, FaComment,
  FaInbox, FaHistory, FaSyncAlt, FaFilter, FaSort,
  FaSmile, FaReply, FaCheck, FaExclamationCircle, FaBell,
  FaHeadset, FaPaperPlane, FaCheckCircle, FaInfoCircle, FaAngleDown, FaAngleUp,
  FaPaperclip, FaDownload, FaFile, FaFileImage, FaFilePdf, FaFileExcel, FaFilePowerpoint, FaFileArchive, FaFileAlt, FaPlus, FaRegClock, FaRegCalendarAlt, FaEye, FaTimes
} from 'react-icons/fa';
import { FiExternalLink } from 'react-icons/fi';
import TicketService from '../../services/ticket.service';
import AdminService from '../../services/admin.service';
import AuthService from '../../services/auth.service';
import API from '../../services/api.service';
import EmailService from '../../services/email.service';
import { API_URL } from "../../constants";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import './TicketsPage.css';

const apiUrl = API_URL;

// Helper component to handle async HTML content processing with inline attachments
const MessageHtmlContent = ({ htmlContent, message, selectedDeskId }) => {
  const [processedHtml, setProcessedHtml] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Reference to the processHtmlWithInlineAttachments function from parent component
  // We'll get this function as a prop passed from TicketsPage
  const processContent = async () => {
    if (!htmlContent || !message) {
      setProcessedHtml('');
      setIsLoading(false);
      return;
    }

    try {
      // Get a reference to the parent component's function
      // This is defined below in TicketsPage component
      const result = await window.processHtmlWithInlineAttachments(htmlContent, message, selectedDeskId);
      setProcessedHtml(result);
    } catch (error) {
      console.error('Error processing HTML content with attachments:', error);
      // Fallback to the original content
      setProcessedHtml(htmlContent || '');
    } finally {
      setIsLoading(false);
    }
  };

  // Process content when component mounts or inputs change
  useEffect(() => {
    setIsLoading(true);
    processContent();

    // Cleanup any resources when component unmounts
    return () => {
      // If we had any in-progress operations, we could cancel them here
    };
  }, [htmlContent, message, selectedDeskId]);

  if (isLoading) {
    return <div className="loading-inline-content">Loading content...</div>;
  }

  return <div dangerouslySetInnerHTML={{ __html: processedHtml }} />;
};

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
  const [conversationForTicketId, setConversationForTicketId] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedDeskId, setSelectedDeskId] = useState(null);
  const [desks, setDesks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef(null);
  const selectedTicketRef = useRef(selectedTicket);
  const conversationRef = useRef(conversation);
  const showAllEmailsRef = useRef(showAllEmails);
  const [generalMessagesChannel, setGeneralMessagesChannel] = useState(null);
  const selectedDesk = useMemo(() => desks.find(d => d.id === selectedDeskId), [desks, selectedDeskId]);
  const activeTicketChannelRef = useRef(null);
  const [searchText, setSearchText] = useState('');
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [ticketsPerPage] = useState(10);
  const [showCcDetails, setShowCcDetails] = useState(true);
  const ccContainerRef = useRef(null);

  // CC Management State
  const [threadCcEmails, setThreadCcEmails] = useState(new Set());
  const [replyCcEmails, setReplyCcEmails] = useState(new Set());
  const [ccInput, setCcInput] = useState('');
  //agent name ticket header
  const [assignedAgentName, setAssignedAgentName] = useState('N/A');

  // Handle ticket search functionality
  const handleTicketSearch = (text) => {
    setSearchText(text);
    // Reset to first page when search changes
    setCurrentPage(1);

    if (!text.trim()) {
      // If search is empty, reset filtered results
      setFilteredTickets([]);
      return;
    }

    const searchLower = text.toLowerCase();

    // Filter active data based on current view
    let dataToFilter = emailStatusFilter === 'open' ? tickets : resolvedEmails;

    // Search in tickets by ID, subject, customer name, and message content
    const filtered = dataToFilter.filter(ticket => {
      const ticketId = String(ticket.user_ticket_id || '').toLowerCase();
      const subject = String(ticket.subject || '').toLowerCase();
      const fromName = String(ticket.from_name || ticket.fromName || '').toLowerCase();
      const fromAddress = String(ticket.from_address || '').toLowerCase();
      const preview = String(ticket.preview || '').toLowerCase();

      return ticketId.includes(searchLower) ||
        subject.includes(searchLower) ||
        fromName.includes(searchLower) ||
        fromAddress.includes(searchLower) ||
        preview.includes(searchLower);
    });

    setFilteredTickets(filtered);
  };

  // Utility function to format file size
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

  // Derive ticketId and conversationId from selectedTicket for use in effects and other logic
  const ticketId = selectedTicket?.id;
  const conversationId = selectedTicket?.conversation_id;

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;

    // Clear reply text and attachments when switching between tickets
    setReplyText('');
    setAttachments([]);
  }, [selectedTicket]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    showAllEmailsRef.current = showAllEmails;
  }, [showAllEmails]);
  const [userInfo, setUserInfo] = useState(null);
  const [processedEmailHtml, setProcessedEmailHtml] = useState('');

  // Auto-clear toast messages after 2 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Helper function to find the latest message from a customer
  const getLatestCustomerMessage = (conversation) => {
    if (!conversation || conversation.length === 0) {
      return null;
    }
    // Filter for incoming messages and sort by date to find the latest
    const customerMessages = conversation
      .filter(msg => msg.direction === 'incoming')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return customerMessages.length > 0 ? customerMessages[0] : null;
  };

  // Helper function to process HTML content with inline attachments - now async to handle blob URLs
  const processHtmlWithInlineAttachments = async (htmlContent, message, deskIdOverride) => {
    // Allow override of selectedDeskId for when called from other components
    const deskId = deskIdOverride || selectedDeskId;

    console.log('[InlineProc] DIAGNOSIS - message.attachments_urls:', JSON.stringify(message.attachments_urls, null, 2));
    console.log('[InlineProc] DIAGNOSIS - message.attachments (Graph API):', JSON.stringify(message.attachments, null, 2));

    if (!htmlContent) return '';

    console.log('Processing HTML with inline attachments for message:', message.id);

    // Handle attachments from message - we need to process all potential sources
    const attachments = []; // Final list of attachments to consider for replacement
    const processedContentIds = new Set(); // To track contentIds already added

    // Process attachments from all possible locations, treating those with s3Key as S3 attachments
    // and those without as Microsoft Graph attachments
    const processAttachmentsArray = (sourceArray, sourceName) => {
      if (!sourceArray || !sourceArray.length) return;

      console.log(`[InlineProc] Message has ${sourceArray.length} attachments from ${sourceName}`);

      sourceArray.forEach(att => {
        const rawContentId = att.contentId || '';
        // Only consider attachments that have a contentId
        if (!rawContentId) return;

        // Normalize contentId (remove angle brackets)
        const normalizedContentId = rawContentId.replace(/[<>]/g, '');

        // If we already processed this contentId, skip it
        if (processedContentIds.has(normalizedContentId)) {
          console.log(`[InlineProc] Skipping duplicate contentId ${rawContentId} from ${sourceName}`);
          return;
        }

        // Determine attachment type - if it has s3Key, treat it as an S3 attachment regardless of source
        const isS3Attachment = !!att.s3Key;
        const attachmentType = isS3Attachment ? 's3' : 'microsoft';

        // For inline images, we only want attachments explicitly marked as inline or containing image MIME types
        // If isInline flag exists, use that, otherwise guess based on content type
        const isImage = att.contentType?.startsWith('image/');
        const shouldProcess = att.isInline === true || (isImage && rawContentId);

        if (shouldProcess) {
          console.log(`[InlineProc] Processing ${attachmentType} attachment: ` +
            `Key=${att.s3Key || 'N/A'}, ContentID=${rawContentId}, ` +
            `IsInline=${att.isInline}, Type=${att.contentType}`);

          // Common properties
          const attachment = {
            contentId: rawContentId,
            normalizedContentId: normalizedContentId,
            contentType: att.contentType,
            isInline: true
          };

          // Add type-specific properties
          if (isS3Attachment) {
            attachment.type = 's3';
            attachment.s3Key = att.s3Key;
            attachment.url = att.url;
          } else {
            attachment.type = 'microsoft';
            attachment.id = att.id;
          }

          attachments.push(attachment);
          processedContentIds.add(normalizedContentId);
        } else {
          console.log(`[InlineProc] Skipping attachment with ContentID ${rawContentId} - not inline or not an image`);
        }
      });
    };

    // First try attachments_urls (from Supabase data)
    processAttachmentsArray(message.attachments_urls, 'attachments_urls');

    // Then try attachments (could be from Graph API or could actually have S3 data)
    processAttachmentsArray(message.attachments, 'attachments');

    console.log(`Total identified inline attachments: ${attachments.length}`);

    // If no attachments with contentId, return original content
    if (attachments.length === 0) {
      console.log('No inline attachments to process');
      return htmlContent;
    }

    // Replace cid: URLs with appropriate URLs
    let processedHtml = htmlContent;

    // Look for different types of cid: references
    const cidReferenceRegex = /src=['"](cid:([^'"]*))['"]|src=['"](CID:([^'"]*))['"]|url\(['"](cid:([^'"]*))['"]\)|url\(['"](CID:([^'"]*))['"]\)/gi;

    // Find all CID references in the HTML
    const cidReferences = [];
    let match;
    while ((match = cidReferenceRegex.exec(htmlContent)) !== null) {
      const fullMatch = match[0];
      const rawCidValue = match[2] || match[4] || match[6] || match[8]; // Get the CID value from one of the capture groups
      const cidValue = rawCidValue.replace(/:\d+$/, '');

      if (cidValue) {
        cidReferences.push({
          fullMatch,
          cidValue,
          rawCidValue
        });
        console.log(`Found CID reference: ${cidValue}`);
      }
    }

    // Create a map to store cidValue -> replacementUrl mappings after fetching all attachments
    const cidToUrlMap = new Map();

    // Process all attachments first - prefetch them and create blob URLs
    for (const { cidValue } of cidReferences) {
      // Extract the normalized contentId (without the possible suffix like :1)
      const normalizedCidValue = cidValue.split(':')[0];

      // Find matching attachment
      const matchingAttachment = attachments.find(att => {
        // First try for exact match
        if (att.contentId === cidValue || att.normalizedContentId === cidValue) {
          console.log(`CID Match (Exact): HTML '${cidValue}' == Attachment '${att.contentId}'`);
          return true;
        }

        // Then try matching normalized value without suffix
        if (att.normalizedContentId === normalizedCidValue) {
          console.log(`CID Match (Normalized): HTML '${normalizedCidValue}' == Attachment '${att.normalizedContentId}'`);
          return true;
        }

        // Finally, try matching just the 'local part' before ':' or '@'
        if (cidValue.includes(':') || cidValue.includes('@')) {
          const localPartOfHtmlCid = cidValue.split(/[:@]/)[0];
          const attachmentNormalizedCid = att.normalizedContentId.split(/[:@]/)[0];

          if (attachmentNormalizedCid === localPartOfHtmlCid) {
            console.log(`CID Match (Attachment Local Part): Attachment '${attachmentNormalizedCid}' == Local part of HTML '${cidValue}'`);
            return true;
          }
        }

        return false;
      });

      if (matchingAttachment) {
        console.log(`Found matching attachment for cid:${cidValue}`);
        let replacementUrl = '';

        try {
          // Check for S3 attachment first (preferred)
          if (matchingAttachment.s3Key) {
            // For S3 attachments with s3Key, use the EmailService to fetch with authentication
            console.log(`Downloading S3 attachment with key: ${matchingAttachment.s3Key}`);
            const blob = await EmailService.downloadS3Attachment(matchingAttachment.s3Key, deskId);

            // Create a blob URL that can be used in the img src
            replacementUrl = URL.createObjectURL(blob);
            console.log(`Generated blob URL for attachment: ${replacementUrl}`);
          } else if (matchingAttachment.url && matchingAttachment.type === 's3') {
            // For S3 attachments with direct URL - we still need to fetch with auth
            const urlParams = new URLSearchParams(matchingAttachment.url.split('?')[1] || '');
            const s3KeyFromUrl = urlParams.get('s3Key');

            if (s3KeyFromUrl) {
              const blob = await EmailService.downloadS3Attachment(s3KeyFromUrl, deskId);
              replacementUrl = URL.createObjectURL(blob);
              console.log(`Generated blob URL from URL param s3Key: ${replacementUrl}`);
            } else {
              // Fallback to direct URL (may not work due to CORS/auth)
              replacementUrl = matchingAttachment.url;
              console.log(`Using direct attachment URL (may fail): ${replacementUrl}`);
            }
          } else if (matchingAttachment.type === 'microsoft' && message.id && matchingAttachment.id) {
            // For Microsoft attachments, we also need to fetch with auth
            try {
              const response = await fetch(`/api/emails/${message.id}/attachments/${matchingAttachment.id}`, {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('token')}`
                }
              });
              if (response.ok) {
                const blob = await response.blob();
                replacementUrl = URL.createObjectURL(blob);
                console.log(`Generated blob URL from Microsoft attachment: ${replacementUrl}`);
              } else {
                console.error('Error fetching Microsoft attachment:', response.status);
              }
            } catch (error) {
              console.error('Error fetching Microsoft attachment:', error);
            }
          }
        } catch (error) {
          console.error(`Error processing attachment for HTML (cid:${cidValue}):`, error);
        }

        // Store the replacement URL in our map if we got one
        if (replacementUrl) {
          cidToUrlMap.set(cidValue, replacementUrl);
        }
      } else {
        console.log(`No matching attachment found for cid:${cidValue}`);
      }
    }

    // Now that we've fetched all attachments and created blob URLs, 
    // replace the CID references in the HTML with the blob URLs
    let updatedHtmlContent = htmlContent;

    // Process each CID reference and replace with blob URL if available
    for (const { cidValue } of cidReferences) {
      const replacementUrl = cidToUrlMap.get(cidValue);
      if (replacementUrl) {
        const encodedCid = cidValue.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'); // Escape regex special chars
        const regex = new RegExp(`src=["']cid:${encodedCid}["']`, 'gi');
        updatedHtmlContent = updatedHtmlContent.replace(regex, `src="${replacementUrl}"`); // IMPORTANT: Use double quotes for consistency
        console.log(`Replaced HTML cid '${cidValue}' with ${replacementUrl}`);
      } else {
        console.log(`No valid URL generated for cid:${cidValue}, leaving as is`);
      }
    }

    console.log('HTML processing complete');
    return updatedHtmlContent;
  };

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

  // Helper function for consistent date formatting across the component
  const formatDisplayDate = (dateValue) => {
    if (!dateValue) return 'Unknown time';
    try {
      // Try to create a valid date object
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'Unknown time';

      // Format based on whether it's today or another day
      const now = new Date();
      const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch (e) {
      console.warn('Error formatting date:', dateValue, e);
      return 'Unknown time';
    }
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
  // Effect to handle desk fetching - runs only when userInfo changes
  useEffect(() => {
    if (!userInfo) return;

    console.log('[TicketsPage] Desk fetching useEffect - userInfo.id:', userInfo?.id);

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

  // Reset search and pagination when email status filter changes
  useEffect(() => {
    if (searchText.trim()) {
      setSearchText('');
      setFilteredTickets([]);
    }
    setCurrentPage(1);
  }, [emailStatusFilter]);

  // Effect for when selectedDeskId changes - fetch tickets and emails
  useEffect(() => {
    // Clear search when desk changes
    if (searchText.trim()) {
      setSearchText('');
      setFilteredTickets([]);
    }
    // Reset to first page when desk changes
    setCurrentPage(1);
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
        // Fetch open tickets and closed tickets in parallel
        const promises = [];

        // Fetch open tickets
        promises.push(
          TicketService.getTicketsByStatus(selectedDeskId, 'open')
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) {
                setTickets(data);
                console.log('Initial open tickets loaded:', data?.length || 0);
              }
            })
            .catch(err => console.error('Error loading initial open tickets:', err))
        );

        // Fetch closed tickets
        promises.push(
          TicketService.getTicketsByStatus(selectedDeskId, 'closed')
            .then(data => {
              if (!isMounted) return;
              if (Array.isArray(data)) {
                setResolvedEmails(data); // Using resolvedEmails state for closed tickets
                console.log('Initial closed tickets loaded:', data?.length || 0);
              }
            })
            .catch(err => console.error('Error loading initial closed tickets:', err))
        );

        // We'll fetch unread tickets later once we have Supabase integration for message count tracking
        // For now, we'll assume all tickets with recent messages are "unread"

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
  const fetchTickets = useCallback(async () => {
    if (!selectedDeskId) return;

    try {
      setLoading(true);
      // Fetch open tickets by default
      const openTickets = await TicketService.getTicketsByStatus(selectedDeskId, 'open');

      if (Array.isArray(openTickets)) {
        setTickets(openTickets);
        console.log('Refreshed open tickets:', openTickets.length);
      }

      // Fetch closed tickets if needed (based on current view)
      if (emailStatusFilter === 'closed') {
        const closedTickets = await TicketService.getTicketsByStatus(selectedDeskId, 'closed');
        if (Array.isArray(closedTickets)) {
          setResolvedEmails(closedTickets);
          console.log('Refreshed closed tickets:', closedTickets.length);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setLoading(false);
      // Keep previous tickets state on error
    }
  }, [selectedDeskId, emailStatusFilter]);

  // Fetch unread emails based on desk ID
  const fetchUnreadEmails = async () => {
    if (!selectedDeskId) return;

    // ...
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
      // Use TicketService to get closed tickets instead of emails
      const closedTicketsData = await TicketService.getTicketsByStatus(selectedDeskId, 'closed');
      console.log('Closed tickets data:', closedTicketsData);
      // Only update if we got valid data
      if (Array.isArray(closedTicketsData)) {
        setResolvedEmails(closedTicketsData);
      } else {
        console.warn('Invalid closed tickets data received:', closedTicketsData);
        // Keep previous state
      }
    } catch (err) {
      console.error('Error fetching closed emails:', err);
      // Keep previous resolved emails state on error
    }

    // Fetch unread emails
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

  // Helper function to sort messages consistently across the app
  const sortMessages = (messagesToSort) => {
    if (!Array.isArray(messagesToSort)) return [];
    return [...messagesToSort].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) :
        new Date(a.sent_at || a.sentDateTime || a.receivedDateTime || 0);
      const dateB = b.created_at ? new Date(b.created_at) :
        new Date(b.sent_at || b.sentDateTime || b.receivedDateTime || 0);
      const timeDiff = Math.abs(dateA - dateB);
      if (timeDiff < 1000 && a.id && b.id) {
        return String(a.id).localeCompare(String(b.id)); // Ensure IDs are strings for localeCompare
      }
      return dateA - dateB;
    });
  };

  // Helper function to update any ticket list with new messages
  const updateTicketsListWithNewMessage = useCallback((ticketList, idToMatch, newMessage, useTicketId) => {
    if (!ticketList || !Array.isArray(ticketList)) return ticketList;

    return ticketList.map(ticket => {
      let isMatch = false;
      if (useTicketId) {
        isMatch = ticket.id === idToMatch;
      } else { // Match by Microsoft Conversation ID
        isMatch = ticket.microsoft_conversation_id === idToMatch || ticket.conversation_id === idToMatch; // conversation_id for legacy email tickets
      }

      if (isMatch) {
        const messageExists = ticket.messages && ticket.messages.some(msg => msg.id === newMessage.id || (newMessage.temp_id && msg.id === newMessage.temp_id));
        if (!messageExists) {
          const updatedMessages = sortMessages([...(ticket.messages || []), newMessage]); // Use hoisted sortMessages

          return {
            ...ticket,
            messages: updatedMessages,
            bodyPreview: newMessage.bodyPreview || ticket.bodyPreview, // Update preview with the latest message
            last_message_sent_at: newMessage.sentDateTime || newMessage.receivedDateTime || ticket.last_message_sent_at, // Update last message time
            message_count: (ticket.message_count || 0) + 1, // Increment message count
            // last_activity_at: newMessage.sentDateTime || newMessage.receivedDateTime || new Date().toISOString(), // Also update general last_activity_at
            // status: (ticket.status === 'closed' && newMessage.direction === 'incoming') ? 'reopened' : ticket.status, // Example: Reopen ticket on new customer message
          };
        }
      }
      return ticket;
    });
  }, [sortMessages]); // Dependency for useCallback

  // Handlers for Supabase Realtime events (moved up to fix initialization errors)
  const handleNewReply = useCallback((newReplyMessage) => {
    console.log('[Supabase Realtime] handleNewReply: Processing new message:', newReplyMessage);

    const formattedMessage = {
      ...newReplyMessage,
      body: {
        contentType: 'HTML',
        content: newReplyMessage.body_html || newReplyMessage.body_preview || ''
      },
      bodyPreview: newReplyMessage.body_preview,
      fromName: newReplyMessage.from_name || 'Unknown',
      sentDateTime: newReplyMessage.sent_at,
      receivedDateTime: newReplyMessage.received_at || newReplyMessage.created_at
    };

    const msgMicrosoftConversationId = newReplyMessage.microsoft_conversation_id;
    const msgTicketId = formattedMessage.ticket_id;

    // Update the displayed conversation if the message belongs to the selected ticket
    const currentSelectedTicket = selectedTicketRef.current;
    let messageBelongsToCurrentSelectedTicket = false;
    if (currentSelectedTicket) {
      if (msgTicketId && currentSelectedTicket.id === msgTicketId) {
        messageBelongsToCurrentSelectedTicket = true;
      } else if (msgMicrosoftConversationId && currentSelectedTicket.microsoft_conversation_id === msgMicrosoftConversationId) {
        messageBelongsToCurrentSelectedTicket = true;
      } else if (msgMicrosoftConversationId && currentSelectedTicket.conversation_id === msgMicrosoftConversationId) { // Legacy check for older data structure
        messageBelongsToCurrentSelectedTicket = true;
      }
    }

    if (messageBelongsToCurrentSelectedTicket) {
      // console.log('------->prev conv is ----->',conversation); // Optional log
      setConversation(prevConversation => {
        if (!prevConversation) prevConversation = [];
        const exists = prevConversation.some(msg =>
          msg.id === formattedMessage.id ||
          (formattedMessage.temp_id && msg.id === formattedMessage.temp_id) // Check temp_id if it exists for optimistic updates
        );
        if (!exists) {
          const updatedConvo = [...prevConversation, formattedMessage];
          return sortMessages(updatedConvo); // USE HOISTED sortMessages
        }
        return prevConversation;
      });

      setSelectedTicket(prevTicket => {
        if (!prevTicket) return null;
        const messages = prevTicket.messages || [];
        const existsInTicketMessages = messages.some(msg => msg.id === formattedMessage.id);
        if (!existsInTicketMessages) {
          const updatedMessages = sortMessages([...messages, formattedMessage]); // USE HOISTED sortMessages
          return {
            ...prevTicket,
            messages: updatedMessages,
            // Optionally update last_message_sent_at and message_count here if backend doesn't send ticket update event rapidly
            // last_message_sent_at: formattedMessage.sentDateTime || formattedMessage.receivedDateTime,
            // message_count: (prevTicket.message_count || 0) + 1, 
          };
        }
        return prevTicket;
      });
    }

    // Always update the main ticket lists (for badges, counts, etc.)
    // updateTicketsListWithNewMessage needs to be robust to handle matching by either ID
    if (msgTicketId) { // Prioritize ticket_id if available
      setTickets(prevTickets => updateTicketsListWithNewMessage(prevTickets, msgTicketId, formattedMessage, true)); // true for useTicketId
      setAllEmails(prevEmails => updateTicketsListWithNewMessage(prevEmails, msgTicketId, formattedMessage, true));
      if (formattedMessage.direction === 'incoming' && !formattedMessage.is_read) {
        setUnreadEmails(prevUnread => updateTicketsListWithNewMessage(prevUnread, msgTicketId, formattedMessage, true));
      }
    } else if (msgMicrosoftConversationId) { // Fallback to Microsoft Conversation ID
      setTickets(prevTickets => updateTicketsListWithNewMessage(prevTickets, msgMicrosoftConversationId, formattedMessage, false)); // false for useConversationId
      setAllEmails(prevEmails => updateTicketsListWithNewMessage(prevEmails, msgMicrosoftConversationId, formattedMessage, false));
      if (formattedMessage.direction === 'incoming' && !formattedMessage.is_read) {
        setUnreadEmails(prevUnread => updateTicketsListWithNewMessage(prevUnread, msgMicrosoftConversationId, formattedMessage, false));
      }
    } else {
      console.warn('[Supabase Realtime] handleNewReply: Message has neither ticket_id nor microsoft_conversation_id. Cannot update ticket lists effectively.', formattedMessage);
    }

  }, [
    conversation, // For console.log. Remove if log is removed and no longer needed for debugging.
    setConversation,
    selectedTicketRef,
    setSelectedTicket,
    setTickets,
    setAllEmails,
    setUnreadEmails,
    updateTicketsListWithNewMessage, // This function must be stable (defined outside component or memoized with its own deps)
    sortMessages // Hoisted and stable
  ]);

  const handleNewTicket = useCallback((newTicketPayload) => {
    // newTicketPayload is the raw data from Supabase for an insert on the 'tickets' table
    console.log('[DEBUG] handleNewTicket CALLED. Raw newTicket payload:', JSON.stringify(newTicketPayload, null, 2));

    // Basic validation: ensure this is for the 'tickets' table and has a proper ticket ID
    if (!newTicketPayload.id || typeof newTicketPayload.id !== 'string' || newTicketPayload.id.startsWith('email-')) {
      console.warn('[Supabase Realtime] handleNewTicket received payload without a valid ticket ID or invalid format. Ignoring:', newTicketPayload);
      return;
    }

    // Immediately add a placeholder ticket with loading state
    const initialTicketData = {
      id: newTicketPayload.id,
      subject: newTicketPayload.subject || 'No Subject',
      status: 'new', // Force status to 'new' for all incoming tickets to show the New badge
      created_at: newTicketPayload.created_at || new Date().toISOString(),
      last_message_at: newTicketPayload.last_message_at || newTicketPayload.created_at || new Date().toISOString(),
      conversation_id: newTicketPayload.conversation_id,
      from_name: newTicketPayload.from_name || 'Loading...',
      from_address: newTicketPayload.from_address,
      user_ticket_id: newTicketPayload.user_ticket_id, // Include the user_ticket_id for display
      message_count: 1, // Set initial message count to 1 to ensure New badge shows
      isLoading: true // Mark as loading until we fetch complete data
    };

    console.log('[Supabase Realtime] Adding placeholder for new ticket:', initialTicketData.id);

    // Add placeholder to ticket list
    setTickets(prevTickets => {
      if (prevTickets.some(t => t.id === initialTicketData.id)) return prevTickets;
      return [initialTicketData, ...prevTickets];
    });

    // Fetch complete ticket details including first message for preview
    const fetchCompleteTicketDetails = async () => {
      try {
        console.log(`[Supabase Realtime] Fetching complete details for ticket ${newTicketPayload.id}`);
        // Get full ticket data
        const ticketDetails = await TicketService.getTicketById(newTicketPayload.id);
        if (!ticketDetails) {
          console.error(`[Supabase Realtime] Failed to fetch details for ticket ${newTicketPayload.id}`);
          return;
        }

        console.log('[Supabase Realtime] Got complete ticket details:', ticketDetails);

        // Now get the first/latest message for this ticket to show as preview
        let preview = '';
        let firstMessage = null;

        try {
          // Attempt to get messages for this ticket
          const messages = await TicketService.getTicketMessages(newTicketPayload.id, newTicketPayload.conversation_id);
          //console.log("Hello the messages are -----------> messages", messages);
          if (messages && messages.length > 0) {
            firstMessage = messages[0]; // Assuming messages are sorted with newest first
            preview = firstMessage.body_preview || firstMessage.body_text || '';
            console.log('[Supabase Realtime] Got first message preview:', preview.substring(0, 50) + '...');
          }
        } catch (msgErr) {
          console.warn('[Supabase Realtime] Error fetching messages for preview:', msgErr);
          // Continue anyway - we'll just show the ticket without message preview
        }

        // Construct complete ticket object with all available data
        const completeTicket = {
          ...ticketDetails,
          preview: preview,
          description: firstMessage?.body_text || ticketDetails.description || '',
          from_name: ticketDetails.from_name || newTicketPayload.from_name || 'Unknown',
          customer_name: ticketDetails.customer_name || ticketDetails.from_name,
          customer_email: ticketDetails.from_address || ticketDetails.customer_email,
          // Make sure user_ticket_id is preserved from ticketDetails or newTicketPayload
          user_ticket_id: ticketDetails.user_ticket_id || newTicketPayload.user_ticket_id,
          status: 'new', // Force status to 'new' to ensure the New badge shows
          message_count: 1, // Ensure message_count is at least 1 to show New badge
          isLoading: false, // No longer loading
          hasCompleteData: true // Flag to indicate we have complete data
        };

        // Update ticket in state with complete data
        setTickets(prevTickets => {
          // Find the existing ticket to preserve its 'new' status if it was just created
          const existingTicket = prevTickets.find(t => t.id === completeTicket.id);
          const updatedTicket = {
            ...completeTicket,
            // Preserve the 'new' status if the ticket was just created
            status: existingTicket?.status === 'new' ? 'new' : completeTicket.status,
            // Ensure message_count is at least 1 to show New badge
            message_count: Math.max(completeTicket.message_count || 0, 1)
          };
          
          const updatedTickets = prevTickets.map(t =>
            t.id === updatedTicket.id ? updatedTicket : t
          );
          return updatedTickets.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
        });
      } catch (error) {
        console.error(`[Supabase Realtime] Error fetching complete details for ticket ${newTicketPayload.id}:`, error);
      }
    };

    // Execute the fetch asynchronously
    fetchCompleteTicketDetails();

    // If you have separate 'unread' counts or lists that are not just filtered views of 'tickets',
    // you might need additional logic here. For now, focusing on correcting the main 'tickets' list.
    // Example: if a new ticket from an email source should also appear in an 'unread emails' type of view
    // if (ticketToAdd.isEmail && ticketToAdd.status === 'new') {
    //   setUnreadEmails(prev => [ticketToAdd, ...prev.filter(t => t.id !== ticketToAdd.id)]);
    // }

  }, [setTickets]);

  const handleUpdatedTicket = useCallback(async (updatedTicket, oldTicket) => {
    console.log('[DEBUG] handleUpdatedTicket CALLED. Raw updatedTicket payload:', JSON.stringify(updatedTicket, null, 2), 'Raw oldTicket payload:', JSON.stringify(oldTicket, null, 2));
    console.log('[Supabase Realtime] Ticket updated:', { old: oldTicket, new: updatedTicket });
    const conversationId = updatedTicket.conversation_id;

    if (updatedTicket.status === 'closed' && oldTicket.status !== 'closed') {
      console.log('[Supabase Realtime] Ticket status changed to closed:', conversationId);

      setAllEmails(prev => prev.filter(t => t.id !== conversationId));
      setUnreadEmails(prev => prev.filter(t => t.id !== conversationId));

      const deskId = updatedTicket.desk_id || selectedDeskId;
      if (deskId) {
        EmailService.fetchEmails(deskId, 'closed')
          .then(closedEmailsData => {
            const closedConversation = closedEmailsData.find(conv => conv.id === conversationId);
            if (closedConversation) {
              setResolvedEmails(prev => [closedConversation, ...prev.filter(t => t.id !== conversationId)]);
            } else {
              console.warn(`Closed conversation ${conversationId} not found in fetch results.`);
              const fallbackTicket = { ...updatedTicket, id: conversationId, conversationId: conversationId, messages: [] };
              setResolvedEmails(prev => [fallbackTicket, ...prev.filter(t => t.id !== conversationId)]);
            }
          })
          .catch(error => {
            console.error('Error fetching closed emails:', error);
          });
      }
    } else {
      const updateList = (list) => {
        return list.map(ticket => {
          if (ticket.id === conversationId) {
            return {
              ...ticket,
              subject: updatedTicket.subject,
              is_read: !updatedTicket.has_unread,
            };
          }
          return ticket;
        });
      };
      setAllEmails(updateList);
      if (updatedTicket.has_unread) {
        setUnreadEmails(prev => {
          const existing = prev.find(t => t.id === conversationId);
          if (existing) {
            return updateList(prev);
          } else {
            const updated = allEmails.find(t => t.id === conversationId);
            return updated ? [updated, ...prev] : prev;
          }
        });
      } else {
        setUnreadEmails(prev => prev.filter(t => t.id !== conversationId));
      }
    }
  }, [selectedDeskId, allEmails, setAllEmails, setUnreadEmails, setResolvedEmails]);

  const handleNewMessage = useCallback((newMessage) => {
    console.log('[Supabase Realtime] New message received:', newMessage);
    const conversationId = newMessage.microsoft_conversation_id;

    if (!conversationId) {
      console.warn('[Supabase Realtime] New message without a conversation ID, cannot process.', newMessage);
      return;
    }

    const updateList = (list) => {
      const ticketIndex = list.findIndex(t => t.id === conversationId);
      if (ticketIndex === -1) return list;

      const updatedTicket = {
        ...list[ticketIndex],
        bodyPreview: newMessage.body_preview || '',
        last_message_at: newMessage.created_at,
        is_read: newMessage.direction === 'outgoing',
        direction: newMessage.direction,
      };

      const newList = [...list];
      newList.splice(ticketIndex, 1);
      newList.unshift(updatedTicket);
      return newList;
    };

    setAllEmails(updateList);
    if (newMessage.direction === 'incoming') {
      setUnreadEmails(updateList);
    }

    if (selectedTicketRef.current && selectedTicketRef.current.id === conversationId) {
      handleNewReply(newMessage);
    }
  }, [setAllEmails, setUnreadEmails, handleNewReply]);

  const handleUpdatedMessageInConversation = useCallback((updatedMessage) => {
    setConversation(prev => {
      if (!prev) return null;
      // Find and replace the updated message in the conversation list
      return prev.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg);
    });
  }, []); // setConversation is stable and doesn't need to be in deps array

  // Refs for stable handlers
  const handleNewTicketRef = useRef(handleNewTicket);
  const handleUpdatedTicketRef = useRef(handleUpdatedTicket);
  const handleNewMessageRef = useRef(handleNewMessage);
  const handleNewReplyRef = useRef(handleNewReply);
  const handleUpdatedMessageInConversationRef = useRef(handleUpdatedMessageInConversation);

  useEffect(() => {
    handleNewTicketRef.current = handleNewTicket;
  }, [handleNewTicket]);

  useEffect(() => {
    handleUpdatedTicketRef.current = handleUpdatedTicket;
  }, [handleUpdatedTicket]);

  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
  }, [handleNewMessage]);

  useEffect(() => {
    handleNewReplyRef.current = handleNewReply;
  }, [handleNewReply]);

  useEffect(() => {
    handleUpdatedMessageInConversationRef.current = handleUpdatedMessageInConversation;
  }, [handleUpdatedMessageInConversation]);

  // Setup the general messages channel
  useEffect(() => {
    if (!selectedDeskId || !supabase) {
      // If there's an active general messages channel, remove it as we no longer have a selectedDeskId
      if (generalMessagesChannel) {
        console.log(`[Supabase Realtime] No selectedDeskId, cleaning up existing desk channel: ${generalMessagesChannel.topic}`);
        supabase.removeChannel(generalMessagesChannel);
        setGeneralMessagesChannel(null);
      }
      return;
    }

    const channelName = `desk_changes_${selectedDeskId.replace(/-/g, '_')}`;

    // If a channel for a *different* desk exists, or if the current channel is not joined, clean it up.
    if (generalMessagesChannel) {
      if (generalMessagesChannel.topic !== channelName || generalMessagesChannel.state !== 'joined') {
        console.log(`[Supabase Realtime] Cleaning up old/stale desk channel: ${generalMessagesChannel.topic}`);
        supabase.removeChannel(generalMessagesChannel);
        setGeneralMessagesChannel(null); // Ensure we attempt to create a new one
      } else {
        // Channel for current deskId already exists and is joined, do nothing
        console.log(`[Supabase Realtime] Desk channel ${channelName} already exists and is joined.`);
        return;
      }
    }

    console.log(`[Supabase Realtime] Setting up new desk channel: ${channelName}`);
    const newDeskChannel = supabase
      .channel(channelName)
      // Listen for new tickets created in this desk
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets', filter: `desk_id=eq.${selectedDeskId}` }, payload => {
        console.log('[Supabase Realtime] Received new ticket:', payload);
        if (payload.new) handleNewTicketRef.current(payload.new);
        if (payload.new) {
          console.log("------> Received new ticket via Realtime:", payload.new);
          // Acknowledgment is now handled by the backend
          console.log("Acknowledgment will be handled by the backend service");
        }
      })
      // Listen for ticket status updates or other changes
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `desk_id=eq.${selectedDeskId}` }, payload => {
        console.log('[Supabase Realtime] Received ticket update:', payload);
        if (payload.new && payload.old) handleUpdatedTicketRef.current(payload.new, payload.old);
      })
      // For compatibility, still listen to message inserts at desk level
      // This is secondary; primary message handling is via ticket-specific channel when a ticket is selected.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `desk_id=eq.${selectedDeskId}` }, payload => {
        console.log('[Supabase Realtime] Received new message at desk level:', payload);
        if (payload.new) {
          const newMessage = payload.new;
          handleNewMessageRef.current(newMessage); // General handler for new messages on the desk

          // If this message belongs to the *currently selected ticket*, also update its conversation view.
          // Check selectedTicketRef.current as selectedTicket state might be stale in this callback scope.
          if (selectedTicketRef.current &&
            ((newMessage.ticket_id && newMessage.ticket_id === selectedTicketRef.current.id) ||
              (newMessage.microsoft_conversation_id && newMessage.microsoft_conversation_id === selectedTicketRef.current.conversation_id))) {
            handleNewReplyRef.current(newMessage);
          }
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Supabase Realtime] Successfully subscribed to desk channel: ${channelName}`);
          setGeneralMessagesChannel(newDeskChannel);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error(`[Supabase Realtime] Channel error on ${channelName}:`, err);
          // If the channel we tried to subscribe to is still the one in state, nullify it to allow re-attempt
          if (generalMessagesChannel && generalMessagesChannel.topic === channelName) {
            setGeneralMessagesChannel(null);
          }
        }
      }); // End of .subscribe()

    // Cleanup function for the desk-level channel
    return () => {
      console.log(`[Supabase Realtime] Cleaning up desk channel: ${newDeskChannel.topic} due to unmount or selectedDeskId change.`);
      supabase.removeChannel(newDeskChannel);
      if (generalMessagesChannel && generalMessagesChannel.topic === newDeskChannel.topic) {
        setGeneralMessagesChannel(null);
      }
    };
  }, [selectedDeskId, selectedDesk, supabase, handleNewTicketRef, handleUpdatedTicketRef, handleNewMessageRef, handleNewReplyRef, selectedTicketRef]); // End of desk-level useEffect

  // Define commonMessageHandler with useCallback to ensure it's stable
  const commonMessageHandler = useCallback((payload, eventType) => {
    try {
      // console.log(`[Supabase Realtime] Ticket-Specific ${eventType} for ${payload.new.ticket_id ? 'ticket' : 'conversation'}:`, payload);
      if (payload && payload.new) {
        if (eventType === 'INSERT') {
          handleNewReplyRef.current(payload.new);
        } else if (eventType === 'UPDATE') {
          // Ensure you have a handler for updated messages in the conversation
          if (handleUpdatedMessageInConversationRef.current) {
            handleUpdatedMessageInConversationRef.current(payload.new);
          } else {
            // Fallback if no specific update handler exists
            handleNewReplyRef.current(payload.new);
          }
        }
      }
    } catch (error) {
      console.error(`[Supabase Realtime] Error handling ticket-specific ${eventType} message:`, error);
    }
  }, [handleNewReplyRef, handleUpdatedMessageInConversationRef]);

  // Ref to prevent multiple concurrent initialization attempts
  const ticketInitInProgressRef = useRef(false);
  // Throttled ticket ID to prevent rapid switching
  const [delayedTicketId, setDelayedTicketId] = useState(ticketId);

  // Throttle ticket switching to prevent channel setup flood
  useEffect(() => {
    // Use a longer delay to ensure previous channel cleanup completes
    const id = setTimeout(() => setDelayedTicketId(ticketId), 500);
    return () => clearTimeout(id);
  }, [ticketId]);

  // Supabase Realtime subscription for ticket-specific messages
  useEffect(() => {
    // Use the async IIFE pattern to allow await inside useEffect
    const setupTicketChannel = async () => {
      // Guard condition: No ticket, no client
      if (!delayedTicketId || !supabase) {
        // If there's an existing channel, remove it as we no longer have a ticketId or supabase client
        if (activeTicketChannelRef.current) {
          console.log(`[Supabase Realtime] No ticketId/supabase, cleaning up existing ticket channel: ${activeTicketChannelRef.current.topic}`);
          await supabase?.removeChannel(activeTicketChannelRef.current); // Use optional chaining and await
          activeTicketChannelRef.current = null;
        }
        return;
      }

      // Guard against concurrent setup attempts
      if (ticketInitInProgressRef.current) {
        console.log(`[Supabase Realtime] Setup already in progress for another ticket, skipping.`);
        return;
      }

      try {
        ticketInitInProgressRef.current = true; // Set lock

        // Use a consistent, collision-resistant naming scheme (raw UUID is preferred if available)
        const channelName = `ticket_channel_${delayedTicketId}`;

        // 1. Clean up previous channel if it exists - always do this when setting up a new channel
        // This ensures we don't have stale channels or multiple channels for the same ticket
        if (activeTicketChannelRef.current) {
          console.log(`[Supabase Realtime] Cleaning up previous ticket channel: ${activeTicketChannelRef.current.topic}`);
          try {
            await supabase.removeChannel(activeTicketChannelRef.current);
          } catch (cleanupError) {
            console.error(`[Supabase Realtime] Error removing previous channel:`, cleanupError);
          } finally {
            // Always null the ref even if removal had an error
            activeTicketChannelRef.current = null;
          }

          // Add a small delay to ensure the channel is properly cleaned up before creating a new one
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 2. If a channel for the current ticket already exists and is joined/joining, do nothing further.
        if (activeTicketChannelRef.current && activeTicketChannelRef.current.topic === channelName &&
          (activeTicketChannelRef.current.state === 'joined' || activeTicketChannelRef.current.state === 'joining')) {
          console.log(`[Supabase Realtime] Channel ${channelName} already exists and is ${activeTicketChannelRef.current.state}.`);
          return;
        }

        // 3. If a channel for this topic exists but was in a bad state (e.g., timed_out, errored, closed), ensure it's removed before creating a new one.
        if (activeTicketChannelRef.current && activeTicketChannelRef.current.topic === channelName) {
          console.log(`[Supabase Realtime] Stale channel ${channelName} found (state: ${activeTicketChannelRef.current.state}), removing to re-establish.`);
          await supabase.removeChannel(activeTicketChannelRef.current); // Added await
          activeTicketChannelRef.current = null;
        }

        console.log(`[Supabase Realtime] Setting up new ticket-specific channel: ${channelName} for ticket ID: ${delayedTicketId}`);
        // Use a more unique channel name to avoid conflicts, including a timestamp
        const uniqueChannelName = `ticket_channel_${delayedTicketId}_${Date.now()}`;
        console.log(`[Supabase Realtime] Creating unique channel: ${uniqueChannelName}`);
        const newTicketChannel = supabase.channel(uniqueChannelName);

        // Attach listeners using the memoized commonMessageHandler
        newTicketChannel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `ticket_id=eq.${delayedTicketId}` },
          (payload) => commonMessageHandler(payload, 'INSERT')
        );
        newTicketChannel.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `ticket_id=eq.${delayedTicketId}` },
          (payload) => commonMessageHandler(payload, 'UPDATE')
        );

        // If there's a conversation ID (for legacy email tickets), also listen to messages linked to that conversation ID
        if (conversationId) {
          console.log(`[Supabase Realtime] Also setting up listeners for microsoft_conversation_id=${conversationId} on channel ${channelName}`);
          newTicketChannel.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `microsoft_conversation_id=eq.${conversationId}` },
            (payload) => commonMessageHandler(payload, 'INSERT')
          );
          newTicketChannel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `microsoft_conversation_id=eq.${conversationId}` },
            (payload) => commonMessageHandler(payload, 'UPDATE')
          );
        }

        newTicketChannel
          .on('error', (error) => {
            console.error(`[Supabase Realtime] Ticket channel ${channelName} error:`, error);
          })
          .on('closed', () => {
            console.warn(`[Supabase Realtime] Ticket channel ${channelName} was closed.`);
          })
          .subscribe(status => {
            console.log(`[Supabase Realtime] Ticket channel (${uniqueChannelName}) subscription status: ${status}`);

            if (status === 'SUBSCRIBED') {
              console.log(`[Supabase Realtime] Successfully subscribed to ${uniqueChannelName}`);
              // Only set the ref if this isn't a stale subscription (check if deps changed during subscription)
              if (delayedTicketId === ticketId) {
                activeTicketChannelRef.current = newTicketChannel;
              } else {
                console.log(`[Supabase Realtime] Ticket changed during subscription process, cleaning up this channel`);
                // We've already switched tickets, so clean up this channel
                supabase.removeChannel(newTicketChannel).catch(err =>
                  console.error('[Supabase Realtime] Error removing stale channel:', err)
                );
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.error(`[Supabase Realtime] Subscription to ${uniqueChannelName} failed with status: ${status}`);

              // If this specific channel instance failed, nullify the ref to allow re-subscription
              if (activeTicketChannelRef.current && activeTicketChannelRef.current.topic === newTicketChannel.topic) {
                activeTicketChannelRef.current = null;

                // Add a retry mechanism after timeout with exponential backoff
                if (status === 'TIMED_OUT' && delayedTicketId === ticketId) {
                  const retryDelay = Math.random() * 1000 + 500; // Random delay between 500-1500ms
                  console.log(`[Supabase Realtime] Will retry subscription in ${retryDelay}ms`);
                  setTimeout(() => {
                    if (delayedTicketId === ticketId) { // Only retry if we're still on the same ticket
                      console.log('[Supabase Realtime] Retrying channel subscription after timeout');
                      ticketInitInProgressRef.current = false; // Reset lock to allow retry
                      setupTicketChannel(); // Retry setup
                    }
                  }, retryDelay);
                }
              }
            }
          });
      } catch (error) {
        console.error('[Supabase Realtime] Error setting up ticket channel:', error);
      } finally {
        // Always release the lock, even if there was an error
        ticketInitInProgressRef.current = false;
      }
    };

    // Start the async setup process
    setupTicketChannel();

    // Return cleanup function for this effect run
    return () => {
      if (activeTicketChannelRef.current) {
        console.log(`[Supabase Realtime] Cleaning up ticket channel: ${activeTicketChannelRef.current.topic} (unmount or deps change)`);
        // We don't await here since this is running during cleanup
        try {
          supabase.removeChannel(activeTicketChannelRef.current);
        } catch (error) {
          console.error('[Supabase Realtime] Error while cleaning up channel:', error);
        } finally {
          // Always ensure the ref is cleared even if removal fails
          activeTicketChannelRef.current = null;
        }
      }
    };
  }, [supabase, delayedTicketId, conversationId, commonMessageHandler]); // Using delayedTicketId instead of ticketId

  // Create a fetchConversationData function that can be called both initially and for auto-refresh
  // Use a ref to track if we've just sent a reply and need to force refresh
  const justSentReply = useRef(false);

  // Function to refresh email conversation after reply
  const refreshEmailConversation = useCallback(async (emailId, deskId, replyContent) => {
    try {
      console.log('Refreshing email conversation after reply, email ID:', emailId);

      // First, try to get any new conversation data from the server
      console.log(`[refreshEmailConversation] Fetching conversation for ID: ${emailId}, Desk ID: ${deskId}`);
      // Ensure 'emailId' here is treated as a conversation_id for this endpoint.
      // The backend route is /api/emails/conversation/:ticketId
      // The desk_id query param is not strictly used by the current backend fetchConversation but sending it for consistency.
      const response = await API.get(`/emails/conversation/${emailId}?desk_id=${encodeURIComponent(deskId)}`);

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

  const fetchConversationData = useCallback(async (ticket) => {
    if (!ticket) return;

    // Helper to format messages consistently
    const formatMessages = (messages) => {
      if (!Array.isArray(messages)) return [];
      const formattedMsgs = messages.map((msg) => ({
        ...msg,
        body: { contentType: 'HTML', content: msg.body_html || msg.body_preview || msg.body?.content || '' },
        bodyPreview: msg.body_preview || (msg.body?.content ? msg.body.content.substring(0, 150) : ''),
        fromName: msg.from_name || msg.from?.emailAddress?.name || 'Unknown',
        sentDateTime: msg.sent_at || msg.sentDateTime,
        receivedDateTime: msg.received_at || msg.created_at || msg.receivedDateTime,
        isAgent: msg.direction === 'outgoing' || msg.is_agent,
        isCustomer: msg.direction === 'incoming' || msg.is_customer,
      }));
      return sortMessages(formattedMsgs);
    };

    try {
      setLoading(true);
      setError(null);

      if (ticket.messages && ticket.messages.length > 0) {
        setConversation(formatMessages(ticket.messages));
      } else {
        let messages = [];
        if (ticket.isEmail && (ticket.conversationId || ticket.emailId)) {
          const conversationData = await EmailService.fetchConversation(ticket.id);
          messages = conversationData?.data || (Array.isArray(conversationData) ? conversationData : []);
        } else {
          if (ticket.conversation_id) {
            messages = await TicketService.getTicketMessages(null, ticket.conversation_id);
          } else {
            messages = await TicketService.getTicketMessages(ticket.id);
          }

          if ((!Array.isArray(messages) || messages.length === 0) && ticket.subject) {
            messages = [
              {
                id: `ticket-${ticket.id}`,
                body_html: ticket.description || `<p>Ticket opened: ${ticket.subject}</p>`,
                body_preview: ticket.subject,
                from_name: ticket.customer_name || ticket.customer_email || 'Customer',
                created_at: ticket.created_at,
                is_customer: true,
                direction: 'incoming',
              },
            ];
          }
        }
        setConversation(formatMessages(messages));
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      setError(`Failed to load conversation. ${error.response?.data?.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  }, [setLoading, setError, setConversation, messagesEndRef]);

  // Helper function to get the sender's display name
  const getSenderDisplay = (ticket) => {
    if (!ticket) return 'N/A';
    return (
      ticket.customer_name ||
      ticket.from_name ||
      ticket.sender_name ||
      ticket.from?.emailAddress?.name ||
      ticket.sender?.emailAddress?.name ||
      ticket.customer_email ||
      ticket.from?.emailAddress?.address || // Fallback to email address if name is not available
      ticket.sender?.emailAddress?.address ||
      'N/A'
    );
  };
  // const getAssignedAgentDisplay = async (ticket) => {
  //   const ID = ticket?.assigned_to_user_id;
  //   if(ID !== null) {
  //     const deskUser = await AdminService.getUserById(ID);
  //     //return deskUser;
  //     console.log("7787878787878",deskUser)
  //     return deskUser.username;
  //   }
  //   //return 'N/A';
  // };
  // Cleanup function for blob URLs when component unmounts
  // useEffect(() => {
  //   const fetchAssignedAgent = async () => {
  //     const ID = selectedTicket?.assigned_to_user_id;
  //     console.log("Hola id is -------->",ID)
  //     if (ID) {
  //       try {
  //         const deskUser = await AdminService.getUserById(ID);
  //         console.log("Hola Hola user is -------->",deskUser)
  //         setAssignedAgentName(deskUser.username);
  //       } catch (err) {
  //         console.error('Failed to fetch user:', err);
  //         setAssignedAgentName('N/A');
  //       }
  //     }
  //   };

  //   fetchAssignedAgent();
  // }, [selectedTicket]);
  useEffect(() => {
    let isMounted = true;
  
    const fetchAssignedAgent = async () => {
      const ID = selectedTicket?.assigned_to_user_id;
      
      // Reset the name when no ticket is selected or no assigned user
      if (!ID) {
        if (isMounted) setAssignedAgentName('N/A');
        return;
      }
  
      try {
        const deskUser = await AdminService.getUserById(ID);
        
        // Only update state if component is still mounted
        if (isMounted) {
          setAssignedAgentName(deskUser?.username || 'Unassigned');
        }
      } catch (err) {
        console.error('Failed to fetch assigned user:', err);
        if (isMounted) setAssignedAgentName('Error loading agent');
      }
    };
  
    fetchAssignedAgent();
  
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [selectedTicket?.assigned_to_user_id]); // Only re-run if assigned user ID changes
  useEffect(() => {
    return () => {
      const pattern = /blob:http[^"']+/g;
      // Extract all blob URLs from our processed HTML
      const blobUrls = [];
      let match;

      // Find all blob URLs in the processed HTML
      while ((match = pattern.exec(processedEmailHtml)) !== null) {
        blobUrls.push(match[0]);
      }

      // Revoke all blob URLs to prevent memory leaks
      blobUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
          console.log(`Revoked blob URL: ${url}`);
        } catch (error) {
          console.error(`Error revoking blob URL ${url}:`, error);
        }
      });
    };
  }, [processedEmailHtml]);

  // Make the process HTML function available globally for other components
  useEffect(() => {
    // Expose the function to the window object so child components can access it
    window.processHtmlWithInlineAttachments = processHtmlWithInlineAttachments;

    // Clean up when component unmounts
    return () => {
      delete window.processHtmlWithInlineAttachments;
    };
  }, [selectedDeskId]); // Re-create when selectedDeskId changes

  // Function to scroll to the bottom of the messages container
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messagesEndRef]);

  // Effect to scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [conversation, scrollToBottom]);

  // Function to only refresh the current ticket's conversation threads
  const handleRefreshCurrentTicket = useCallback(async () => {
    if (!selectedTicket) {
      console.log('No ticket selected, nothing to refresh');
      return;
    }

    console.log('[TicketsPage] Refreshing only current ticket conversation:', selectedTicket.id);
    setRefreshing(true); // Use refreshing state instead of loading

    try {
      await fetchConversationData(selectedTicket);
      setSuccess('Ticket conversation refreshed successfully');
    } catch (error) {
      console.error('Error refreshing ticket conversation:', error);
      setError('Failed to refresh ticket conversation. Please try again.');
    } finally {
      setRefreshing(false); // Reset refreshing state when done
    }
  }, [selectedTicket, fetchConversationData]);

  // Function to only refresh ticket listings without affecting the conversation view
  const handleRefreshTicketListing = useCallback(async () => {
    console.log('[TicketsPage] Refreshing only ticket listing');
    setRefreshing(true);

    try {
      // Determine which type of tickets to refresh based on current filter
      if (emailStatusFilter === 'open') {
        await fetchTickets();
        await fetchUnreadEmails();
      } else {
        await fetchClosedEmails();
      }

      setSuccess('Ticket listing refreshed successfully');
    } catch (error) {
      console.error('Error refreshing ticket listing:', error);
      setError('Failed to refresh ticket listing. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [emailStatusFilter, fetchTickets, fetchClosedEmails, fetchUnreadEmails]);

  // Initial load of conversation when a new ticket is selected
  useEffect(() => {
    if (selectedTicket?.id && selectedTicket.id !== conversationForTicketId) {
      fetchConversationData(selectedTicket);
      setConversationForTicketId(selectedTicket.id);
    }
  }, [selectedTicket, conversationForTicketId, fetchConversationData]);





  // The conversation is now updated via the ticket-specific Supabase Realtime subscription.
  // The polling-based auto-refresh has been removed.

  // CC dropdown is now controlled only by the CC button click
  // Removed click-outside handler to prevent closing when clicking outside

  // CC Management Logic
  useEffect(() => {
    if (conversation && conversation.length > 0) {
      const currentThreadCcs = new Set();
      conversation.forEach(message => {
        if (message.ccRecipients && Array.isArray(message.ccRecipients)) { // Microsoft Graph API structure
          message.ccRecipients.forEach(cc => {
            if (cc && cc.emailAddress && cc.emailAddress.address) {
              currentThreadCcs.add(cc.emailAddress.address.toLowerCase());
            }
          });
        } else if (message.cc_recipients && Array.isArray(message.cc_recipients)) { // Alternative structure (e.g., from DB)
          message.cc_recipients.forEach(cc_obj => {
            if (cc_obj && cc_obj.email) currentThreadCcs.add(cc_obj.email.toLowerCase());
            else if (typeof cc_obj === 'string') currentThreadCcs.add(cc_obj.toLowerCase());
          });
        }
      });
      setThreadCcEmails(currentThreadCcs);
      setReplyCcEmails(new Set(currentThreadCcs)); // Initialize reply CCs with thread CCs
    } else {
      setThreadCcEmails(new Set());
      setReplyCcEmails(new Set());
    }
  }, [conversation]);

  const isValidEmail = (email) => {
    return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
  };

  const handleAddReplyCc = () => { // Will be called by UI
    const emailToAdd = ccInput.trim().toLowerCase();
    if (emailToAdd && isValidEmail(emailToAdd)) {
      if (replyCcEmails.has(emailToAdd)) {
        // setError('Email address already in CC list.'); // Optional: specific feedback
        console.warn("Email already in CC: ", emailToAdd);
        setCcInput('');
        return;
      }
      setReplyCcEmails(prev => new Set(prev).add(emailToAdd));
      setCcInput('');
    } else if (emailToAdd) {
      // setError('Invalid CC email format.'); // Optional: specific feedback
      console.warn("Invalid CC email format: ", emailToAdd);
    }
  };

  // const handleRemoveReplyCc = (emailToRemove) => { // Will be called by UI
  //   console.log("Removing CC @@@@@@@@@@@@@@@@@@@@@: ", emailToRemove)
  //   setReplyCcEmails(prev => {
  //     const newSet = new Set(prev);
  //     newSet.delete(emailToRemove.toLowerCase());
  //     return newSet;
  //   });
  //   console.log("Reply CCs after removal: ", replyCcEmails)
  // };

  // Handle sending a reply to a ticket or email

  const handleRemoveReplyCc = (emailToRemove) => {
    console.log("Removing CC @@@@@@@@@@@@@@@@@@@@@: ", emailToRemove);
  
    setReplyCcEmails(prev => {
      const lowerEmail = emailToRemove.toLowerCase();
  
      // Convert to array, filter out, then re-create Set
      const newSet = new Set(
        [...prev].filter(email => email.toLowerCase() !== lowerEmail)
      );
  
      console.log("Reply CCs after removal: ", newSet);
      return newSet;
    });
  };
  
  
  const handleSendReply = async () => {
    if (!replyText.trim() && attachments.length === 0) {
      setError('Please enter a reply or add an attachment.');
      return;
    }
    if (!selectedTicket) {
      setError('No ticket selected.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Get the original ticket creator's email
      const originalSenderEmail = selectedTicket.from_address || selectedTicket.from;
      if (!originalSenderEmail) {
        setError('Cannot determine the original ticket creator.');
        setSending(false);
        return;
      }

      // Get the latest message to reply to (for thread context)
      const messageToReplyTo = conversation && conversation.length > 0 ? conversation[0] : null;
      if (!messageToReplyTo) {
        setError('Cannot reply: No message found to reply to.');
        setSending(false);
        return;
      }

      const emailId = messageToReplyTo.microsoft_message_id || messageToReplyTo.id;
      const senderName = userInfo?.name || 'Support Agent';
      const senderEmail = userInfo?.email;

      const currentDesk = desks.find(desk => desk.id.toString() === selectedDeskId.toString());
      const deskName = currentDesk?.name || 'Support Team';

      // Preserve line breaks and blank lines in the reply text
      const formattedReplyText = replyText.replace(/\n/g, '<br>');
      const emailContent = `${formattedReplyText}<br><br>Thanks & Regards,<br>${deskName}`;

      const formData = new FormData();
      formData.append('emailId', emailId);
      formData.append('desk_id', selectedDeskId);
      formData.append('content', emailContent);
      formData.append('sender_name', senderName);
      formData.append('sender_email', senderEmail);
      formData.append('to_recipients', originalSenderEmail); // Explicitly set the original sender as recipient

      attachments.forEach(file => {
        formData.append('attachments', file);
      });

      // Process CC recipients - remove any that match the original sender's email
      const ccEmailsArray = Array.from(replyCcEmails).filter(email => 
        email.toLowerCase() !== originalSenderEmail.toLowerCase()
      );

      if (ccEmailsArray.length > 0) {
        formData.append('cc_recipients', ccEmailsArray.join(','));
      }

      await EmailService.replyToEmail(formData);

      setSuccess('Reply sent successfully!');
      setReplyText('');
      setAttachments([]);
      // Consider resetting replyCcEmails, e.g., to new Set(threadCcEmails) or new Set()
      // For now, it retains the last used CCs for the next reply on the same ticket.

      if (selectedTicket.id.toString().startsWith('email-')) {
        await EmailService.markAsRead(emailId, selectedDeskId);
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      setError('Failed to send reply: ' + (err.response?.data?.message || err.message || 'Please try again'));
    } finally {
      setSending(false);
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
  const resolveEmail = async () => { // Removed emailId from params, will get it from conversation
    // First, ensure we have a selected ticket and conversation
    if (!selectedTicket || !conversation || conversation.length === 0) {
      setError('Cannot resolve: No active ticket or conversation selected.');
      return null;
    }

    // Get the latest customer message to resolve
    const messageToResolve = getLatestCustomerMessage(conversation);
    if (!messageToResolve) {
      setError('Cannot resolve: No customer message found in the conversation.');
      return null;
    }
    const emailId = messageToResolve.microsoft_message_id || messageToResolve.id;

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
      console.log(`Updating ticket ${ticketId} to status: ${status}`);
      const response = await TicketService.updateTicket(ticketId, { status });
      console.log('Update ticket response:', response);

      // Update the selected ticket if it's the one being modified
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }

      // If a ticket is being closed, ensure we refresh both open and closed ticket lists
      if (status === 'closed') {
        console.log('Ticket was closed, attempting to refresh lists and send feedback email.');

        // Optimistically update UI for responsiveness
        setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));
        const ticketToMove = selectedTicket && selectedTicket.id === ticketId ? selectedTicket : tickets.find(t => t.id === ticketId);
        if (ticketToMove) {
          const updatedClosedTicket = { ...ticketToMove, status: 'closed' };
          setResolvedEmails(prevResolved => {
            if (prevResolved.some(rt => rt.id === updatedClosedTicket.id)) return prevResolved;
            return [updatedClosedTicket, ...prevResolved].sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
          });
        }

        try {
          // Fetch updated lists from the server
          const openTicketsPromise = TicketService.getTicketsByStatus(selectedDeskId, 'open');
          const closedTicketsPromise = TicketService.getTicketsByStatus(selectedDeskId, 'closed');
          const [openTickets, closedTickets] = await Promise.all([openTicketsPromise, closedTicketsPromise]);

          if (Array.isArray(openTickets)) {
            setTickets(openTickets);
            console.log('Refreshed open tickets after closure:', openTickets.length);
          }
          if (Array.isArray(closedTickets)) {
            setResolvedEmails(closedTickets);
            console.log('Refreshed closed tickets after closure:', closedTickets.length);
          }

          // If the current view was showing the ticket that just got closed, select another one or clear selection
          if (emailStatusFilter === 'open' && selectedTicket && selectedTicket.id === ticketId) {
            if (openTickets.length > 0) {
              setSelectedTicket(openTickets[0]);
              navigate(`/tickets/${openTickets[0].id}`);
            } else {
              setSelectedTicket(null);
              navigate('/tickets'); // Navigate to base tickets page if no open tickets left
            }
          } else if (emailStatusFilter === 'closed' && selectedTicket && selectedTicket.id === ticketId) {
            // If in closed view and the selected ticket was the one closed, ensure it's still selected (it should be in closedTickets now)
            const stillSelected = closedTickets.find(ct => ct.id === ticketId);
            if (stillSelected) setSelectedTicket(stillSelected);
            // No navigation needed, already in closed view
          }

          toast.success('Ticket has been closed.');

        } catch (fetchError) {
          console.error('Error refreshing ticket lists after closure:', fetchError);
          toast.error('Error refreshing ticket lists.');
        }
      } else {
        // For other status changes (e.g., open, pending), just refresh the open tickets list
        // and potentially other relevant lists depending on your status flows.
        try {
          const openTickets = await TicketService.getTicketsByStatus(selectedDeskId, 'open');
          if (Array.isArray(openTickets)) {
            setTickets(openTickets);
          }
          // If you have other status categories like 'pending', fetch them too if needed.
        } catch (fetchError) {
          console.error('Error refreshing tickets after status update:', fetchError);
          toast.error('Error refreshing ticket list.');
        }
      }
    } catch (err) {
      console.error('Error updating ticket status:', err);
      setError('Failed to update ticket status. ' + (err.response?.data?.message || 'Please try again.'));
    }
  };

  return (
    <div className="tickets-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}> {/* Adjust height as needed */}
      <PanelGroup direction="horizontal" style={{ height: '100%' }} autoSaveId={null}> {/* Disable autoSaveId to respect defaultSize on each load */}
        <Panel defaultSize={20} minSize={20} maxSize={60} className="tickets-sidebar-panel"> {/* Adjusted default size */} {/* Corresponds roughly to md={4} for default */}
          {/* tickets-sidebar class can be used for internal styling of the panel's content */}
          <div className="tickets-sidebar" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Card className="mb-3" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Card.Header className="p-2">
                {/* First row with search and refresh button */}
                <div className="d-flex align-items-center mb-2">
                  <div className="position-relative" style={{ flex: 1 }}>
                    <Form.Control
                      type="text"
                      placeholder="Search ticket # or text"
                      size="sm"
                      value={searchText}
                      onChange={(e) => handleTicketSearch(e.target.value)}
                      className="pe-4"
                    />
                    {searchText && (
                      <Button
                        variant="link"
                        size="sm"
                        className="position-absolute"
                        style={{ right: 0, top: 0, padding: '0.15rem 0.5rem' }}
                        onClick={() => handleTicketSearch('')}
                      >
                        <FaTimes />
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handleRefreshTicketListing}
                    disabled={refreshing}
                    title="Refresh ticket listing"
                    className="ms-1"
                    style={{ minWidth: '32px' }}
                  >
                    {refreshing ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <FaSyncAlt />
                    )}
                  </Button>
                </div>

                {/* Second row with dropdowns */}
                <div className="d-flex">
                  <Form.Select
                    size="sm"
                    value={selectedDeskId || ''}
                    onChange={(e) => setSelectedDeskId(e.target.value)}
                    className="me-1"
                    style={{ flex: 3 }}
                  >
                    <option value="">Select Desk</option>
                    {Array.isArray(desks) && desks.length > 0 ? (
                      desks.map(desk => (
                        desk && desk.id ? (
                          <option key={desk.id} value={desk.id}>
                            {desk.name || `Desk ${desk.id}`}
                          </option>
                        ) : null
                      ))
                    ) : (
                      <option disabled value="">No desks assigned</option>
                    )}
                  </Form.Select>

                  <Form.Select
                    size="sm"
                    value={emailStatusFilter}
                    onChange={(e) => {
                      setEmailStatusFilter(e.target.value);

                      // Fetch tickets based on status
                      if (e.target.value === 'closed') {
                        fetchClosedEmails(); // This fetches 'closed' status tickets
                      } else { // 'open'
                        fetchTickets(); // This should now fetch 'open', 'new', AND 'reopen' status tickets
                      }
                    }}
                    style={{ flex: 2 }}
                  >
                    <option value="open">Open</option>
                    <option value="closed">Resolved</option>
                  </Form.Select>
                </div>
              </Card.Header>
              <Card.Body className="p-0" style={{ flexGrow: 1, overflowY: 'auto' }}>
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
                                className={`ticket-item compact ${selectedTicket?.emailId === email.id ? 'active' : ''}`}
                                onClick={() => {
                                  const newTicket = {
                                    id: `email-${email.id}`,
                                    subject: email.subject,
                                    from: email.fromName || (email.from?.emailAddress?.name || email.from?.emailAddress?.address),
                                    preview: email.preview,
                                    created: formatDisplayDate(email.receivedDateTime),
                                    time: formatDisplayDate(email.receivedDateTime),
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
                                  <small className="ticket-time">{formatDisplayDate(email.receivedDateTime || email.created_at || email.last_message_at)}</small>
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

                        {/* All Emails Section (grouped by conversation) - Only show in open view */}
                        {showAllEmails && emailStatusFilter === 'open' && allEmails.length > 0 && (
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
                                  className={`ticket-item compact ${selectedTicket?.conversationId === conversation.id ? 'active' : ''}`}
                                  onClick={() => {
                                    const newTicket = {
                                      id: `email-${conversation.latestMessageId}`,
                                      subject: conversation.subject,
                                      from: conversation.fromName,
                                      preview: conversation.preview,
                                      created: formatDisplayDate(conversation.receivedDateTime || conversation.last_message_at),
                                      time: formatDisplayDate(conversation.receivedDateTime || conversation.last_message_at),
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
                                                return { ...conv, hasUnread: false };
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
                                    <small className="ticket-time">{formatDisplayDate(conversation.receivedDateTime || conversation.last_message_at)}</small>
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
                        {(() => {
                          const isClosedView = emailStatusFilter === 'closed';
                          // const isReopenView = emailStatusFilter === 'reopen'; // Removed

                          // Data sources
                          const closedTickets = resolvedEmails;
                          // 'tickets' state (from fetchTickets) should now include open, new, and reopened tickets.
                          // This filter ensures only those are considered for the "Open Tickets" view.
                          const openAndReopenedTickets = tickets.filter(ticket =>
                            ticket.status === 'open' || ticket.status === 'new' || ticket.status === 'reopen'
                          );
                          // const reopenTickets = tickets.filter(ticket => ticket.status === 'reopen'); // Removed

                          // Sort helper function to ensure latest tickets appear first
                          const sortByLatest = (tickets) => {
                            return [...tickets].sort((a, b) => {
                              // Use last_message_at as primary, fall back to updated_at and created_at
                              const dateA = new Date(a.last_message_at || a.updated_at || a.created_at);
                              const dateB = new Date(b.last_message_at || b.updated_at || b.created_at);
                              return dateB - dateA; // Sort descending (newest first)
                            });
                          };

                          // Determine which list of tickets to use based on the filter
                          const ticketsForFilter = isClosedView
                            ? closedTickets
                            // : isReopenView // Removed condition
                            //   ? reopenTickets // Removed list
                            : openAndReopenedTickets; // Use combined list for 'open' view

                          // Use filtered results if search is active, and ensure they're always sorted newest first
                          const allTicketsToDisplay = sortByLatest(
                            searchText.trim() ? filteredTickets : ticketsForFilter
                          );
                          const sectionTitle = isClosedView ? "Resolved Tickets" : "Open Tickets"; // Simplified

                          // Only render the section if there are tickets to display for the current filter
                          if (allTicketsToDisplay.length === 0) {
                            return null;
                          }

                          // Calculate pagination indexes
                          const indexOfLastTicket = currentPage * ticketsPerPage;
                          const indexOfFirstTicket = indexOfLastTicket - ticketsPerPage;
                          // Get current tickets for this page
                          const ticketsToDisplay = allTicketsToDisplay.slice(indexOfFirstTicket, indexOfLastTicket);
                          // Calculate total pages
                          const totalPages = Math.ceil(allTicketsToDisplay.length / ticketsPerPage);

                          return (
                            <div className="ticket-section">
                              <div className="ticket-section-header">
                                <small><FaTicketAlt className="me-1" /> {sectionTitle} ({allTicketsToDisplay.length})</small>
                              </div>
                              {ticketsToDisplay.map(ticket => (
                                <div
                                  key={ticket.id}
                                  className={`ticket-item compact ${selectedTicket?.id === ticket.id ? 'active' : ''} ${ticket.reopened_from_closed ? 'reopened-ticket' : ''}`}
                                  onClick={() => {
                                    // Only attempt to update status if it's not the closed view and ticket is 'new'
                                    if (!isClosedView && ticket.status === 'new') {
                                      TicketService.updateTicket(ticket.id, { status: 'open' })
                                        .then(() => {
                                          console.log(`Updated ticket ${ticket.id} status from new to open`);
                                          // Update the local 'tickets' (open tickets) array to reflect the status change
                                          setTickets(prevOpenTickets => prevOpenTickets.map(t =>
                                            t.id === ticket.id ? { ...t, status: 'open' } : t
                                          ));
                                        })
                                        .catch(err => console.error('Error updating ticket status:', err));
                                    }
                                    setSelectedTicket(ticket);
                                  }}
                                >
                                  <div className="ticket-header">
                                    <div className="ticket-subject">
                                      {ticket.user_ticket_id && (
                                        <span className="ticket-id">#{ticket.user_ticket_id} </span>
                                      )}
                                      {ticket.subject || 'No Subject'}
                                    </div>
                                  </div>
                                  <div className="ticket-info">
                                    <small className="ticket-customer d-block">{ticket.customer_name || ticket.customer_email || ticket.from_name || ticket.email || 'N/A'}</small>
                                    <div className="d-flex justify-content-between align-items-center w-100">
                                      <div className="ticket-tags">

                                        {ticket.message_count === 1 && (
                                          <Badge bg="primary" className="me-1" pill>
                                            New
                                          </Badge>
                                        )}
                                        {ticket.status === 'reopen' && (
                                          <Badge bg="secondary" className="me-1" pill>
                                            Reopened
                                          </Badge>
                                        )}
                                      </div>
                                      <small className="ticket-time text-muted">{
                                        (() => {
                                          const dateStr = ticket.last_message_at || ticket.updated_at || ticket.created_at;
                                          if (!dateStr) return '';
                                          const dateObj = new Date(dateStr);
                                          // Format as "DD/MM/YYYY, HH:MM:SS"
                                          return dateObj.toLocaleString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            hour12: false
                                          }).replace(',', '');
                                        })()
                                      }</small>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {/* Pagination */}
                              {totalPages > 1 && (
                                <div className="pagination-container d-flex justify-content-center mt-2 mb-1">
                                  <style>
                                    {`
                                     .white-pagination .page-item .page-link {
                                       background-color: white;
                                       color: #333;
                                       border-color: #ddd;
                                     }
                                     .white-pagination .page-item.active .page-link {
                                       background-color: #f8f9fa;
                                       color: #333;
                                       border-color: #ddd;
                                       font-weight: bold;
                                     }
                                     .white-pagination .page-item .page-link:hover {
                                       background-color: #f1f1f1;
                                     }
                                   `}
                                  </style>
                                  <Pagination size="sm" className="white-pagination">
                                    <Pagination.Prev
                                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                      disabled={currentPage === 1}
                                    />

                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                                      <Pagination.Item
                                        key={pageNumber}
                                        active={pageNumber === currentPage}
                                        onClick={() => setCurrentPage(pageNumber)}
                                      >
                                        {pageNumber}
                                      </Pagination.Item>
                                    ))}

                                    <Pagination.Next
                                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                      disabled={currentPage === totalPages}
                                    />
                                  </Pagination>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {/* End of Tickets Section */}
                      </>
                    )}
                  </div>
                )}
              </Card.Body>
            </Card>
          </div>
        </Panel>
        <PanelResizeHandle style={{ width: '8px', background: '#e0e0e0', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '1px', height: '30px', background: '#bdbdbd' }} />
        </PanelResizeHandle>
        <Panel>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Content of the former Col md={8} for ticket details goes here */}
            {selectedTicket ? (
              <Card className="ticket-detail" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Card.Header style={{ flexShrink: 0, padding: '0.75rem 1rem' }}>
                  {/* Top Row */}
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <div className="d-flex align-items-center">
                      {selectedTicket.user_ticket_id && (
                        <h5 className="mb-0 me-2 ticket-id" style={{ fontWeight: 'bold' }}>
                          #{selectedTicket.user_ticket_id}
                        </h5>
                      )}
                      {/* <FiExternalLink size={18} className="me-2 text-muted" /> */}
                      <span className="mx-1" style={{ color: '#dee2e6' }}>|</span>
                      <h5 className="mb-0 ms-2 ticket-detail-subject">
                        {selectedTicket.subject || 'No Subject'}
                      </h5>
                    </div>
                    <div>
                      {!selectedTicket.isEmail && selectedTicket.status &&
                        (selectedTicket.status.trim().toLowerCase() === 'open' ||
                          selectedTicket.status.trim().toLowerCase() === 'reopen') && (
                          <Badge
                            bg="success"
                            className="text-capitalize"
                          >
                            Open
                          </Badge>
                        )}
                    </div>
                  </div>

                  {/* Bottom Row */}
                  {/* <div className="d-flex justify-content-start align-items-center text-muted" style={{ fontSize: '0.875rem' }}>
                  <span className="me-2">
                    Raised By: {getSenderDisplay(selectedTicket)}
                  </span>
                  <span className="text-muted" style={{ color: '#dee2e6' }}>|</span>
                  <span className="ms-2">
                    Assigned To: {getSenderDisplay(selectedTicket)}
                  </span>
                  <span className="text-muted" style={{ color: '#dee2e6' }}>|</span>
                  <span className="ms-2">
                   
                    Raised On: {
                      (() => {
                        try {
                          const timestamp = selectedTicket.created_at || selectedTicket.created || Date.now();
                          const dateObj = new Date(timestamp);
                          if (isNaN(dateObj.getTime())) throw new Error('Invalid date');

                          const day = String(dateObj.getDate()).padStart(2, '0');
                          const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
                          const year = dateObj.getFullYear();
                          const hours = String(dateObj.getHours()).padStart(2, '0');
                          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                          const seconds = String(dateObj.getSeconds()).padStart(2, '0');
                          return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
                        } catch (e) {
                          console.error('Error formatting date:', e);
                          const fallbackDate = new Date();
                          const day = String(fallbackDate.getDate()).padStart(2, '0');
                          const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
                          const year = fallbackDate.getFullYear();
                          const hours = String(fallbackDate.getHours()).padStart(2, '0');
                          const minutes = String(fallbackDate.getMinutes()).padStart(2, '0');
                          const seconds = String(fallbackDate.getSeconds()).padStart(2, '0');
                          return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
                        }
                      })()
                    }
                  </span>
                 
                </div> */}
                  <div
                    className="d-flex justify-content-start align-items-center flex-wrap"
                    style={{ fontSize: '0.875rem', color: '#6c757d' }} // Light black
                  >
                    <span className="me-2">
                      <span style={{ color: '#6c757d' }}>Raised By:</span>{' '}
                      <span style={{ color: '#212529', fontWeight: '500' }}>
                        {getSenderDisplay(selectedTicket)}
                      </span>
                    </span>

                    <span className="mx-2" style={{ color: '#dee2e6' }}>|</span>

                    <span className="me-2">
                      <span style={{ color: '#6c757d' }}>Assigned To:</span>{' '}
                      <span style={{ color: '#212529', fontWeight: '500' }}>
                        {assignedAgentName}
                      </span>
                    </span>

                    <span className="mx-2" style={{ color: '#dee2e6' }}>|</span>

                    <span>
                      <span style={{ color: '#6c757d' }}>Raised On:</span>{' '}
                      <span style={{ color: '#212529', fontWeight: '500' }}>
                        {(() => {
                          try {
                            const timestamp =
                              selectedTicket.created_at || selectedTicket.created || Date.now();
                            const dateObj = new Date(timestamp);
                            if (isNaN(dateObj.getTime())) throw new Error('Invalid date');

                            const day = String(dateObj.getDate()).padStart(2, '0');
                            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const year = dateObj.getFullYear();
                            const hours = String(dateObj.getHours()).padStart(2, '0');
                            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                            const seconds = String(dateObj.getSeconds()).padStart(2, '0');
                            return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
                          } catch (e) {
                            console.error('Error formatting date:', e);
                            const fallbackDate = new Date();
                            const day = String(fallbackDate.getDate()).padStart(2, '0');
                            const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
                            const year = fallbackDate.getFullYear();
                            const hours = String(fallbackDate.getHours()).padStart(2, '0');
                            const minutes = String(fallbackDate.getMinutes()).padStart(2, '0');
                            const seconds = String(fallbackDate.getSeconds()).padStart(2, '0');
                            return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
                          }
                        })()}
                      </span>
                    </span>
                  </div>

                </Card.Header>
                <Card.Body className="conversation-body p-3" style={{ flex: '1 1 0%', overflowY: 'auto', minHeight: 0 }}>
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
                                <small>
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
                              </div>
                              <div className="message-header-sub">
                                <small>
                                  {message.from && message.from.emailAddress ? message.from.emailAddress.address : (typeof message.from === 'string' ? message.from : '')}
                                </small>
                                {message.to && message.to.length > 0 && (
                                  <small className="ms-2">
                                    To: {message.to.map((to, index) => (
                                      <span key={index}>{to.emailAddress ? to.emailAddress.address : (typeof to === 'string' ? to : 'Unknown')}{index < message.to.length - 1 ? ', ' : ''}</span>
                                    ))}
                                  </small>
                                )}
                                {message.cc && message.cc.length > 0 && (
                                  <small className="ms-2">
                                    Cc: {message.cc.map((cc, index) => (
                                      <span key={index}>{cc.emailAddress ? cc.emailAddress.address : (typeof cc === 'string' ? cc : 'Unknown')}{index < message.cc.length - 1 ? ', ' : ''}</span>
                                    ))}
                                  </small>
                                )}
                              </div>
                              <div className="message-body">
                                {message.body && message.body.content ? (
                                  <MessageHtmlContent
                                    htmlContent={message.body.content}
                                    message={message}
                                    selectedDeskId={selectedDeskId}
                                  />
                                ) : message.bodyPreview ? (
                                  <p>{message.bodyPreview}</p>
                                ) : (
                                  <p>No message content</p>
                                )}

                                {/* Display attachments section - handles both Microsoft Graph attachments and S3 attachments */}
                                {(message.hasAttachments || (message.attachments_urls && message.attachments_urls.length > 0)) && (
                                  <div className="message-attachments mt-2">
                                    <div className="attachments-header mb-1">
                                      <FaPaperclip className="me-1" />
                                      <small>
                                        Attachments
                                        {message.attachments && message.attachments.length > 0 && <span> ({message.attachments.length})</span>}
                                        {message.attachments_urls && message.attachments_urls.length > 0 && <span> ({message.attachments_urls.length})</span>}
                                      </small>
                                    </div>
                                    <div className="attachments-list d-flex flex-wrap gap-2">

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

                                        const isImage = attachment.contentType && attachment.contentType.startsWith('image/') && attachment.url;

                                        return (
                                          <div key={`ms-${attachment.id || i}`} className="attachment-item border rounded" style={{ width: '130px', maxWidth: '130px' }}>
                                            {isImage ? (
                                              <div className="text-center p-1">
                                                <img
                                                  src={attachment.url}
                                                  alt={`Preview of ${attachment.name}`}
                                                  style={{ maxWidth: '100%', height: '60px', objectFit: 'contain', borderRadius: '2px' }}
                                                />
                                              </div>
                                            ) : (
                                              <div className="d-flex justify-content-center align-items-center p-1" style={{ height: '50px' }}>
                                                <span style={{ fontSize: '24px' }}>{icon}</span>
                                              </div>
                                            )}
                                            <div className="p-1 border-top bg-light" style={{ fontSize: '0.8rem', maxWidth: '100%', overflow: 'hidden' }}>
                                              <div 
                                                style={{
                                                  whiteSpace: 'nowrap',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  width: '100%',
                                                  display: 'block'
                                                }}
                                                title={attachment.name}
                                              >
                                                {attachment.name}
                                              </div>
                                              <div className="d-flex justify-content-between align-items-center mt-1">
                                                <small 
                                                  className="text-muted" 
                                                  style={{
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    maxWidth: '70%',
                                                    display: 'inline-block'
                                                  }}
                                                >
                                                  {formatFileSize(attachment.size)}
                                                </small>
                                                <Button
                                                  variant="link"
                                                  size="sm"
                                                  className="p-0 text-primary flex-shrink-0"
                                                  onClick={() => handleS3Download(attachment, message.desk_id)}
                                                  title="Open attachment"
                                                >
                                                  <FaEye />
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Handle S3 attachments from attachments_urls array */}
                                      {message.attachments_urls && message.attachments_urls.length > 0 && message.attachments_urls.map((attachment, i) => {
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

                                        // Check if it's an image for preview
                                        let isImage = attachment.contentType && attachment.contentType.startsWith('image/');
                                        if (!isImage && attachment.name) {
                                          const extension = attachment.name.split('.').pop().toLowerCase();
                                          if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
                                            isImage = true;
                                          }
                                        }

                                        const fileName = attachment.name || attachment.filename || `Attachment ${i + 1}`;

                                        return (
                                          <div key={`s3-${i}`} className="attachment-item border rounded" style={{ width: '160px', maxWidth: '160px' }}>
                                            {isImage && attachment.url ? (
                                              <div className="text-center p-1" style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img
                                                  src={attachment.url}
                                                  alt={`Preview of ${fileName}`}
                                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '2px' }}
                                                  onError={(e) => {
                                                    e.target.style.display = 'none';
                                                    e.target.parentNode.innerHTML = `<div class="d-flex justify-content-center align-items-center" style="height: 80px"><span style="fontSize: 32px"><FaFileImage /></span></div>`;
                                                  }}
                                                />
                                              </div>
                                            ) : (
                                              <div className="d-flex justify-content-center align-items-center p-1" style={{ height: '80px' }}>
                                                <span style={{ fontSize: '32px' }}>{icon}</span>
                                              </div>
                                            )}
                                            <div className="p-1 border-top bg-light" style={{ fontSize: '0.8rem', maxWidth: '100%', overflow: 'hidden' }}>
                                              <div 
                                                style={{
                                                  whiteSpace: 'nowrap',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  width: '100%',
                                                  display: 'block'
                                                }}
                                                title={fileName}
                                              >
                                                {fileName}
                                              </div>
                                              <div className="d-flex justify-content-between align-items-center mt-1">
                                                <small 
                                                  className="text-muted" 
                                                  style={{
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    maxWidth: '70%',
                                                    display: 'inline-block'
                                                  }}
                                                >
                                                  {attachment.size ? formatFileSize(attachment.size) : 'S3'}
                                                </small>
                                                <Button
                                                  variant="link"
                                                  size="sm"
                                                  className="p-0 text-primary"
                                                  onClick={() => window.open(attachment.url, '_blank')}
                                                  title="Open in new tab"
                                                >
                                                  <FaEye />
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}

                                    </div>
                                  </div>
                                )}

                                {/* Always show message details */}
                                <div className="message-details mt-2 p-2 border-top" style={{ fontSize: '0.85em' }}>
                                  {/* Show From field */}
                                  <div className="mb-1">
                                    <small className="text-muted">
                                      <strong>From: </strong>
                                      {(() => {
                                        // Different message source formats handled
                                        if (message.from && message.from.emailAddress) {
                                          const address = message.from.emailAddress.address || 'no-email';
                                          const name = message.from.emailAddress.name || '';
                                          return name ? `${name} <${address}>` : address;
                                        } else if (message.from_address) {
                                          return message.from_name ? `${message.from_name} <${message.from_address}>` : message.from_address;
                                        } else {
                                          return message.from || message.from_name || 'Unknown sender';
                                        }
                                      })()}
                                    </small>
                                  </div>

                                  {/* Show To field if available */}
                                  {(message.toRecipients || message.to_recipients || message.to_addresses) && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>To: </strong>
                                        {(() => {
                                          let toData = [];
                                          
                                          if (message.toRecipients && message.toRecipients.length > 0) {
                                            toData = message.toRecipients;
                                          } else if (message.to_recipients && Array.isArray(message.to_recipients)) {
                                            toData = message.to_recipients;
                                          } else if (message.to_addresses && Array.isArray(message.to_addresses)) {
                                            toData = message.to_addresses;
                                          } else if (message.to_recipients && typeof message.to_recipients === 'string') {
                                            toData = message.to_recipients.split(',').map(to => to.trim());
                                          } else if (message.to_addresses && typeof message.to_addresses === 'string') {
                                            toData = message.to_addresses.split(',').map(to => to.trim());
                                          }

                                          return toData.map((recipient, i) => {
                                            // Microsoft Graph API format
                                            if (recipient && recipient.emailAddress) {
                                              const address = recipient.emailAddress.address || '';
                                              const name = recipient.emailAddress.name || '';
                                              return (
                                                <span key={`to-${i}`}>
                                                  {name ? `${name} <${address}>` : address}
                                                  {i < toData.length - 1 ? ', ' : ''}
                                                </span>
                                              );
                                            }
                                            // Simple string format
                                            else if (typeof recipient === 'string') {
                                              return (
                                                <span key={`to-${i}`}>
                                                  {recipient}
                                                  {i < toData.length - 1 ? ', ' : ''}
                                                </span>
                                              );
                                            }
                                            // Object format
                                            else if (recipient && typeof recipient === 'object') {
                                              const address = recipient.address || recipient.email || recipient.mail || '';
                                              const name = recipient.name || recipient.displayName || '';
                                              if (address) {
                                                return (
                                                  <span key={`to-${i}`}>
                                                    {name ? `${name} <${address}>` : address}
                                                    {i < toData.length - 1 ? ', ' : ''}
                                                  </span>
                                                );
                                              }
                                            }
                                            return null;
                                          });
                                        })()}
                                      </small>
                                    </div>
                                  )}

                                  {/* Show CC field if message has CC recipients */}
                                  {((message.ccRecipients && message.ccRecipients.length > 0) || message.cc || message.cc_recipients || message.cc_addresses) && (
                                    <div className="mb-1">
                                      <small className="text-muted">
                                        <strong>Cc: </strong>
                                        {(() => {
                                          // Determine which CC format the message uses
                                          let ccData = [];

                                          if (message.ccRecipients && message.ccRecipients.length > 0) {
                                            ccData = message.ccRecipients;
                                          } else if (message.cc && Array.isArray(message.cc)) {
                                            ccData = message.cc;
                                          } else if (message.cc && typeof message.cc === 'string') {
                                            ccData = message.cc.split(',').map(cc => cc.trim());
                                          } else if (message.cc_recipients && Array.isArray(message.cc_recipients)) {
                                            ccData = message.cc_recipients;
                                          } else if (message.cc_addresses && Array.isArray(message.cc_addresses)) {
                                            ccData = message.cc_addresses;
                                          } else if (message.cc_recipients && typeof message.cc_recipients === 'string') {
                                            ccData = message.cc_recipients.split(',').map(cc => cc.trim());
                                          } else if (message.cc_addresses && typeof message.cc_addresses === 'string') {
                                            ccData = message.cc_addresses.split(',').map(cc => cc.trim());
                                          }

                                          return ccData.map((recipient, i) => {
                                            // Microsoft Graph API format
                                            if (recipient && recipient.emailAddress) {
                                              const address = recipient.emailAddress.address || '';
                                              const name = recipient.emailAddress.name || '';
                                              return (
                                                <span key={`cc-${i}`}>
                                                  {name ? `${name} <${address}>` : address}
                                                  {i < ccData.length - 1 ? ', ' : ''}
                                                </span>
                                              );
                                            }
                                            // Simple string format
                                            else if (typeof recipient === 'string') {
                                              return (
                                                <span key={`cc-${i}`}>
                                                  {recipient}
                                                  {i < ccData.length - 1 ? ', ' : ''}
                                                </span>
                                              );
                                            }
                                            // Object format
                                            else if (recipient && typeof recipient === 'object') {
                                              const address = recipient.address || recipient.email || recipient.mail || '';
                                              const name = recipient.name || recipient.displayName || '';
                                              if (address) {
                                                return (
                                                  <span key={`cc-${i}`}>
                                                    {name ? `${name} <${address}>` : address}
                                                    {i < ccData.length - 1 ? ', ' : ''}
                                                  </span>
                                                );
                                              }
                                            }
                                            return null;
                                          });
                                        })()}
                                      </small>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </Card.Body>
                {/* Reply Section - Now wrapped in Card.Footer */}
                {(emailStatusFilter !== 'closed' && (selectedTicket.status !== 'closed')) && (
                  <Card.Footer style={{ flexShrink: 0, background: '#f8f9fa', overflow: 'hidden' }}>
                    <Form>
                      <Form.Group>
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

                        {/* CC Management - Moved below textarea */}
                        <Collapse in={showCcDetails} className="mt-2" appear={true}>
                          <div ref={ccContainerRef} id="cc-management-collapse" className="p-2 border rounded bg-light">
                            <div className="mb-2">
                              <InputGroup size="sm">
                                <Form.Control
                                  type="email"
                                  placeholder="Add CC email..."
                                  value={ccInput}
                                  onChange={(e) => setCcInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddReplyCc(); } }}
                                  disabled={sending}
                                />
                                <Button 
                                  variant="outline-secondary" 
                                  onClick={handleAddReplyCc} 
                                  disabled={sending || !ccInput}
                                >
                                  Add
                                </Button>
                              </InputGroup>
                            </div>
                            
                            <div>
                              <div className="text-muted small mb-1">CC:</div>
                              <div>
                                {Array.from(new Set([...threadCcEmails, ...replyCcEmails]))
                                  .filter(email => {
                                    // Get the original sender's email from the ticket
                                    const originalSender = selectedTicket?.from_address || selectedTicket?.from;
                                    // Only include emails that don't match the original sender (case-insensitive)
                                    return !originalSender || email.toLowerCase() !== originalSender.toLowerCase();
                                  })
                                  .map(email => (
                                    <Badge 
                                      pill 
                                      bg={replyCcEmails.has(email) ? "primary" : "light"}
                                      text={replyCcEmails.has(email) ? "white" : "dark"}
                                      key={`cc-${email}`} 
                                      className={`me-1 mb-1 d-inline-flex align-items-center ${!replyCcEmails.has(email) ? 'border' : ''}`}
                                    >
                                      {email}
                                      {replyCcEmails.has(email) && (
                                        <Button
                                          variant="link"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveReplyCc(email);
                                          }}
                                          className="p-0 ms-1"
                                          style={{ color: 'white' }}
                                          title={`Remove ${email} from CC`}
                                        >
                                          &times;
                                        </Button>
                                      )}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </Collapse>
                        <Collapse in={showAttachments} className="mt-2">
                          <div id="attachments-collapse" className="p-2 border rounded bg-light">
                            <div className="mb-2">
                              <InputGroup size="sm">
                                <Form.Control
                                  type="file"
                                  multiple
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  style={{ display: 'none' }}
                                />
                                <Button 
                                  variant="outline-secondary"
                                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                >
                                  <FaPlus className="me-1" /> Add Files
                                </Button>
                              </InputGroup>
                            </div>
                            
                            {attachments.length > 0 && (
                              <div>
                                <div className="text-muted small mb-1">Attachments:</div>
                                <div className="attachments-list">
                                  {attachments.map((file, index) => (
                                    <Badge 
                                      pill 
                                      bg="primary"
                                      key={`file-${index}`} 
                                      className="me-1 mb-1 d-inline-flex align-items-center"
                                    >
                                      <FaPaperclip size={12} className="me-1" />
                                      <span className="text-truncate" style={{ maxWidth: '200px', color: 'white' }}>
                                        {file.name} ({(file.size / 1024).toFixed(1)}KB)
                                      </span>
                                      <Button
                                        variant="link"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveAttachment(file.name);
                                        }}
                                        className="p-0 ms-1"
                                        style={{ color: 'white' }}
                                        title={`Remove ${file.name}`}
                                      >
                                        &times;
                                      </Button>
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </Collapse>
                        <div className="d-flex justify-content-between align-items-center mt-2">
                          <div className="d-flex align-items-center">
                            <OverlayTrigger
                              placement="top"
                              overlay={<Tooltip>Attach files</Tooltip>}
                            >
                              <Button 
                                variant="link" 
                                className="text-muted p-0 me-3 text-decoration-none" 
                                onClick={() => setShowAttachments(!showAttachments)}
                              >
                                <FaPaperclip className="me-1" /> Add attachments {attachments.length > 0 && `(${attachments.length})`}
                              </Button>
                            </OverlayTrigger>
                            <OverlayTrigger
                              placement="top"
                              overlay={<Tooltip>Add CC recipients</Tooltip>}
                            >
                              <Button 
                                variant="link" 
                                className="text-muted p-0 text-decoration-none" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCcDetails(prev => !prev);
                                }}
                                aria-controls="cc-management-collapse"
                              >
                                <FaUserPlus className="me-1" /> Add CC
                              </Button>
                            </OverlayTrigger>
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
                                className="me-2 resolve-button"
                                onClick={() => updateTicketStatus(selectedTicket.id, 'closed')}
                              >
                                <FaCheck className="me-1" /> Resolve
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
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

// Add custom CSS for compact ticket items
const style = document.createElement('style');
style.innerHTML = `
  .ticket-item.compact {
    padding: 8px;
  }
  .ticket-item.compact .ticket-header {
    margin-bottom: 4px;
  }
  .ticket-item.compact .ticket-subject {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 85%;
  }
  .ticket-item.compact .ticket-time {
    font-size: 0.65rem;
    white-space: nowrap;
    margin-left: 8px;
    text-align: right;
    color: #6c757d;
  }
  .ticket-item.compact .ticket-info {
    margin-bottom: 3px;
  }
  .ticket-item.compact .ticket-customer {
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    margin-right: 8px;
  }
  .ticket-item.compact .ticket-message small {
    font-size: 0.7rem;
    -webkit-line-clamp: 1;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;
document.head.appendChild(style);

export default TicketsPage;