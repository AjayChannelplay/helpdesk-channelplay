// Determine environment based on hostname
const isProd = window.location.hostname !== 'localhost';

// API URL configuration
export const API_URL = isProd ? 'https://api.channelplay.in/api' : 'http://localhost:3001/api';

// For debugging
console.log('Using API URL:', API_URL);
console.log('Environment:', isProd ? 'Production' : 'Development');

// Other global constants
export const APP_NAME = 'Helpdesk';
export const MAX_UPLOAD_SIZE = 10485760; // 10MB
export const SUPPORTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];
