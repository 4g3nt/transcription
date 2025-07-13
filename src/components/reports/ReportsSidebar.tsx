import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportService } from '../../services/reportService';
import { Report } from '../../types/firestore';
import './ReportsSidebar.scss';

interface ReportsSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onSelectReport: (report: Report) => void;
  selectedReportId: string | null;
  onCreateNewReport: () => void;
}

export const ReportsSidebar: React.FC<ReportsSidebarProps> = ({
  isOpen,
  onToggle,
  onSelectReport,
  selectedReportId,
  onCreateNewReport,
}) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    // Set up real-time listener for user reports
    const unsubscribe = reportService.onUserReportsChange(user.uid, (updatedReports) => {
      setReports(updatedReports);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const handleReportClick = (report: Report) => {
    onSelectReport(report);
  };

  return (
    <>
      {/* Sidebar toggle button */}
      <button
        onClick={onToggle}
        className={`sidebar-toggle ${isOpen ? 'open' : ''}`}
        title={isOpen ? 'Fechar sidebar' : 'Abrir sidebar'}
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar overlay for mobile */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      {/* Sidebar */}
      <div className={`reports-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">Laudos</h2>
          <button
            onClick={onCreateNewReport}
            className="new-report-button"
            title="Novo laudo"
          >
            ➕
          </button>
        </div>

        <div className="sidebar-content">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Carregando laudos...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>Erro ao carregar laudos</p>
              <button onClick={() => window.location.reload()}>
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && reports.length === 0 && (
            <div className="empty-state">
              <p>Nenhum laudo encontrado</p>
              <button onClick={onCreateNewReport} className="create-first-report">
                Criar primeiro laudo
              </button>
            </div>
          )}

          {!loading && !error && reports.length > 0 && (
            <div className="reports-list">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className={`report-item ${selectedReportId === report.id ? 'selected' : ''}`}
                  onClick={() => handleReportClick(report)}
                >
                  <div className="report-title">{report.title}</div>
                  <div className="report-date">
                    {formatDate(report.updatedAt)}
                  </div>
                  <div className="report-preview">
                    {report.content.substring(0, 100)}
                    {report.content.length > 100 && '...'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}; 