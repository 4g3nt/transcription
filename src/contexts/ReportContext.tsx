import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { reportService } from '../services/reportService';
import { transcriptionService } from '../services/transcriptionService';
import { Report, Transcription } from '../types/firestore';

interface ReportContextType {
  currentReport: Report | null;
  currentTranscriptions: Transcription[];
  loading: boolean;
  error: string | null;
  createNewReport: (content?: string) => Promise<void>;
  loadReport: (report: Report) => Promise<void>;
  saveReport: (content: string) => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
  addTranscription: (text: string, audioBuffer: ArrayBuffer) => Promise<void>;
  updateTranscription: (transcriptionId: string, newText: string, originalText: string) => Promise<void>;
  clearCurrentReport: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export const useReport = () => {
  const context = useContext(ReportContext);
  if (context === undefined) {
    throw new Error('useReport must be used within a ReportProvider');
  }
  return context;
};

interface ReportProviderProps {
  children: React.ReactNode;
}

export const ReportProvider: React.FC<ReportProviderProps> = ({ children }) => {
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [currentTranscriptions, setCurrentTranscriptions] = useState<Transcription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();



  // Listen to transcriptions changes when report changes
  useEffect(() => {
    if (!currentReport) {
      setCurrentTranscriptions([]);
      return;
    }

    const unsubscribe = transcriptionService.onReportTranscriptionsChange(
      currentReport.id,
      (transcriptions) => {
        setCurrentTranscriptions(transcriptions);
      }
    );

    return () => unsubscribe();
  }, [currentReport]);

  const createNewReport = async (content: string = '# Laudo de Radiologia\n\n') => {
    if (!user) throw new Error('User not authenticated');

    setLoading(true);
    setError(null);

    try {
      const title = reportService.generateTitleFromContent(content);
      const reportId = await reportService.createReport({
        title,
        content,
        userId: user.uid,
      });

      // Load the newly created report
      const newReport = await reportService.getReport(reportId);
      if (newReport) {
        setCurrentReport(newReport);
      }
    } catch (err) {
      setError('Erro ao criar novo laudo');
      console.error('Error creating report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (report: Report) => {
    setLoading(true);
    setError(null);

    try {
      // Load the full report data
      const fullReport = await reportService.getReport(report.id);
      if (fullReport) {
        setCurrentReport(fullReport);
      }
    } catch (err) {
      setError('Erro ao carregar laudo');
      console.error('Error loading report:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveReport = async (content: string) => {
    if (!currentReport || !user) return;

    try {
      const title = reportService.generateTitleFromContent(content);
      await reportService.updateReport(currentReport.id, {
        title,
        content,
        updatedAt: new Date(),
      });

      // Update local state
      setCurrentReport(prev => prev ? {
        ...prev,
        title,
        content,
        updatedAt: new Date(),
      } : null);
    } catch (err) {
      setError('Erro ao salvar laudo');
      console.error('Error saving report:', err);
    }
  };

  const deleteReport = async (reportId: string) => {
    setLoading(true);
    setError(null);

    try {
      await reportService.deleteReport(reportId);
      
      // If the deleted report is the current one, clear it
      if (currentReport && currentReport.id === reportId) {
        setCurrentReport(null);
        setCurrentTranscriptions([]);
      }
    } catch (err) {
      setError('Erro ao deletar laudo');
      console.error('Error deleting report:', err);
    } finally {
      setLoading(false);
    }
  };

  const addTranscription = async (text: string, audioBuffer: ArrayBuffer) => {
    if (!currentReport || !user) return;

    try {
      const audioData = transcriptionService.arrayBufferToBase64(audioBuffer);
      await transcriptionService.createTranscription(currentReport.id, {
        text,
        audioData,
        timestamp: new Date(),
        disliked: false,
        edited: false,
        userId: user.uid,
      });
    } catch (err) {
      console.error('Error adding transcription:', err);
    }
  };

  const updateTranscription = async (transcriptionId: string, newText: string, originalText: string) => {
    if (!currentReport) return;

    try {
      // Find the transcription to check if it's the first edit
      const transcription = currentTranscriptions.find(t => t.id === transcriptionId);
      const isFirstEdit = transcription && !transcription.edited;

      await transcriptionService.updateTranscriptionWithCorrection(
        currentReport.id,
        transcriptionId,
        newText,
        originalText,
        isFirstEdit || false
      );
    } catch (err) {
      console.error('Error updating transcription:', err);
    }
  };

  const clearCurrentReport = () => {
    setCurrentReport(null);
    setCurrentTranscriptions([]);
    setError(null);
  };



  const value: ReportContextType = {
    currentReport,
    currentTranscriptions,
    loading,
    error,
    createNewReport,
    loadReport,
    saveReport,
    deleteReport,
    addTranscription,
    updateTranscription,
    clearCurrentReport,
  };

  return (
    <ReportContext.Provider value={value}>
      {children}
    </ReportContext.Provider>
  );
}; 