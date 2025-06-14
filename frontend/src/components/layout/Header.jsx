import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FaUser, FaSignOutAlt, FaCog, FaUserCircle, FaSyncAlt, FaSearch, FaTicketAlt, FaClock, FaPlus, FaUsers, FaKey, FaShieldAlt, FaEnvelope, FaChevronDown } from 'react-icons/fa';
import './Header.css';
import newChannelplayLogo from '../../assets/Blue-Black Channelplay Logo for Light Backgrounds.png';

const Header = ({ user, onLogout }) => {
  // Extract the user data from props or localStorage if not available
  const [userData, setUserData] = useState(user);
  
  // Make sure we always have the latest user data
  useEffect(() => {
    if (!userData || !userData.role) {
      const localUser = JSON.parse(localStorage.getItem('user'));
      if (localUser && localUser.user) {
        setUserData(localUser.user);
      } else if (localUser) {
        setUserData(localUser);
      }
    }
  }, [userData, user]);
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };
  
  const handleItemClick = (path) => {
    console.log('Navigating to:', path);
    setDropdownOpen(false);
    // Use setTimeout to ensure the dropdown closing animation completes before navigation
    setTimeout(() => {
      navigate(path);
    }, 10);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [dropdownOpen]);

  return (
    <header className="simplified-header">
      <div className="header-left">
        <div className="logo">
          <Link to="/dashboard">
            <img src={newChannelplayLogo} alt="Channelplay Logo" className="channelplay-logo-img" />
          </Link>
        </div>
        
        <nav className="main-navigation">
          <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'nav-item active' : 'nav-item'}>
            Dashboard
          </Link>
          <Link to="/tickets" className={location.pathname.includes('/tickets') ? 'nav-item active' : 'nav-item'}>
            Tickets
          </Link>
          <Link to="/desks" className={location.pathname.includes('/desks') ? 'nav-item active' : 'nav-item'}>
            Desks
          </Link>
          <Link to="/statistics" className={location.pathname.includes('/statistics') ? 'nav-item active' : 'nav-item'}>
            Statistics
          </Link>
        </nav>
      </div>
      
      <div className="header-right">
        <div className="profile-menu" ref={dropdownRef}>
          <button 
            className="profile-button" 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div className="avatar">{userData?.display_name?.charAt(0) || userData?.name?.charAt(0) || user?.display_name?.charAt(0) || user?.name?.charAt(0) || 'A'}</div>
            <span className="profile-name">{userData?.display_name || userData?.name || user?.display_name || user?.name || 'User'}</span>
            <FaChevronDown className={`chevron ${dropdownOpen ? 'up' : ''}`} />
          </button>
          
          {dropdownOpen && (
            <div className="profile-dropdown">
              <div className="dropdown-header">
                <div className="avatar-large">{userData?.display_name?.charAt(0) || userData?.name?.charAt(0) || user?.display_name?.charAt(0) || user?.name?.charAt(0) || 'A'}</div>
                <div>
                  <div className="name">{userData?.display_name || userData?.name || user?.display_name || user?.name || 'User'}</div>
                  <div className="role">{userData?.role || user?.role || ''}</div>
                </div>
              </div>
              
              <div className="dropdown-body">
                {/* Profile link removed as requested */}
                
                {/* Check both user props and local userData for admin role */}
                {(user?.role === 'admin' || userData?.role === 'admin' || 
                 (user?.user && user?.user.role === 'admin') ||
                 JSON.parse(localStorage.getItem('user'))?.user?.role === 'admin') && (
                  <>
                    {/* No divider needed here since Profile link was removed */}
                    <div className="section-title">Admin</div>
                    
                    {/* OAuth2 Setup link removed as requested */}
                    
                    <Link to="/admin/user-management" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                      <FaUsers />
                      <span>User Management</span>
                    </Link>
                    
                    <Link to="/admin/desk-management" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                      <FaEnvelope />
                      <span>Desk Management</span>
                    </Link>
                  </>
                )}
                
                <div className="divider"></div>
                
                <button className="dropdown-item logout" onClick={handleLogout}>
                  <FaSignOutAlt />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
