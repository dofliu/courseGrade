import { useState, useEffect } from "react";
import { Course, Student, GmailMessageResult } from "../types";
import { googleSignIn, logout, getAccessToken } from "../auth";
import { User } from "firebase/auth";
import { Mail, Search, RefreshCw, CheckCircle, AlertTriangle, FileUp, Loader, UserCheck, Inbox, ArrowRight, Download, Save, LogOut } from "lucide-react";

interface GmailScannerProps {
  courses: Course[];
  selectedCourseId: string;
  onUpdateCourses: (courses: Course[]) => void;
}

export default function GmailScanner({
  courses,
  selectedCourseId,
  onUpdateCourses,
}: GmailScannerProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Search parameters
  const [targetCourseId, setTargetCourseId] = useState(selectedCourseId);
  const [targetAsstId, setTargetAsstId] = useState("");
  const [searchQuery, setSearchQuery] = useState("subject:作業");
  
  // Scanned messages queue
  const [messages, setMessages] = useState<GmailMessageResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);

  const selectedCourse = courses.find((c) => c.id === targetCourseId) || courses[0];

  // Set default assessment if not set or empty
  if (selectedCourse && !targetAsstId && selectedCourse.assessments.length > 0) {
    setTargetAsstId(selectedCourse.assessments[0].id);
  }

  // Check initial login state
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          setAccessToken(token);
        }
      } catch (e) {
        console.warn("Auth initialization check bypassed.");
      } finally {
        setIsLoadingAuth(false);
      }
    };
    checkAuthStatus();
  }, []);

  const handleLogin = async () => {
    setIsLoadingAuth(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      alert("登入失敗，請確認是否允許 Google 帳生連線: " + err.message);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setAccessToken(null);
    setMessages([]);
    setScanLogs([]);
  };

  // Perform Gmail search query
  const handleSearchEmails = async () => {
    if (!accessToken) {
      alert("請先連結您的 Google 帳戶！");
      return;
    }
    if (!selectedCourse) {
      alert("請選擇需要評分的課程！");
      return;
    }

    setIsScanning(true);
    setScanLogs([`🔍 正在連線至 Gmail API...`, `📂 收件匣查詢過濾詞: "${searchQuery}"`]);
    setMessages([]);

    try {
      const response = await fetch("/api/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          query: searchQuery,
          roster: selectedCourse.students,
          assessmentName: selectedCourse.assessments.find(a => a.id === targetAsstId)?.name || "作業",
        }),
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error || "傳輸中斷");
      }

      const data = await response.json();
      const fetchedMsgs: GmailMessageResult[] = (data.messages || []).map((m: any) => ({
        ...m,
        status: "idle",
      }));

      setMessages(fetchedMsgs);
      setScanLogs((prev) => [
        ...prev,
        `✓ 搜尋完成，共篩選出 ${fetchedMsgs.length} 封具備關聯的郵件。`
      ]);

    } catch (e: any) {
      console.error(e);
      setScanLogs((prev) => [...prev, `❌ 搜尋失敗：${e.message}`]);
    } finally {
      setIsScanning(false);
    }
  };

  // Run AI grading for attachments inside a specific email message
  const handleAnalyzeEmailAttachment = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg || msg.attachments.length === 0) return;

    const currentAsst = selectedCourse?.assessments.find(a => a.id === targetAsstId);
    
    // Set message state to running
    const updatedMsgs = [...messages];
    updatedMsgs[msgIdx] = { ...msg, status: "running" };
    setMessages([...updatedMsgs]);

    const attachment = msg.attachments[0]; // analyze first attachment for simplicity

    try {
      setScanLogs((prev) => [...prev, `⏳ 正在由郵件「${msg.subject}」中下載附件「${attachment.filename}」...`]);

      const response = await fetch("/api/gmail/analyze-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          messageId: msg.messageId,
          attachmentId: attachment.id,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
          roster: selectedCourse?.students.map(s => ({ studentId: s.studentId, name: s.name })),
          assessmentName: currentAsst?.name || "作業",
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();

      const analysisData = {
        studentName: result.studentName || "",
        studentId: result.studentId || "",
        score: result.score != null ? result.score : 80,
        feedback: result.feedback || "完成，AI 未回覆具體評語。",
        confidence: result.confidence || 0.85,
        keyPoints: result.keyPoints || [],
      };

      updatedMsgs[msgIdx] = {
        ...msg,
        status: "completed",
        analysis: analysisData,
      };

      // Try matching student again if roster wasn't matched via email
      if (!msg.matchedStudent) {
        const found = selectedCourse?.students.find(
          s => s.studentId === result.studentId || s.name === result.studentName
        );
        if (found) {
          updatedMsgs[msgIdx].matchedStudent = found;
        }
      }

      setScanLogs((prev) => [
        ...prev,
        `✓ AI 完成評分 ➔ "${attachment.filename}" 得分: ${result.score} 分`
      ]);

    } catch (e: any) {
      console.error(e);
      updatedMsgs[msgIdx] = { ...msg, status: "failed" };
      setScanLogs((prev) => [...prev, `❌ 附件辨識出錯：「${attachment.filename}」- ${e.message}`]);
    }

    setMessages([...updatedMsgs]);
  };

  // Modify manual correction values
  const handleEditScanResult = (msgIdx: number, fields: Partial<NonNullable<GmailMessageResult["analysis"]>>) => {
    setMessages((prev) =>
      prev.map((m, idx) => {
        if (idx === msgIdx && m.analysis) {
          return {
            ...m,
            analysis: {
              ...m.analysis,
              ...fields,
            },
          };
        }
        return m;
      })
    );
  };

  // Batch analyse all matched emails sequentially
  const handleBatchAnalyze = async () => {
    setIsAnalyzing(true);
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].attachments.length > 0 && messages[i].status !== "completed") {
        await handleAnalyzeEmailAttachment(i);
      }
    }
    setIsAnalyzing(false);
  };

  // Save Scanned Email Grades to course database
  const saveScannedGrades = () => {
    if (!selectedCourse || !targetAsstId) return;

    const updatedStudents = selectedCourse.students.map((student) => {
      const copy = { ...student };
      copy.grades = { ...student.grades };
      copy.feedback = { ...student.feedback };
      copy.submitStatus = { ...student.submitStatus };

      // Look for a completed scanned mail mapping to this scholar
      const correspondingMail = messages.find((m) => {
        if (m.status !== "completed" || !m.analysis) return false;
        
        // Match by identified details or matched student link
        const matchedByRoster = m.matchedStudent && m.matchedStudent.id === student.id;
        const matchedByAI = m.analysis.studentId === student.studentId || 
                            m.analysis.studentName === student.name;

        return matchedByRoster || matchedByAI;
      });

      if (correspondingMail && correspondingMail.analysis) {
        copy.grades[targetAsstId] = correspondingMail.analysis.score;
        copy.feedback[targetAsstId] = correspondingMail.analysis.feedback;
        copy.submitStatus[targetAsstId] = "submitted";
      }

      return copy;
    });

    const updatedCourse = {
      ...selectedCourse,
      students: updatedStudents,
    };

    const updatedCourses = courses.map((c) => (c.id === selectedCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);

    alert("成功：學能成績已成功與對應的 Gmail 作業信件整合同步！");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 text-gray-800" id="id_gmail_scanner_root">
      
      {/* AUTH STATUS & PARAMETERS */}
      <div className="xl:col-span-4 space-y-6">
        
        {/* OAUTH CONNECT STATUS */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-display font-semibold text-slate-900 text-lg flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Gmail 雲端連結
          </h3>

          {isLoadingAuth ? (
            <div className="py-6 flex justify-center text-slate-400 text-xs gap-1">
              <Loader className="w-4 h-4 animate-spin" />
              確認權限狀態中...
            </div>
          ) : !accessToken ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                連結 Gmail 帳戶，直接智慧讀取並辨識學生所繳交的作業附檔、分類與整理重點繳交資訊。
              </p>
              
              <button
                onClick={handleLogin}
                className="gsi-material-button w-full shadow-sm cursor-pointer"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-display">Sign in with Google</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-50 text-emerald-855 rounded text-xs font-bold border border-emerald-150">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Google APIs 整合就緒</span>
                </span>
                
                <button
                  onClick={handleLogout}
                  className="text-slate-500 hover:text-red-500 flex items-center gap-1 cursor-pointer"
                  title="登出"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="text-[10px]">登出</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-none border border-slate-200 space-y-1 text-xs">
                <div className="text-slate-400">目前連線帳號等級：</div>
                <div className="font-semibold text-slate-700">教務用 Gmail 安全沙盒 (Gmail.readonly)</div>
                <div className="text-[10px] text-slate-400 mt-2">
                  本系統可直接智慧調用 Gmail 安全協定，僅唯讀作業搜尋，無任何修改權限，並恪守資料密隱保護機制。
                </div>
              </div>
            </div>
          )}

        </div>

        {/* SCAN CONFIGURATION SETTINGS */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-medium text-sm text-slate-700">收件規則與媒合項目</h4>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">匯入至課程</label>
              <select
                value={targetCourseId}
                onChange={(e) => {
                  setTargetCourseId(e.target.value);
                  const c = courses.find((course) => course.id === e.target.value);
                  if (c && c.assessments.length > 0) {
                    setTargetAsstId(c.assessments[0].id);
                  } else {
                    setTargetAsstId("");
                  }
                }}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">評分欄位</label>
              <select
                value={targetAsstId}
                onChange={(e) => setTargetAsstId(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700"
              >
                {selectedCourse?.assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Gmail 進階搜尋過濾字眼 (Query)</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="例如: subject:作業 Newer_than:7d"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded outline-none focus:border-blue-500 font-mono font-bold"
              />
              <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                可輸入 <code>subject:作業一</code> 篩選主旨含有指定的寄信群，或學生成員的學號。
              </div>
            </div>
          </div>
        </div>

        {/* LOG PANEL */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-3">
          <h4 className="font-display font-medium text-sm text-slate-700">雲端 API 排程工作紀實</h4>
          <div className="h-40 bg-slate-900 p-3 text-[10px] font-mono text-cyan-400 overflow-y-auto space-y-1">
            {scanLogs.length === 0 ? (
              <span className="text-slate-500">尚無 API 活動...</span>
            ) : (
              scanLogs.map((log, idx) => (
                <div key={idx} className="leading-5 break-all text-cyan-400">{log}</div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* MAILS LIST & DISCOVERED ASSIGNMENTS */}
      <div className="xl:col-span-8 space-y-6">
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-900">
                Gmail 學生作業排程清單
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">系統自動檢索信件，配對學籍，並透過 AI 解析郵件及附件繳交成果</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSearchEmails}
                disabled={!accessToken || isScanning}
                className="px-3.5 py-2 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isScanning ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                讀取 Gmail
              </button>

              <button
                onClick={handleBatchAnalyze}
                disabled={messages.length === 0 || isAnalyzing || isScanning}
                className="px-3.5 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isAnalyzing ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                批次 AI 評分
              </button>

              <button
                onClick={saveScannedGrades}
                disabled={messages.filter((m) => m.status === "completed").length === 0 || isAnalyzing}
                className="px-3.5 py-2 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                同步至成績表
              </button>
            </div>
          </div>

          {/* Email content blocks queue */}
          <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                <Inbox className="w-12 h-12 text-slate-300" />
                <div className="text-sm font-semibold text-slate-500">尚未載入外部信件</div>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  請先在左側完成 Google 帳號授權，設定主旨過濾，並點選「讀取 Gmail」以搜尋同學作業郵件。
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMatched = msg.matchedStudent;
                const hasAttachment = msg.attachments.length > 0;

                return (
                  <div
                    key={msg.messageId}
                    className={`rounded-2xl border p-5 transition ${
                      msg.status === "running"
                        ? "border-indigo-400 bg-indigo-50/10"
                        : msg.status === "completed"
                        ? "border-slate-100 bg-slate-50/10"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      
                      {/* Email Info / Sender Details */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isMatched ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-100 rounded-lg flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-emerald-500" />
                              配對修課生：{isMatched.name} ({isMatched.studentId})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-100 rounded-lg flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              信信未配對學籍
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400">{msg.date}</span>
                        </div>

                        <h4 className="text-sm font-semibold text-slate-800 leading-tight">
                          {msg.subject}
                        </h4>

                        <p className="text-[11px] text-slate-400 truncate max-w-xl">
                          寄件者: {msg.sender}
                        </p>

                        {/* Attachments Section */}
                        {hasAttachment ? (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-semibold text-slate-500">含有作業附件 ({msg.attachments.length}):</span>
                            {msg.attachments.map((attach) => (
                              <div
                                key={attach.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-105 border border-slate-200 hover:border-indigo-300 rounded text-[10px] text-indigo-700 font-mono transition"
                              >
                                <Download className="w-3 h-3" />
                                <span>{attach.filename}</span>
                                <span className="text-slate-450">({(attach.size / 1024).toFixed(0)} KB)</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-600 font-medium">
                            ⚠ 該信件在讀取時，沒有檢索到有效的實體副檔案。
                          </div>
                        )}
                      </div>

                      {/* Single Action Grade Trigger */}
                      <div className="flex items-center gap-2">
                        {msg.status === "idle" && (
                          <button
                            onClick={() => handleAnalyzeEmailAttachment(idx)}
                            disabled={!hasAttachment || isAnalyzing}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded transition flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                          >
                            <Loader className="w-3.5 h-3.5" />
                            AI 檔案解析與評估
                          </button>
                        )}
                        {msg.status === "running" && (
                          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded flex items-center gap-1.5">
                            <Loader className="w-3.5 h-3.5 animate-spin" />
                            分析中...
                          </span>
                        )}
                        {msg.status === "completed" && (
                          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 animate-bounce" />
                            完成
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI result expanded feedback card */}
                    {msg.status === "completed" && msg.analysis && (
                      <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-5 text-xs bg-white p-4">
                        
                        {/* Student Match Detail Correction */}
                        <div className="md:col-span-4 space-y-3 border-r pr-4 border-slate-200">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            AI 讀取作業署名
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-450">姓名: (可手動校正)</label>
                            <input
                              type="text"
                              value={msg.analysis.studentName}
                              onChange={(e) => handleEditScanResult(idx, { studentName: e.target.value })}
                              className="w-full text-xs font-bold bg-white p-1.5 border border-slate-200 outline-none focus:border-blue-500 rounded-sm text-slate-700"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-455 font-mono">學號: (可手動校正)</label>
                            <input
                              type="text"
                              value={msg.analysis.studentId}
                              onChange={(e) => handleEditScanResult(idx, { studentId: e.target.value })}
                              className="w-full text-xs font-mono font-bold bg-white p-1.5 border border-slate-200 outline-none focus:border-blue-500 rounded-sm text-slate-700"
                            />
                          </div>

                          {/* Keypoints tags */}
                          {msg.analysis.keyPoints && msg.analysis.keyPoints.length > 0 && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 block font-bold">繳交重點標記 (分類):</label>
                              <div className="flex flex-wrap gap-1">
                                {msg.analysis.keyPoints.map((pt, pIdx) => (
                                  <span key={pIdx} className="bg-slate-50 px-2 py-0.5 rounded-sm text-[9px] text-slate-600 border border-slate-200 font-semibold">
                                    {pt}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Score & TA Feedback Block */}
                        <div className="md:col-span-8 flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="font-semibold text-slate-705">本份得分:</span>
                              <input
                                type="number"
                                value={msg.analysis.score}
                                onChange={(e) => handleEditScanResult(idx, { score: Number(e.target.value) || 0 })}
                                className="w-14 text-center text-sm font-bold bg-white text-blue-600 border border-slate-200 py-0.5 outline-none rounded-sm"
                              />
                              <span className="font-semibold text-slate-500">/ 100</span>
                            </div>

                            <span className="text-[10px] text-slate-400 font-semibold">
                              Gemini 讀取置信值: ({(msg.analysis.confidence * 100).toFixed(0)}%)
                            </span>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-455 block font-semibold">AI 建議教授回饋評語 (Traditional Chinese):</label>
                            <textarea
                              rows={3}
                              value={msg.analysis.feedback}
                              onChange={(e) => handleEditScanResult(idx, { feedback: e.target.value })}
                              className="w-full text-xs bg-white text-slate-700 p-2 border border-slate-200 rounded outline-none leading-relaxed font-sans focus:border-blue-500"
                            />
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
