import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Report, CreateReportData, UpdateReportData } from '../types/firestore';

const REPORTS_COLLECTION = 'reports';

// Convert Firestore timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

export const reportService = {
  // Create a new report
  async createReport(data: CreateReportData): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, REPORTS_COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  },

  // Update an existing report
  async updateReport(reportId: string, data: UpdateReportData): Promise<void> {
    try {
      const reportRef = doc(db, REPORTS_COLLECTION, reportId);
      await updateDoc(reportRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating report:', error);
      throw error;
    }
  },

  // Delete a report
  async deleteReport(reportId: string): Promise<void> {
    try {
      const reportRef = doc(db, REPORTS_COLLECTION, reportId);
      await deleteDoc(reportRef);
    } catch (error) {
      console.error('Error deleting report:', error);
      throw error;
    }
  },

  // Get a single report by ID
  async getReport(reportId: string): Promise<Report | null> {
    try {
      const reportRef = doc(db, REPORTS_COLLECTION, reportId);
      const docSnap = await getDoc(reportRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          title: data.title,
          content: data.content,
          createdAt: timestampToDate(data.createdAt),
          updatedAt: timestampToDate(data.updatedAt),
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting report:', error);
      throw error;
    }
  },

  // Get all reports for a user
  async getUserReports(userId: string): Promise<Report[]> {
    try {
      const q = query(
        collection(db, REPORTS_COLLECTION),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const reports: Report[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push({
          id: doc.id,
          userId: data.userId,
          title: data.title,
          content: data.content,
          createdAt: timestampToDate(data.createdAt),
          updatedAt: timestampToDate(data.updatedAt),
        });
      });
      
      return reports;
    } catch (error) {
      console.error('Error getting user reports:', error);
      throw error;
    }
  },

  // Listen to real-time updates for user reports
  onUserReportsChange(userId: string, callback: (reports: Report[]) => void): () => void {
    const q = query(
      collection(db, REPORTS_COLLECTION),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const reports: Report[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push({
          id: doc.id,
          userId: data.userId,
          title: data.title,
          content: data.content,
          createdAt: timestampToDate(data.createdAt),
          updatedAt: timestampToDate(data.updatedAt),
        });
      });
      callback(reports);
    });
  },

  // Generate a title from content
  generateTitleFromContent(content: string): string {
    // Remove markdown headers and get first meaningful line
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const cleanLine = line.replace(/^#+\s*/, '').trim();
      if (cleanLine && cleanLine.length > 3) {
        // Take first 50 characters as title
        return cleanLine.length > 50 ? cleanLine.substring(0, 50) + '...' : cleanLine;
      }
    }
    
    // Fallback to timestamp-based title
    return `Laudo ${new Date().toLocaleDateString('pt-BR')}`;
  },
}; 