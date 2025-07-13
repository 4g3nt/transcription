import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './SignInPage.scss';

interface SignInPageProps {
  className?: string;
}

export const SignInPage: React.FC<SignInPageProps> = ({ className }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { signInWithMagicLink } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Por favor, insira seu e-mail');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await signInWithMagicLink(email);
      setMessage('Link de acesso enviado! Verifique seu e-mail.');
    } catch (err: any) {
      setError('Erro ao enviar o link de acesso. Tente novamente.');
      console.error('Sign in error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`sign-in-page ${className || ''}`}>
      <div className="sign-in-container">
        <div className="sign-in-card">
          <div className="sign-in-header">
            <h1 className="sign-in-title">Bem-vindo</h1>
            <p className="sign-in-subtitle">
              Sistema de Transcrição de Laudos Radiológicos
            </p>
          </div>

          <form onSubmit={handleSubmit} className="sign-in-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                E-mail
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="seu@email.com"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {message && (
              <div className="success-message">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="sign-in-button"
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  Enviando...
                </>
              ) : (
                'Enviar Link de Acesso'
              )}
            </button>
          </form>

          <div className="sign-in-footer">
            <p className="footer-text">
              Você receberá um link de acesso em seu e-mail.<br />
              Clique no link para acessar o sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}; 