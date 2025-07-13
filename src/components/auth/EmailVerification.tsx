import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './EmailVerification.scss';

export const EmailVerification: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');
  const { confirmSignInWithMagicLink, isSignInLink } = useAuth();

  useEffect(() => {
    const handleVerification = async () => {
      const currentUrl = window.location.href;
      
      if (!isSignInLink(currentUrl)) {
        setStatus('error');
        setMessage('Link de verificação inválido.');
        return;
      }

      // Delay for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to get email from localStorage first
      let email = localStorage.getItem('emailForSignIn') || '';
      console.log('email', email);
      await new Promise(resolve => setTimeout(resolve, 2000));
      // If not found in localStorage, prompt user for email
      /* if (!email) {
        email = window.prompt('Por favor, insira seu e-mail para confirmação:');
      }

      if (!email) {
        setStatus('error');
        setMessage('E-mail é necessário para completar a verificação.');
        return;
      } */

      try {
        await confirmSignInWithMagicLink(email, currentUrl);
        setStatus('success');
        setMessage('E-mail verificado com sucesso! Redirecionando...');
        
        // Redirect to home page after successful verification
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } catch (error: any) {
        console.error('Verification error:', error);
        setStatus('error');
        
        if (error.code === 'auth/invalid-action-code') {
          setMessage('Link expirado ou já utilizado.');
        } else if (error.code === 'auth/invalid-email') {
          setMessage('E-mail inválido.');
        } else {
          setMessage('Erro na verificação. Tente novamente.');
        }
      }
    };

    handleVerification();
  }, [confirmSignInWithMagicLink, isSignInLink]);

  const getStatusIcon = () => {
    switch (status) {
      case 'verifying':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
      case 'expired':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'verifying':
        return 'Verificando...';
      case 'success':
        return 'Verificação Concluída!';
      case 'error':
      case 'expired':
        return 'Erro na Verificação';
      default:
        return 'Verificando...';
    }
  };

  return (
    <div className="email-verification">
      <div className="verification-container">
        <div className="verification-card">
          <div className="verification-icon">
            {status === 'verifying' ? (
              <div className="spinner-large"></div>
            ) : (
              <span className="status-icon">{getStatusIcon()}</span>
            )}
          </div>
          
          <h1 className="verification-title">{getStatusTitle()}</h1>
          
          <p className="verification-message">
            {message || 'Verificando seu e-mail...'}
          </p>
          
          {status === 'error' && (
            <button 
              onClick={() => window.location.href = '/'}
              className="retry-button"
            >
              Tentar Novamente
            </button>
          )}
          
          {status === 'success' && (
            <div className="success-actions">
              <div className="loading-bar">
                <div className="loading-progress"></div>
              </div>
              <p className="redirect-text">Redirecionando automaticamente...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 