/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AssessmentItem {
  id: string; // unique item id, e.g. "hw1"
  name: string; // displays "作業 1"
  weight: number; // weight percentage, e.g. 15 for 15%
  type: "hw" | "quiz" | "midterm" | "final" | "project" | "other";
  rubric?: string; // 評分方式與標準，供 AI 評分時依據（例如：配分、評分重點、扣分原則）
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

// Gmail 信件匣（標籤）— 讓使用者先挑要掃描的資料夾，縮小範圍
export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
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
    localFile?: string | null; // 已下載到本機磁碟的檔名（離線暫存用）
  }[];
  matchedStudent: Student | null;
  matchedBy?: "email" | "studentId" | "name" | "ai" | null; // 配對依據（信箱/學號/姓名/AI）
  status: "idle" | "running" | "completed" | "failed" | "unsupported";
  unsupported?: boolean; // 附件格式無法 AI 評分（如 .xlsx），批次會略過
  analysis?: {
    studentName: string;
    studentId: string;
    score: number;
    feedback: string;
    confidence: number;
    keyPoints?: string[];
  };
}
