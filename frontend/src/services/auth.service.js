import API from './api.service';

const AuthService = {
  // Login user
  login: async (email, password) => {
    try {
      // FOR DEMO: Bypassing backend authentication - TEMPORARILY DISABLED FOR REAL JWT TESTING
      // if ((email === 'admin@example.com' && password === 'password123') ||
      //     (email === 'agent@example.com' && password === 'password')) {
      //   
      //   // Create mock response data based on credentials
      //   const isAdmin = email === 'admin@example.com';
      //   const mockData = {
      //     message: 'Login successful',
      //     user: {
      //       id: isAdmin ? 1 : 2,
      //       username: isAdmin ? 'Admin User' : 'Agent User',
      //       email: email,
      //       role: isAdmin ? 'admin' : 'agent'
      //     },
      //     token: 'mock_jwt_token_' + (isAdmin ? 'admin' : 'agent')
      //   };
      //   
      //   // Store user data in local storage
      //   localStorage.setItem('user', JSON.stringify(mockData));
      //   
      //   return mockData;
      // }
      
      // If not using demo credentials, proceed with actual API call
      const response = await API.post('/auth/login', { email, password });
      
      // If response.data.token exists, store the user data in localStorage
      if (response.data.token) {
        console.log('[auth.service] Storing login response in localStorage:', response.data);
        
        // Clone the response data to avoid modifying the original
        const userData = { ...response.data };
        
        // Make sure the user object has the assignedDesks if it exists at the top level
        if (userData.assignedDesks && userData.user) {
          userData.user.assignedDesks = userData.assignedDesks;
          console.log('[auth.service] Added assignedDesks to user object:', userData.user.assignedDesks);
        }
        
        console.log('[auth.service] Final userData structure being saved to localStorage:', userData);
        localStorage.setItem('user', JSON.stringify(userData));
      }
      
      return response.data;
    } catch (error) {
      // If backend is unreachable, fall back to mock login
      if (!error.response && (email === 'admin@example.com' && password === 'password123') ||
          (email === 'agent@example.com' && password === 'password')) {
        
        const isAdmin = email === 'admin@example.com';
        const mockData = {
          message: 'Login successful (offline mode)',
          user: {
            id: isAdmin ? 1 : 2,
            username: isAdmin ? 'Admin User' : 'Agent User',
            email: email,
            role: isAdmin ? 'admin' : 'agent'
          },
          token: 'mock_jwt_token_' + (isAdmin ? 'admin' : 'agent')
        };
        
        localStorage.setItem('user', JSON.stringify(mockData));
        return mockData;
      }
      
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Logout user
  logout: () => {
    localStorage.removeItem('user');
  },
  
  // Register user
  register: async (username, email, password, role) => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        username,
        email,
        password,
        role
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get current user
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    try {
      const storedData = JSON.parse(userStr);
      console.log('[auth.service] getCurrentUser - raw stored data:', storedData);
      
      // If the stored data has a 'user' property (like from the real API response),
      if (storedData && storedData.user) {
        // First check for assignedDesks at the top level of the response (where backend puts it)
        let assignedDesks = storedData.assignedDesks || [];
        
        // If not found at top level, check inside the user object
        if (!assignedDesks.length && storedData.user.assignedDesks) {
          assignedDesks = storedData.user.assignedDesks;
        }
        
        console.log('[auth.service] getCurrentUser - extracted assignedDesks:', assignedDesks);
        
        // Return a normalized user object with consistent structure
        return {
          ...storedData.user, // Spread the actual user details (id, username, email, role)
          token: storedData.token, // Keep token at the top level for getAuthHeader
          assignedDesks // Include assignedDesks at the top level
        };
      }
      
      // Otherwise, return the stored data as is
      return storedData;
    } catch (error) {
      console.error('[auth.service] Error parsing user from localStorage:', error);
      return null;
    }
  },
  
  // Update current user in localStorage
  updateCurrentUserInStorage: (updatedFields) => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      console.error('[auth.service] Cannot update user in storage: No user found in localStorage.');
      return;
    }

    try {
      console.log('[auth.service] updateCurrentUserInStorage - updatedFields:', updatedFields);
      const storedData = JSON.parse(userStr);
      console.log('[auth.service] updateCurrentUserInStorage - current storedData:', storedData);
      
      // Handle the nested structure properly
      if (storedData.user) {
        // We have the { token, user: {...} } structure
        const newUserObject = {
          ...storedData.user, // Start with existing user fields
          ...updatedFields, // Override with new fields
        };
        
        // Ensure assignedDesks is properly set in the user object
        if (updatedFields.assignedDesks !== undefined) {
          newUserObject.assignedDesks = updatedFields.assignedDesks;
        }

        const newStoredData = {
          ...storedData, // Keep existing fields like token
          user: newUserObject, // Update the user object
        };
        
        console.log('[auth.service] updateCurrentUserInStorage - newStoredData (nested):', newStoredData);
        localStorage.setItem('user', JSON.stringify(newStoredData));
      } else {
        // We have a flat structure
        const newStoredData = {
          ...storedData,
          ...updatedFields
        };
        
        console.log('[auth.service] updateCurrentUserInStorage - newStoredData (flat):', newStoredData);
        localStorage.setItem('user', JSON.stringify(newStoredData));
      }
    } catch (error) {
      console.error('Error updating user in localStorage:', error);
    }
  },

  // Get auth header
  getAuthHeader: () => {
    const user = AuthService.getCurrentUser();
    
    if (user && user.token) {
      return { Authorization: 'Bearer ' + user.token };
    } else {
      return {};
    }
  },
  
  // Process encrypted email SSO access request
  processAccessRequest: async (encryptedEmail) => {
    try {
      console.log('[auth.service] Processing SSO access request with encrypted email');
      const response = await API.get(`/access?email=${encodeURIComponent(encryptedEmail)}`);
      
      // If response.data.token exists, store the user data in localStorage
      if (response.data.token) {
        console.log('[auth.service] SSO access successful, storing user data');
        
        // Clone the response data to avoid modifying the original
        const userData = { ...response.data };
        
        // Make sure the user object is properly structured
        if (!userData.user && userData.id) {
          // If the user data is flat (not nested under 'user'), restructure it
          userData.user = {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role
          };
        }
        
        // Make sure the user has assignedDesks property
        if (userData.user && !userData.user.assignedDesks && userData.assignedDesks) {
          userData.user.assignedDesks = userData.assignedDesks;
          console.log('[auth.service] Added assignedDesks to user object:', userData.user.assignedDesks);
        }
        
        console.log('[auth.service] Final userData structure being saved to localStorage:', userData);
        // Store the full response in localStorage
        localStorage.setItem('user', JSON.stringify(userData));
      }
      
      return response.data;
    } catch (error) {
      console.error('[auth.service] SSO access request failed:', error);
      throw error;
    }
  }
};

export default AuthService;
