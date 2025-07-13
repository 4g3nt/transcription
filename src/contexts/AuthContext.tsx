import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailLink, 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink,
  signOut as firebaseSignOut,
  ActionCodeSettings
} from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  confirmSignInWithMagicLink: (email: string, link: string) => Promise<void>;
  signOut: () => Promise<void>;
  isSignInLink: (link: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithMagicLink = async (email: string) => {
    const actionCodeSettings: ActionCodeSettings = {
      url: `${window.location.origin}/auth/verify`,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save the email locally to retrieve later
      localStorage.setItem('emailForSignIn', email);
    } catch (error) {
      console.error('Error sending magic link:', error);
      throw error;
    }
  };

  const confirmSignInWithMagicLink = async (email: string, link: string) => {
    try {
      await signInWithEmailLink(auth, email, link);
      // Clear the email from local storage
      localStorage.removeItem('emailForSignIn');
    } catch (error) {
      console.error('Error confirming sign in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const isSignInLink = (link: string) => {
    return isSignInWithEmailLink(auth, link);
  };

  const value: AuthContextType = {
    user,
    loading,
    signInWithMagicLink,
    confirmSignInWithMagicLink,
    signOut,
    isSignInLink,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 