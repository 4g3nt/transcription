export interface Report {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transcription {
  id: string;
  text: string;
  original?: string; // Original text before correction
  audioData: string; // Base64 encoded audio
  timestamp: Date;
  disliked: boolean;
  edited: boolean;
  userId: string;
}

export interface CreateReportData {
  title: string;
  content: string;
  userId: string;
}

export interface UpdateReportData {
  title?: string;
  content?: string;
  updatedAt: Date;
}

export interface CreateTranscriptionData {
  text: string;
  audioData: string;
  timestamp: Date;
  disliked: boolean;
  edited: boolean;
  userId: string;
}

export interface UpdateTranscriptionData {
  text?: string;
  original?: string;
  disliked?: boolean;
  edited?: boolean;
} 