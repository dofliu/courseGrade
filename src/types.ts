/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AssessmentItem {
  id: string; // unique item id, e.g. "hw1"
  name: string; // displays "作業 1"
  weight: number; // weight percentage, e.g. 15 for 15%
  type: "hw" | "quiz" | "midterm" | "final" | "project" | "other";
}

export interface Student {
  id: string; // internal UUID or string
  studentId: string; // user-visible ID, e.g., "111306021"
  name: string; // real name
  email: string; // email matching gmail sender
  grades: { [assessmentId: string]: number }; // score dictionary, e.g. { "hw1": 85 }
  feedback: { [assessmentId: string]: string }; // details/comments dictionary, e.g. { "hw1": "作業優秀" }
  submitStatus: { [assessmentId: string]: "submitted" | "missing" | "unreleased" }; // tracking submit state
}

export interface Course {
  id: string;
  name: string; // display name
  semester: string; // e.g. "114-2"
  assessments: AssessmentItem[];
  students: Student[];
}

export interface DatabaseState {
  courses: Course[];
}

// Simulated file for local upload preview
export interface SimulatedUploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  base64: string; // raw file content base64
  status: "idle" | "running" | "completed" | "failed";
  error?: string;
  analysisResult?: {
    studentName: string;
    studentId: string;
    score: number;
    feedback: string;
    confidence: number;
  };
}

// Gmail analyzed record
export interface GmailMessageResult {
  messageId: string;
  subject: string;
  sender: string;
  fromEmail: string;
  date: string;
  bodyExcerpt: string;
  attachments: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
  matchedStudent: Student | null;
  status: "idle" | "running" | "completed" | "failed";
  analysis?: {
    studentName: string;
    studentId: string;
    score: number;
    feedback: string;
    confidence: number;
    keyPoints?: string[];
  };
}
