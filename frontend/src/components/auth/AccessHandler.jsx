import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Alert, Spinner } from 'react-bootstrap';
import AuthService from '../../services/auth.service';

/**
 * AccessHandler component processes SSO access requests
 * It extracts the encrypted email from URL params, sends it to the backend,
 * and handles automatic login based on the response
 */
const AccessHandler = ({ onLogin }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const processAccess = async () => {
      // Get the encrypted email from URL params
      const encryptedEmail = searchParams.get('email');
      
      if (!encryptedEmail) {
        setStatus('error');
        setMessage('Missing required parameters for SSO access');
        return;
      }

      try {
        // Call the backend to process the encrypted email
        const response = await AuthService.processAccessRequest(encryptedEmail);
        console.log('AccessHandler received response:', response);
        
        if (response && response.success && response.token) {
          // Login successful, update auth state
          // Make sure we have the correct structure for onLogin
          const loginData = {
            token: response.token,
            user: response.user,
            // Ensure assignedDesks is available at the top level as well
            assignedDesks: response.assignedDesks || response.user?.assignedDesks || []
          };
          
          console.log('AccessHandler passing login data to app:', loginData);
          onLogin(loginData);
          setStatus('success');
          setMessage('Login successful! Redirecting...');
          
          // Navigate to home or the specified redirect URL
          setTimeout(() => {
            navigate(response.redirectUrl || '/');
          }, 1500);
        } else {
          // Something went wrong with the response
          setStatus('error');
          setMessage(response?.message || 'Authentication failed. Please try regular login.');
        }
      } catch (error) {
        console.error('SSO access error:', error);
        setStatus('error');
        setMessage(
          error?.response?.data?.message || 
          error.message || 
          'Failed to process SSO access request'
        );
      }
    };

    processAccess();
  }, [searchParams, navigate, onLogin]);

  return (
    <Container className="mt-5 text-center">
      {status === 'loading' && (
        <div>
          <Spinner animation="border" role="status" className="mb-3" />
          <h4>Processing your access request...</h4>
          <p className="text-muted">Please wait while we verify your credentials</p>
        </div>
      )}

      {status === 'success' && (
        <Alert variant="success">
          <Alert.Heading>Login Successful!</Alert.Heading>
          <p>{message}</p>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="danger">
          <Alert.Heading>Authentication Failed</Alert.Heading>
          <p>{message}</p>
          <div className="mt-3">
            <a href="/login" className="btn btn-outline-primary">Go to Login Page</a>
          </div>
        </Alert>
      )}
    </Container>
  );
};

export default AccessHandler;
