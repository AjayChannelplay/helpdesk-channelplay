import React from 'react';
import { Container, Row, Col, Nav } from 'react-bootstrap';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { FaUsers, FaKey, FaEnvelope, FaShieldAlt, FaTachometerAlt } from 'react-icons/fa';
import './AdminLayout.css';

const AdminLayout = () => {
  const location = useLocation();
  
  // Helper to check if a nav item is active
  const isActive = (path) => location.pathname === path;
  
  return (
    <Container fluid className="admin-container p-0">
      <Row className="g-0">
        <Col md={3} lg={2} className="admin-sidebar">
          <div className="admin-sidebar-header">
            <FaTachometerAlt className="me-2" />
            <h5>Admin Panel</h5>
          </div>
          
          <Nav className="flex-column admin-nav">
            <Nav.Link 
              as={Link} 
              to="/admin/user-management" 
              className={isActive('/admin/user-management') ? 'active' : ''}
            >
              <FaUsers className="nav-icon" />
              <span>User Management</span>
            </Nav.Link>
            
            <Nav.Link 
              as={Link} 
              to="/admin/oauth-setup" 
              className={isActive('/admin/oauth-setup') ? 'active' : ''}
            >
              <FaKey className="nav-icon" />
              <span>OAuth2 Setup</span>
            </Nav.Link>
            
            <Nav.Link 
              as={Link} 
              to="/admin/desk-management" 
              className={isActive('/admin/desk-management') ? 'active' : ''}
            >
              <FaEnvelope className="nav-icon" />
              <span>Desk Management</span>
            </Nav.Link>
            
            <Nav.Link 
              as={Link} 
              to="/admin/system-logs" 
              className={isActive('/admin/system-logs') ? 'active' : ''}
            >
              <FaShieldAlt className="nav-icon" />
              <span>System Logs</span>
            </Nav.Link>
          </Nav>
        </Col>
        
        <Col md={9} lg={10} className="admin-content">
          <Outlet />
        </Col>
      </Row>
    </Container>
  );
};

export default AdminLayout;
