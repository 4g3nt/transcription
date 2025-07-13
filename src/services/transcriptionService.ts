import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Transcription, CreateTranscriptionData, UpdateTranscriptionData } from '../types/firestore';

const REPORTS_COLLECTION = 'reports';
const TRANSCRIPTIONS_SUBCOLLECTION = 'transcriptions';

// Convert Firestore timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

export const transcriptionService = {
  // Create a new transcription in a report's subcollection
  async createTranscription(reportId: string, data: CreateTranscriptionData): Promise<string> {
    try {
      const transcriptionsRef = collection(db, REPORTS_COLLECTION, reportId, TRANSCRIPTIONS_SUBCOLLECTION);
      const docRef = await addDoc(transcriptionsRef, {
        ...data,
        timestamp: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating transcription:', error);
      throw error;
    }
  },

  // Update an existing transcription
  async updateTranscription(reportId: string, transcriptionId: string, data: UpdateTranscriptionData): Promise<void> {
    try {
      const transcriptionRef = doc(
        db,
        REPORTS_COLLECTION,
        reportId,
        TRANSCRIPTIONS_SUBCOLLECTION,
        transcriptionId
      );

      // Only update fields that are defined in data
      const updatePayload: Partial<UpdateTranscriptionData> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          (updatePayload as any)[key] = value;
        }
      });

      if (Object.keys(updatePayload).length === 0) {
        // Nothing to update, early return
        return;
      }

      await updateDoc(transcriptionRef, updatePayload);
    } catch (error) {
      console.error('Error updating transcription:', error);
      throw error;
    }
  },

  // Delete a transcription
  async deleteTranscription(reportId: string, transcriptionId: string): Promise<void> {
    try {
      const transcriptionRef = doc(db, REPORTS_COLLECTION, reportId, TRANSCRIPTIONS_SUBCOLLECTION, transcriptionId);
      await deleteDoc(transcriptionRef);
    } catch (error) {
      console.error('Error deleting transcription:', error);
      throw error;
    }
  },

  // Get all transcriptions for a report
  async getReportTranscriptions(reportId: string): Promise<Transcription[]> {
    try {
      const q = query(
        collection(db, REPORTS_COLLECTION, reportId, TRANSCRIPTIONS_SUBCOLLECTION),
        orderBy('timestamp', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const transcriptions: Transcription[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transcriptions.push({
          id: doc.id,
          text: data.text,
          original: data.original,
          audioData: data.audioData,
          timestamp: timestampToDate(data.timestamp),
          disliked: data.disliked || false,
          edited: data.edited || false,
          userId: data.userId,
        });
      });
      
      return transcriptions;
    } catch (error) {
      console.error('Error getting report transcriptions:', error);
      throw error;
    }
  },

  // Listen to real-time updates for report transcriptions
  onReportTranscriptionsChange(reportId: string, callback: (transcriptions: Transcription[]) => void): () => void {
    const q = query(
      collection(db, REPORTS_COLLECTION, reportId, TRANSCRIPTIONS_SUBCOLLECTION),
      orderBy('timestamp', 'asc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const transcriptions: Transcription[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transcriptions.push({
          id: doc.id,
          text: data.text,
          original: data.original,
          audioData: data.audioData,
          timestamp: timestampToDate(data.timestamp),
          disliked: data.disliked || false,
          edited: data.edited || false,
          userId: data.userId,
        });
      });
      callback(transcriptions);
    });
  },

  // Update transcription when edited (save original if first edit)
  async updateTranscriptionWithCorrection(
    reportId: string, 
    transcriptionId: string, 
    newText: string, 
    originalText: string,
    isFirstEdit: boolean
  ): Promise<void> {
    try {
      const updateData: UpdateTranscriptionData = {
        text: newText,
        edited: true,
        disliked: true,
      };

      // If this is the first edit, save the original text
      if (isFirstEdit) {
        updateData.original = originalText;
      }

      await this.updateTranscription(reportId, transcriptionId, updateData);
    } catch (error) {
      console.error('Error updating transcription with correction:', error);
      throw error;
    }
  },

  // Convert ArrayBuffer to base64 string for storage
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  // Convert base64 string back to ArrayBuffer
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  },
}; 