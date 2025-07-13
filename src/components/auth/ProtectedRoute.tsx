import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SignInPage } from './SignInPage';
import { EmailVerification } from './EmailVerification';
import './ProtectedRoute.scss';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const SignOutButton: React.FC = () => {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <button 
      onClick={handleSignOut}
      className="sign-out-button"
      title="Sair"
    >
      🚪
    </button>
  );
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  // Check if current URL is the verification page
  const isVerificationPage = window.location.pathname === '/auth/verify';

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="protected-route-loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h2 className="loading-title">Carregando...</h2>
          <p className="loading-message">Verificando autenticação</p>
        </div>
      </div>
    );
  }

  // If user is on verification page, show verification component
  if (isVerificationPage) {
    return <EmailVerification />;
  }

  // If user is not authenticated, show sign-in page
  if (!user) {
    return <SignInPage />;
  }

  // If user is authenticated, show protected content
  return (
    <div className="protected-route">
      <div className="user-info">
        <span className="user-email">{user.email}</span>
        <SignOutButton />
      </div>
      {children}
    </div>
  );
}; 