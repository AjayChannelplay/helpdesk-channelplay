import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// Services
import AuthService from './services/auth.service';

// Components - Auth
import Login from './components/auth/Login';
import AccessHandler from './components/auth/AccessHandler';

// Components - Tickets
import TicketsPage from './components/tickets/TicketsPage';

// Components - Layout
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';

// Components - Admin
import AdminLayout from './components/admin/AdminLayout';
import OAuthSetup from './components/admin/oauth/OAuthSetup';
import DeskManagement from './components/admin/desks/DeskManagement';
import UserManagement from './components/admin/users/UserManagement';
import DesksPage from './components/desks/DesksPage';

// Debug Components
import SupabaseTest from './components/debug/SupabaseTest';

// Components - Agent
import AgentDashboard from './components/agent/AgentDashboard';
import AgentFeedbackList from './components/agent/AgentFeedbackList';
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    setLoading(false);
  }, []);

  const handleLogin = (loginResponse) => {
    // loginResponse is the data from AuthService.login (either mock or API response)
    if (loginResponse && loginResponse.user && loginResponse.token) {
      // This is the structure from the real API or the updated mock
      setCurrentUser({
        ...loginResponse.user, // Spread id, username, email, role
        token: loginResponse.token,
        assignedDesks: loginResponse.assignedDesks || [] // Ensure assignedDesks is present
      });
    } else if (loginResponse && loginResponse.token && loginResponse.role) {
      // This handles a case where loginResponse might already be a flat user object with a token
      // (e.g. if mock login was changed to return flat user directly)
      setCurrentUser(loginResponse);
    } else {
      // Fallback or error handling if the loginResponse structure is unexpected
      console.error('Login response structure unexpected:', loginResponse);
      setCurrentUser(null); // Or handle error appropriately
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
  };

  // Protected route component
  const ProtectedRoute = ({ children }) => {
    if (loading) return <div>Loading...</div>;
    if (!currentUser) return <Navigate to="/login" replace />;
    return children;
  };
  
  // Admin route component that checks for admin role
  const AdminRoute = ({ children }) => {
    if (loading) return <div>Loading...</div>;
    if (!currentUser) return <Navigate to="/login" replace />;
    if (currentUser.role !== 'admin') return <Navigate to="/dashboard" replace />;
    return children;
  };

  return (
    <Router>
      <div className="app-container">
        {currentUser && <Header user={currentUser} onLogout={handleLogout} />}
        
        <div className="content-container">
          <main className="main-content">
            <Routes>
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="/access" element={<AccessHandler onLogin={handleLogin} />} />
              
              {/* Protected routes will go here */}
              <Route path="/" element={<ProtectedRoute><Navigate to="/tickets" replace /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><AgentDashboard /></ProtectedRoute>} />
              <Route path="/desks" element={<ProtectedRoute><div className="p-4"><h2>Desks</h2><p>Desks management interface coming soon.</p></div></ProtectedRoute>} />
              <Route path="/desks/:deskId/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} /> {/* Updated to use TicketsPage, will filter by deskId */}
              <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
              <Route path="/tickets/:id" element={<ProtectedRoute><Navigate to="/tickets" replace /></ProtectedRoute>} />
              <Route path="/agent/feedback" element={<ProtectedRoute><AgentFeedbackList /></ProtectedRoute>} />
              
              {/* Admin routes */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<Navigate to="/admin/user-management" replace />} />
                <Route path="user-management" element={<UserManagement />} />
                <Route path="desk-management" element={<DeskManagement />} />
                <Route path="system-logs" element={<div className="p-4"><h2>System Logs</h2><p>System logs interface coming soon.</p></div>} />
                <Route path="supabase-test" element={<SupabaseTest />} />
              </Route>
              
              {/* 404 route */}
              <Route path="*" element={<Container className="py-5"><h2>Page Not Found</h2></Container>} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
