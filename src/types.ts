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
  submitStatus: { [assessmentId: string]: "submitted" | "missing" | "unreleased" | "absent" }; // 繳交狀態（absent=缺考/缺交，與「還沒評」區分）
  adjustment?: number; // 個人額外加減分（看平時表現），直接加到累計加權分；可為負
  adjustmentNote?: string; // 加減分原因備註
}

export interface Course {
  id: string;
  name: string; // display name
  semester: string; // e.g. "114-2"
  assessments: AssessmentItem[];
  students: Student[];
}

// ====== UniCourse 整合：班級經營(B) / 跨學期成績(C) / 紙本考卷(A) ======

// ---- 班級經營（B）----
export interface HomeroomClass {
  classCode: string;        // 標準班級代碼（主鍵）
  className: string;        // 顯示名稱
  enrollmentYear?: number;  // 入學年（學年制）
}

export interface RosterStudent {
  studentId: string;        // 學號（主鍵）
  name: string;
  classCode?: string;       // 對應 HomeroomClass.classCode
  className?: string;       // 顯示用
  email?: string;
  housing?: "dorm" | "off-campus";
  dormRoom?: string;
  mobile?: string;
  address?: string;
  homeAddress?: string;
  homePhone?: string;
  parentName?: string;
  parentPhone1?: string;
  parentPhone2?: string;
  note?: string;
}

export interface ClassOfficer {
  id: string;               // uuid
  classCode: string;
  term: string;             // 如 "114-1"
  title: string;            // 職稱（班長、副班長…）
  studentId: string;
  appointedDate?: string;   // ISO date
  notes?: string;
}

// ---- 跨學期成績（C）----
export interface TranscriptEntry {
  id: string;               // uuid
  studentId: string;
  classCode?: string;
  year: number;             // 學年（如 114）
  semester: number;         // 學期（1 或 2）
  subject: string;
  score: number;
  credits: number;
  gradeType?: string;       // 必修/選修/通識…
  // isPassed 一律由 score >= 60 即時計算，不存
}

// ---- AI 紙本考卷（A）----
export type ExamQuestionType = "multiple-choice" | "true-false" | "fill-in-the-blank";
export type ExamDifficulty = "basic" | "medium" | "advanced";

export interface ExamQuestion {
  id: string;
  type: ExamQuestionType;
  question: string;
  options?: { [key: string]: string };  // 選擇題用 A/B/C/D
  correctAnswer: string;
  difficulty: ExamDifficulty;
  points: number;
}

export interface ExamPaper {
  id: string;
  courseId: string;
  title: string;
  topics: string;           // 章節範圍
  createdAt: number;
  questions: ExamQuestion[];
}

// ---- 擴充總狀態（新集合一律 optional，向後相容既有 db.json）----
export interface DatabaseState {
  courses: Course[];                  // 既有，不動
  homeroomClasses?: HomeroomClass[];  // 新（B）
  roster?: RosterStudent[];           // 新（B）
  transcripts?: TranscriptEntry[];    // 新（C）
  officers?: ClassOfficer[];          // 新（B）
  examPapers?: ExamPaper[];           // 新（A）
}

// Simulated file for local upload preview
export interface SimulatedUploadedFile {
  id: string;
  name: string;
  relativePath?: string; // 含上層資料夾的路徑（如 3B261060_謝昆霖/submission.txt），用來補學籍配對
  size: number;
  type: string;
  base64: string; // raw file content base64
  status: "idle" | "running" | "completed" | "failed" | "skipped";
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
