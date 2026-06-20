import { useState, useEffect, useRef } from "react";
import { Course, Student, GmailMessageResult, GmailLabel } from "../types";
import { googleSignIn, logout, getStoredAuth } from "../auth";
import { Mail, Search, RefreshCw, CheckCircle, AlertTriangle, FileUp, Loader, UserCheck, Inbox, ArrowRight, Download, Save, LogOut } from "lucide-react";

// Gmail 系統標籤的中文顯示名（使用者自建標籤直接顯示原名）
const SYSTEM_LABEL_NAMES: Record<string, string> = {
  INBOX: "收件匣",
  IMPORTANT: "重要",
  STARRED: "已加星號",
  SENT: "寄件備份",
  UNREAD: "未讀",
  CATEGORY_PERSONAL: "類別：個人",
  CATEGORY_UPDATES: "類別：最新快訊",
  CATEGORY_FORUMS: "類別：論壇",
  CATEGORY_SOCIAL: "類別：社交網路",
  CATEGORY_PROMOTIONS: "類別：促銷內容",
};
const labelDisplayName = (l: GmailLabel) =>
  l.type === "system" ? SYSTEM_LABEL_NAMES[l.name] || l.name : l.name;

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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Search parameters
  const [targetCourseId, setTargetCourseId] = useState(selectedCourseId);
  const [targetAsstId, setTargetAsstId] = useState("");
  const [searchQuery, setSearchQuery] = useState("subject:作業");

  // 信件匣（Gmail 標籤）選擇，用來把掃描範圍限定在某個資料夾
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string>("");
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);

  // Scanned messages queue
  const [messages, setMessages] = useState<GmailMessageResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);

  // 本機暫存：上次拉取時間（null 表示這個課程項目尚無暫存）
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  const selectedCourse = courses.find((c) => c.id === targetCourseId) || courses[0];

  // 永遠指向最新的 courses，讓自動登記在連續批次中也能基於最新資料合併、不會互相覆蓋
  const coursesRef = useRef(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  // 永遠指向最新的 messages — 批次評分時若用閉包快照會互相覆蓋（已完成的被洗回未評），故改用 ref
  const messagesRef = useRef<GmailMessageResult[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 把指定學生在目前評分項目標記為「已繳待評」(submitted)，但不動分數
  const markStudentsSubmitted = (studentIds: string[]) => {
    if (!targetAsstId || studentIds.length === 0) return;
    const latest = coursesRef.current;
    const course = latest.find((c) => c.id === targetCourseId) || latest[0];
    if (!course) return;

    let changed = false;
    const updatedStudents = course.students.map((s) => {
      const notYetSubmitted = s.submitStatus[targetAsstId] !== "submitted";
      const notYetGraded = s.grades[targetAsstId] == null;
      if (studentIds.includes(s.id) && notYetSubmitted && notYetGraded) {
        changed = true;
        return { ...s, submitStatus: { ...s.submitStatus, [targetAsstId]: "submitted" as const } };
      }
      return s;
    });
    if (!changed) return;

    onUpdateCourses(latest.map((c) => (c.id === course.id ? { ...course, students: updatedStudents } : c)));
  };

  // Set default assessment if not set or empty
  if (selectedCourse && !targetAsstId && selectedCourse.assessments.length > 0) {
    setTargetAsstId(selectedCourse.assessments[0].id);
  }

  // 元件掛載時，從 sessionStorage 還原先前的登入（切 tab / 重整都不必重新登入）
  useEffect(() => {
    try {
      const stored = getStoredAuth();
      if (stored) {
        setAccessToken(stored.accessToken);
        setUserEmail(stored.email);
      }
    } catch (e) {
      console.warn("Auth initialization check bypassed.");
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // 登入後載入使用者的 Gmail 信件匣清單，讓老師先挑要掃描的資料夾
  useEffect(() => {
    if (!accessToken) {
      setLabels([]);
      return;
    }
    const loadLabels = async () => {
      setIsLoadingLabels(true);
      try {
        const r = await fetch("/api/gmail/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        if (!r.ok) throw new Error((await r.json()).error || "讀取信件匣失敗");
        const data = await r.json();
        setLabels(data.labels || []);
      } catch (e: any) {
        setScanLogs((prev) => [...prev, `⚠ 信件匣清單讀取失敗：${e.message}`]);
      } finally {
        setIsLoadingLabels(false);
      }
    };
    loadLabels();
  }, [accessToken]);

  // 開啟頁面 / 切換課程或評分項目時，自動載入上次拉取到本機的批次（免登入、免連 Gmail）
  useEffect(() => {
    if (!targetCourseId || !targetAsstId) return;
    let cancelled = false;
    const loadCache = async () => {
      setIsLoadingCache(true);
      try {
        const r = await fetch(
          `/api/gmail/cache?courseId=${encodeURIComponent(targetCourseId)}&assessmentId=${encodeURIComponent(targetAsstId)}`
        );
        if (!r.ok) throw new Error("讀取暫存失敗");
        const data = await r.json();
        if (cancelled) return;
        const msgs: GmailMessageResult[] = (data.messages || []).map((m: any) => ({
          ...m,
          status: m.analysis ? "completed" : m.unsupported ? "unsupported" : "idle",
        }));
        setMessages(msgs);
        setPulledAt(data.pulledAt || null);
        setScanLogs(
          msgs.length > 0
            ? [`📁 已載入本機暫存批次（${msgs.length} 封信），可直接評分，不需重新連線 Gmail。`]
            : []
        );
      } catch {
        if (!cancelled) {
          setMessages([]);
          setPulledAt(null);
        }
      } finally {
        if (!cancelled) setIsLoadingCache(false);
      }
    };
    loadCache();
    return () => {
      cancelled = true;
    };
  }, [targetCourseId, targetAsstId]);

  // 把目前 messages 寫回本機暫存（評分 / 校正後呼叫），下次開啟仍在
  const saveCache = (msgs: GmailMessageResult[]) => {
    if (!targetCourseId || !targetAsstId) return;
    fetch("/api/gmail/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: targetCourseId, assessmentId: targetAsstId, pulledAt, messages: msgs }),
    }).catch(() => {});
  };

  const handleLogin = async () => {
    setIsLoadingAuth(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUserEmail(result.email);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      alert("登入失敗，請確認是否允許 Google 帳號連線: " + err.message);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUserEmail(null);
    setAccessToken(null);
    // 不清掉 messages — 本機暫存的批次仍可離線複查與評分
  };

  // 讀取 Gmail：一次把整批信件 + 附件下載到本機（需登入；之後評分/複查都不必再連線）
  const handleSearchEmails = async () => {
    if (!accessToken) {
      alert("請先連結您的 Google 帳戶才能讀取新信件！");
      return;
    }
    if (!selectedCourse) {
      alert("請選擇需要評分的課程！");
      return;
    }

    const selectedLabel = labels.find((l) => l.id === selectedLabelId);
    const labelText = selectedLabel ? labelDisplayName(selectedLabel) : "全部郵件（不限信件匣）";

    setIsScanning(true);
    setScanLogs([
      `🔍 正在連線 Gmail，整批下載信件與附件到本機...`,
      `📂 信件匣:「${labelText}」　過濾詞: "${searchQuery || "（無，僅依信件匣）"}"`,
    ]);

    try {
      const response = await fetch("/api/gmail/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          query: searchQuery,
          labelIds: selectedLabelId ? [selectedLabelId] : undefined,
          roster: selectedCourse.students,
          courseId: targetCourseId,
          assessmentId: targetAsstId,
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
      setPulledAt(data.pulledAt || null);

      const attachCount = fetchedMsgs.reduce(
        (n, m) => n + m.attachments.filter((a) => a.localFile).length,
        0
      );
      setScanLogs((prev) => [
        ...prev,
        `✓ 已下載 ${fetchedMsgs.length} 封信、${attachCount} 個附件到本機，之後評分免再連線。`,
      ]);

      // 對「以信箱直接配對到」的學生，立即登記為「已繳待評」（分數仍空）
      const matchedIds = fetchedMsgs
        .filter((m) => m.matchedStudent)
        .map((m) => m.matchedStudent!.id);
      if (matchedIds.length > 0) {
        markStudentsSubmitted(matchedIds);
        setScanLogs((prev) => [
          ...prev,
          `📝 已自動將 ${matchedIds.length} 位配對成功的學生登記為「已繳待評」。`,
        ]);
      }

    } catch (e: any) {
      console.error(e);
      setScanLogs((prev) => [...prev, `❌ 讀取失敗：${e.message}`]);
    } finally {
      setIsScanning(false);
    }
  };

  // Run AI grading for attachments inside a specific email message
  const handleAnalyzeEmailAttachment = async (msgIdx: number) => {
    const msg = messagesRef.current[msgIdx];
    if (!msg || msg.attachments.length === 0) return;

    const currentAsst = selectedCourse?.assessments.find(a => a.id === targetAsstId);
    const attachment = msg.attachments[0];
    // 後端會把這封信的所有附件一起評（多頁掃描＝同一份），log 用整體描述
    const attachLabel =
      msg.attachments.length > 1
        ? `${attachment.filename} 等 ${msg.attachments.length} 個附件`
        : attachment.filename;

    // 以最新的 messagesRef 為基準套用單封更新（同步更新 ref + state），批次中不互相覆蓋
    const applyUpdate = (patch: Partial<GmailMessageResult>): GmailMessageResult[] => {
      const next = messagesRef.current.map((m, i) => (i === msgIdx ? { ...m, ...patch } : m));
      messagesRef.current = next;
      setMessages(next);
      return next;
    };

    applyUpdate({ status: "running" });

    try {
      setScanLogs((prev) => [...prev, `⏳ 正在用本機附件「${attachLabel}」進行 AI 評分...`]);

      // 用本機已下載的附件評分，完全不需要 Google token
      const response = await fetch("/api/gmail/analyze-cached", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: targetCourseId,
          assessmentId: targetAsstId,
          messageId: msg.messageId,
          roster: selectedCourse?.students.map(s => ({ studentId: s.studentId, name: s.name })),
          assessmentName: currentAsst?.name || "作業",
          rubric: currentAsst?.rubric || "",
        }),
      });

      if (!response.ok) {
        const errObj = await response.json().catch(() => ({}));
        throw new Error(errObj.error || "評分失敗");
      }

      const result = await response.json();

      // 不支援的格式（如 .xlsx）— 標記略過，不算失敗、批次不會再重試
      if (result.unsupported) {
        const next = applyUpdate({ status: "unsupported", unsupported: true });
        setScanLogs((prev) => [...prev, `⏭ 略過「${attachLabel}」：${result.error || "格式無法 AI 評分"}`]);
        saveCache(next);
        return;
      }

      const analysisData = {
        studentName: result.studentName || "",
        studentId: result.studentId || "",
        score: result.score != null ? result.score : 80,
        feedback: result.feedback || "完成，AI 未回覆具體評語。",
        confidence: result.confidence || 0.85,
        keyPoints: result.keyPoints || [],
      };

      const patch: Partial<GmailMessageResult> = { status: "completed", analysis: analysisData };

      // Try matching student again if roster wasn't matched via email
      if (!msg.matchedStudent) {
        const found = selectedCourse?.students.find(
          s => s.studentId === result.studentId || s.name === result.studentName
        );
        if (found) {
          patch.matchedStudent = found;
          patch.matchedBy = "ai";
          // AI 辨識補配對成功 → 也登記為「已繳待評」
          markStudentsSubmitted([found.id]);
        }
      }

      const next = applyUpdate(patch);
      setScanLogs((prev) => [
        ...prev,
        `✓ AI 完成評分 ➔ "${attachLabel}" 得分: ${result.score} 分`
      ]);
      saveCache(next);

    } catch (e: any) {
      console.error(e);
      const next = applyUpdate({ status: "failed" });
      setScanLogs((prev) => [...prev, `❌ 附件辨識出錯：「${attachLabel}」- ${e.message}`]);
      saveCache(next);
    }
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
    const list = messagesRef.current;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      // 已評分(completed) 與 格式不支援(unsupported) 都跳過，只處理未評/失敗且有附件的
      if (m.attachments.length > 0 && m.status !== "completed" && m.status !== "unsupported" && !m.unsupported) {
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
              <div className="flex items-center justify-between p-3 bg-emerald-50 text-emerald-800 rounded text-xs font-bold border border-emerald-200">
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
                <div className="text-slate-400">目前連線帳號：</div>
                <div className="font-semibold text-slate-700 break-all">{userEmail || "已連線 (Gmail.readonly)"}</div>
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
              <label className="block text-slate-600 mb-1 font-semibold flex items-center justify-between">
                <span>要讀取的信件匣 (Gmail 標籤)</span>
                {isLoadingLabels && <span className="text-[10px] text-slate-400 font-normal">載入中…</span>}
              </label>
              <select
                value={selectedLabelId}
                onChange={(e) => setSelectedLabelId(e.target.value)}
                disabled={!accessToken || isLoadingLabels}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700 disabled:opacity-50"
              >
                <option value="">全部郵件（不限信件匣）</option>
                {labels.some((l) => l.type === "user") && (
                  <optgroup label="我的標籤 / 資料夾">
                    {labels
                      .filter((l) => l.type === "user")
                      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))
                      .map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="系統信件匣">
                  {labels
                    .filter((l) => l.type === "system" && ["INBOX", "IMPORTANT", "STARRED", "CATEGORY_PERSONAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"].includes(l.name))
                    .map((l) => (
                      <option key={l.id} value={l.id}>{labelDisplayName(l)}</option>
                    ))}
                </optgroup>
              </select>
              <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                先挑學生作業所在的信件匣，再搭配下方搜尋條件，避免掃描整個信箱。{!accessToken && "（請先登入 Google）"}
              </div>
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

          {/* 本機暫存提示：信件與附件已存本機，可離線評分 */}
          {pulledAt && (
            <div className="flex items-start gap-2 text-[11px] bg-emerald-50 border border-emerald-100 text-emerald-800 rounded px-3 py-2 leading-relaxed">
              <Save className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span>
                已從本機暫存載入此批次（拉取時間 {new Date(pulledAt).toLocaleString()}）。信件與附件都存在本機，
                <strong>評分與複查不需再連線 Gmail</strong>；要抓新信時再點「讀取 Gmail」即可。
              </span>
            </div>
          )}

          {/* Email content blocks queue */}
          <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                <Inbox className="w-12 h-12 text-slate-300" />
                <div className="text-sm font-semibold text-slate-500">
                  {isLoadingCache ? "正在載入本機暫存…" : "此課程項目尚無暫存批次"}
                </div>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  第一次請在左側登入 Google、挑信件匣，點「讀取 Gmail」把整批信件與附件下載到本機。
                  之後重開此頁會自動載入，評分與複查都不必再連線。
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
                              {msg.matchedBy && (
                                <span className="opacity-70 font-normal">
                                  · 依{({ email: "信箱", studentId: "學號", name: "姓名", ai: "AI" } as Record<string, string>)[msg.matchedBy]}比對
                                </span>
                              )}
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 hover:border-indigo-300 rounded text-[10px] text-indigo-700 font-mono transition"
                              >
                                <Download className="w-3 h-3" />
                                <span>{attach.filename}</span>
                                <span className="text-slate-400">({(attach.size / 1024).toFixed(0)} KB)</span>
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
                        {msg.status === "unsupported" && (
                          <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold rounded flex items-center gap-1" title="此格式無法 AI 直接評分，請手動輸入分數或請學生改交 PDF">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            格式不支援 · 請手動
                          </span>
                        )}
                        {msg.status === "failed" && (
                          <button
                            onClick={() => handleAnalyzeEmailAttachment(idx)}
                            disabled={isAnalyzing}
                            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-semibold rounded flex items-center gap-1 hover:bg-red-100 transition disabled:opacity-50 cursor-pointer"
                            title="評分失敗，點擊重試"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            失敗，重試
                          </button>
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
                            <label className="text-[10px] text-slate-400">姓名: (可手動校正)</label>
                            <input
                              type="text"
                              value={msg.analysis.studentName}
                              onChange={(e) => handleEditScanResult(idx, { studentName: e.target.value })}
                              className="w-full text-xs font-bold bg-white p-1.5 border border-slate-200 outline-none focus:border-blue-500 rounded-sm text-slate-700"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-mono">學號: (可手動校正)</label>
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
                              <span className="font-semibold text-slate-700">本份得分:</span>
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
                            <label className="text-[10px] text-slate-400 block font-semibold">AI 建議教授回饋評語 (Traditional Chinese):</label>
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
