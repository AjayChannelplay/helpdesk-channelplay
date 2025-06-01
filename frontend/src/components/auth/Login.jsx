import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaEnvelope, FaSignInAlt, FaHeadset } from 'react-icons/fa';
import AuthService from '../../services/auth.service';
import './Login.css';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [animateCard, setAnimateCard] = useState(false);
  
  const navigate = useNavigate();

  // Trigger animation on component mount
  useEffect(() => {
    setTimeout(() => setAnimateCard(true), 100);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // Call login API
      const data = await AuthService.login(email, password);
      
      // Handle successful login
      if (onLogin) {
        onLogin(data);
      }
      
      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to login. Please check your credentials.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Container fluid>
        <Row className="min-vh-100">
          {/* Left side with background and branding */}
          <Col md={6} className="d-flex flex-column justify-content-center align-items-center p-5 brand-side">
            <div className={`text-center ${animateCard ? 'animate' : ''}`}>
              <div className="logo-circle mb-4">
                <FaHeadset size={50} />
              </div>
              <h1 className="brand-title mb-3">Channelplay Helpdesk</h1>
              <p className="brand-subtitle">Streamlined customer support with email integration</p>
              
              <div className="brand-features mt-5">
                <div className="feature-item">
                  <div className="feature-icon">📧</div>
                  <div className="feature-text">OAuth2 email integration with Gmail & Office 365</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">🎫</div>
                  <div className="feature-text">Centralized ticket management system</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">📊</div>
                  <div className="feature-text">Advanced analytics and reporting</div>
                </div>
              </div>
            </div>
          </Col>
          
          {/* Right side with login form */}
          <Col md={6} className="d-flex flex-column justify-content-center align-items-center p-4 login-side">
            <Card className={`login-card shadow w-100 ${animateCard ? 'animate' : ''}`}>
              <Card.Body className="p-4 p-lg-5">
                <h2 className="text-center mb-4">Welcome Back</h2>
                
                {error && 
                  <Alert variant="danger" className="animate__animated animate__headShake mb-4">
                    <FaLock className="me-2" />{error}
                  </Alert>
                }
                
                <Form onSubmit={handleLogin}>
                  <Form.Group className="mb-4 input-group-with-icon">
                    <div className="input-icon">
                      <FaEnvelope />
                    </div>
                    <Form.Control
                      type="email"
                      className="form-control-lg ps-5"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </Form.Group>
                  
                  <Form.Group className="mb-4 input-group-with-icon">
                    <div className="input-icon">
                      <FaLock />
                    </div>
                    <Form.Control
                      type="password"
                      className="form-control-lg ps-5"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </Form.Group>
                  
                  <Row className="mb-4">
                    <Col>
                      <Form.Check 
                        type="checkbox" 
                        label="Remember me" 
                        id="rememberMe" 
                      />
                    </Col>
                  </Row>
                  
                  <div className="d-grid">
                    <Button 
                      variant="primary" 
                      size="lg"
                      type="submit" 
                      className="login-button"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                          Logging in...
                        </>
                      ) : (
                        <>
                          <FaSignInAlt className="me-2" /> Login
                        </>
                      )}
                    </Button>
                  </div>
                </Form>
                

              </Card.Body>
            </Card>
            
            <div className="mt-4 text-center text-muted copyright">
              <small>&copy; {new Date().getFullYear()} Channelplay Helpdesk. All rights reserved.</small>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Login;
