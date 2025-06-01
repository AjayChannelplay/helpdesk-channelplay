import React, { useState, useEffect } from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { FaInbox, FaCheck, FaClock, FaExclamationTriangle, FaEnvelope, FaUsers } from 'react-icons/fa';
import DeskService from '../../services/desk.service';
import AuthService from '../../services/auth.service';

const Sidebar = () => {
  const location = useLocation();
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = AuthService.getCurrentUser();
  
  useEffect(() => {
    const fetchDesks = async () => {
      try {
        let response;
        if (currentUser && currentUser.role === 'admin') {
          // Admins can see all desks
          response = await DeskService.getAllDesks();
        } else {
          // Agents can only see assigned desks
          response = await DeskService.getAgentDesks();
        }
        setDesks(response.desks || []);
      } catch (error) {
        console.error('Error fetching desks:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDesks();
  }, [currentUser]);
  
  return (
    <div className="sidebar bg-light p-3">
      <h5 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-2 text-muted">
        <span>Tickets</span>
      </h5>
      <Nav className="flex-column mb-4">
        <Nav.Link 
          as={Link} 
          to="/tickets?status=new" 
          className={location.pathname === '/tickets' && location.search.includes('status=new') ? 'active' : ''}
        >
          <FaInbox className="me-2" /> New Tickets
        </Nav.Link>
        <Nav.Link 
          as={Link} 
          to="/tickets?status=open" 
          className={location.pathname === '/tickets' && location.search.includes('status=open') ? 'active' : ''}
        >
          <FaClock className="me-2" /> Open Tickets
        </Nav.Link>
        <Nav.Link 
          as={Link} 
          to="/tickets?status=pending" 
          className={location.pathname === '/tickets' && location.search.includes('status=pending') ? 'active' : ''}
        >
          <FaExclamationTriangle className="me-2" /> Pending Tickets
        </Nav.Link>
        <Nav.Link 
          as={Link} 
          to="/tickets?status=closed" 
          className={location.pathname === '/tickets' && location.search.includes('status=closed') ? 'active' : ''}
        >
          <FaCheck className="me-2" /> Closed Tickets
        </Nav.Link>
        <Nav.Link 
          as={Link} 
          to="/tickets/assigned" 
          className={location.pathname === '/tickets/assigned' ? 'active' : ''}
        >
          <FaUsers className="me-2" /> My Tickets
        </Nav.Link>
      </Nav>
      
      <h5 className="sidebar-heading d-flex justify-content-between align-items-center px-3 mt-4 mb-2 text-muted">
        <span>Desks</span>
        <Link to="/desks/create" className="link-secondary">
          <small>+ Add</small>
        </Link>
      </h5>
      <Nav className="flex-column mb-2">
        {loading ? (
          <div className="text-center p-3">Loading desks...</div>
        ) : (
          desks.length > 0 ? (
            desks.map((desk) => (
              <Nav.Link 
                key={desk.id} 
                as={Link} 
                to={`/desks/${desk.id}`}
                className={location.pathname === `/desks/${desk.id}` ? 'active' : ''}
              >
                <FaEnvelope className="me-2" /> {desk.name}
              </Nav.Link>
            ))
          ) : (
            <div className="text-center p-3 text-muted">
              <small>No desks available</small>
            </div>
          )
        )}
        <Nav.Link 
          as={Link} 
          to="/desks" 
          className={location.pathname === '/desks' && !location.pathname.includes('/desks/') ? 'active' : ''}
        >
          <small>View All Desks</small>
        </Nav.Link>
      </Nav>
    </div>
  );
};

export default Sidebar;
