import axios from 'axios';

// Create an axios instance with default config
// Determine environment
const isProd = window.location.hostname !== 'localhost';

// Create API instance with appropriate base URL
const API = axios.create({
  baseURL: isProd
    ? 'https://api.channelplay.in/api' // Production - hardcoded for reliability
    : 'http://localhost:3001/api',    // Development
  headers: {
    'Content-Type': 'application/json'
  }
});

// Log API URL for debugging
console.log('API base URL:', isProd ? 'https://api.channelplay.in/api' : 'http://localhost:3001/api');
console.log('Current hostname:', window.location.hostname);

// Add request interceptor to include auth token
API.interceptors.request.use(
  (config) => {
    // Get user data from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        if (userData.token) {
          config.headers.Authorization = `Bearer ${userData.token}`;
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle auth errors (e.g., token expired)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Handle unauthorized/forbidden access
      console.error('Authentication error:', error);
      localStorage.removeItem('user'); // Remove user data instead of just token
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;
