import { useState, useEffect } from "react";
import { DatabaseState, Course } from "./types";
import CourseSetup from "./components/CourseSetup";
import FolderAnalyzer from "./components/FolderAnalyzer";
import GmailScanner from "./components/GmailScanner";
import GradingDashboard from "./components/GradingDashboard";
import GradeBook from "./components/GradeBook";
import SubmissionOverview from "./components/SubmissionOverview";
import ClassroomTools from "./components/ClassroomTools";
import ExamGenerator from "./components/ExamGenerator";
import { GraduationCap, BarChart3, FolderSync, MailQuestion, Sheet, Save, RefreshCw, Layers, Check, Loader, ClipboardList, Grid3x3, FileText } from "lucide-react";

export default function App() {
  const [dbState, setDbState] = useState<DatabaseState | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "courses" | "folder" | "gmail" | "gradebook" | "submissions" | "classroom" | "exam">("dashboard");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null); // 儲存失敗時顯示，避免「以為存到了其實沒存」

  // Load database on startup from Express backend
  useEffect(() => {
    const fetchDB = async () => {
      try {
        const response = await fetch("/api/db");
        if (!response.ok) throw new Error("Failed to load initial database.");
        const data = await response.json();
        setDbState(data);
        if (data.courses && data.courses.length > 0) {
          setSelectedCourseId(data.courses[0].id);
        }
      } catch (e) {
        console.error("Database connection failed, using offline fallback.", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDB();
  }, []);

  // Save changes to Express backend
  const handleSaveDatabase = async (nextState: DatabaseState) => {
    setDbState(nextState);
    setIsSaving(true);
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextState),
      });
      if (!response.ok) {
        const obj = await response.json().catch(() => ({}));
        throw new Error(obj.error || "伺服器未能儲存資料");
      }
      setSaveError(null); // 成功 → 清除先前的錯誤提示
    } catch (e: any) {
      console.error("Database save failed.", e);
      setSaveError(e?.message || "儲存失敗，請確認伺服器是否運作");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCourses = (nextCourses: Course[]) => {
    if (dbState) {
      handleSaveDatabase({ ...dbState, courses: nextCourses });
    }
  };

  if (isLoading || !dbState) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-500" id="id_app_loading_screen">
        <Loader className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <span className="text-sm font-semibold text-slate-600">學術智慧評分助理初始化中...</span>
        <span className="text-xs text-slate-400 mt-1">連線安全資料庫儲存庫中，請稍候</span>
      </div>
    );
  }

  const courses = dbState.courses;
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans" id="id_grading_app_root">
      
      {/* SIDEBAR NAVIGATION (Large Screen) */}
      <aside className="hidden lg:flex w-64 bg-slate-900 flex-col border-r border-slate-800 shrink-0 text-slate-300">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-500/10">
              <div className="w-4 h-4 bg-white rotate-45"></div>
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight block">EduGrade AI</span>
              <span className="text-[9px] text-slate-500 tracking-wider uppercase font-mono block">Grading CoPilot</span>
            </div>
          </div>
        </div>

        {/* Sidebar Tabs Menu */}
        <nav className="flex-1 p-4 space-y-2.5">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "dashboard"
                ? "bg-slate-800 text-white bg-slate-800 border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <span>總覽儀表板 KPI</span>
            </div>
            {activeTab === "dashboard" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></div>}
          </button>

          <button
            onClick={() => setActiveTab("gradebook")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "gradebook"
                ? "bg-slate-800 text-white bg-slate-800 border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sheet className="w-4 h-4 text-slate-400" />
              <span>成績試算中心</span>
            </div>
            {activeTab === "gradebook" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("submissions")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "submissions"
                ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <span>繳交總覽</span>
            </div>
            {activeTab === "submissions" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("classroom")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "classroom"
                ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Grid3x3 className="w-4 h-4 text-slate-400" />
              <span>課堂工具</span>
            </div>
            {activeTab === "classroom" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("exam")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "exam"
                ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>AI 紙本考卷</span>
            </div>
            {activeTab === "exam" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("folder")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "folder"
                ? "bg-slate-800 text-white bg-slate-800 border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FolderSync className="w-4 h-4 text-slate-400" />
              <span>AI 資料夾批次</span>
            </div>
            {activeTab === "folder" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("gmail")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "gmail"
                ? "bg-slate-800 text-white bg-slate-800 border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <MailQuestion className="w-4 h-4 text-slate-400" />
              <span>Gmail 雲端收件</span>
            </div>
            {activeTab === "gmail" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab("courses")}
            className={`w-full text-left px-4 py-2.5 rounded transition flex items-center justify-between text-xs font-semibold ${
              activeTab === "courses"
                ? "bg-slate-800 text-white bg-slate-800 border-l-4 border-blue-500 font-bold"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>課程與配分管理</span>
            </div>
            {activeTab === "courses" && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>}
          </button>
        </nav>

        {/* Left Bottom Info Card */}
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500 space-y-2">
          {courses.length > 0 && (
            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-500">任教年學期:</div>
              <div className="font-semibold text-slate-300 font-display text-xs">{currentCourse?.semester || "112 下學期"}</div>
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
            <span>系統狀態: 連結本機伺服器</span>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER & TABS BAR */}
      <div className="lg:hidden bg-slate-900 border-b border-slate-800 text-slate-300 flex flex-col sticky top-0 z-30 shadow-md">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <div className="w-3 h-3 bg-white rotate-45"></div>
            </div>
            <span className="text-white font-bold text-md tracking-tight">EduGrade AI</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Active course global context indicator selector */}
            {courses.length > 0 && (
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-slate-800 text-[11px] font-bold outline-none text-slate-200 rounded px-2 py-1 cursor-pointer border border-slate-700"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Scrollable Mobile Tabs navigation bar */}
        <div className="border-t border-slate-800 overflow-x-auto">
          <nav className="flex space-x-1 p-2 whitespace-nowrap min-w-max" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "dashboard" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              總覽
            </button>
            <button
              onClick={() => setActiveTab("gradebook")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "gradebook" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              試算
            </button>
            <button
              onClick={() => setActiveTab("submissions")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "submissions" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              繳交總覽
            </button>
            <button
              onClick={() => setActiveTab("classroom")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "classroom" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              課堂工具
            </button>
            <button
              onClick={() => setActiveTab("exam")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "exam" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              紙本考卷
            </button>
            <button
              onClick={() => setActiveTab("folder")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "folder" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              AI 批次
            </button>
            <button
              onClick={() => setActiveTab("gmail")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "gmail" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Gmail
            </button>
            <button
              onClick={() => setActiveTab("courses")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded transition ${
                activeTab === "courses" ? "bg-slate-800 text-white font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              設定
            </button>
          </nav>
        </div>
      </div>

      {/* MAIN LAYOUT CANVAS CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0" id="id_main_canvas_root">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-3">
            {courses.length > 0 ? (
              <div className="flex items-center gap-3">
                <h2 className="text-sm sm:text-md lg:text-lg font-bold text-slate-800 font-display">
                  {currentCourse?.name || "作業評估系統"}
                </h2>
                <span className="hidden sm:inline px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded border border-blue-100 font-mono">
                  {currentCourse?.semester || "112-2 課程學期"}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 text-xs">尚無建立課程</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            
            {/* Real Desktop switcher dropdown */}
            {courses.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded font-display select-none">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">快速切換課程:</span>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="bg-transparent text-xs font-bold font-display outline-none text-slate-700 cursor-pointer border-none p-0 focus:ring-0"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* In-sync saving status */}
            {isSaving ? (
              <span className="text-xs text-blue-600 flex items-center gap-1 bg-blue-50 border border-blue-100 px-3 py-1 rounded">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">變更同步中...</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block"></span>
                <span>資料已雲端就緒</span>
              </span>
            )}

          </div>
        </header>

        {/* 儲存失敗警示：避免使用者「以為存到了、其實沒存到」 */}
        {saveError && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-8 py-2.5 flex items-start gap-2">
            <Check className="w-4 h-4 text-red-500 mt-0.5 rotate-45 flex-shrink-0" />
            <div className="flex-1 text-xs text-red-700 leading-relaxed">
              <span className="font-bold">⚠ 儲存失敗：</span>{saveError}
              <span className="block text-[11px] text-red-500">您剛才的變更可能沒存到伺服器。請確認 dev server 是否運作，再重新操作一次以觸發儲存。</span>
            </div>
            <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 text-xs font-semibold flex-shrink-0">關閉</button>
          </div>
        )}

        {/* VIEWPORT CONTROLLER CONTENT AREA */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
          {courses.length === 0 ? (
            <div className="bg-white p-12 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-4 max-w-xl mx-auto mt-12">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-lg text-slate-800">歡迎使用 EduGrade AI 智慧評分系統！</h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                目前本機安全資料庫中尚未建立任何課程學籍。請先前往課程管理頁面建立一門您在校的學能授課。
              </p>
              <button
                onClick={() => setActiveTab("courses")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-medium text-xs text-white rounded shadow transition font-display"
              >
                + 建立新授課課程
              </button>
            </div>
          ) : (
            <div className="space-y-6 max-w-7xl mx-auto">
              {activeTab === "dashboard" && (
                <GradingDashboard
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                />
              )}

              {activeTab === "gradebook" && (
                <GradeBook
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  onUpdateCourses={handleUpdateCourses}
                />
              )}

              {activeTab === "submissions" && (
                <SubmissionOverview
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                />
              )}

              {activeTab === "classroom" && (
                <ClassroomTools
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                />
              )}

              {activeTab === "exam" && (
                <ExamGenerator
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  examPapers={dbState.examPapers ?? []}
                  onUpdateExamPapers={(papers) => handleSaveDatabase({ ...dbState, examPapers: papers })}
                />
              )}

              {activeTab === "folder" && (
                <FolderAnalyzer
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  onUpdateCourses={handleUpdateCourses}
                />
              )}

              {activeTab === "gmail" && (
                <GmailScanner
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  onUpdateCourses={handleUpdateCourses}
                />
              )}

              {activeTab === "courses" && (
                <CourseSetup
                  courses={courses}
                  selectedCourseId={selectedCourseId}
                  onSelectCourse={setSelectedCourseId}
                  onUpdateCourses={handleUpdateCourses}
                />
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-200 py-3 px-8 text-[11px] text-slate-400 font-mono text-center sm:text-left flex flex-col sm:flex-row justify-between gap-2" id="id_footer_info">
          <span>🎯 EduGrade AI CoPilot 版權所有 • 支援即時 PDF/XLSX 行動辨識與 Gmail 單頁通訊</span>
          <span>連線安全伺服器 • 辨識引擎 (Gemini AI-Core)</span>
        </footer>

      </main>

    </div>
  );
}
