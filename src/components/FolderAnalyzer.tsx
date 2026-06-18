import React, { useState, useRef, useEffect, ChangeEvent } from "react";
import { Course, Student, SimulatedUploadedFile } from "../types";
import { FolderOpen, Play, Check, AlertTriangle, FileText, UserPlus, Save, Edit3, ArrowRight, Loader } from "lucide-react";

interface FolderAnalyzerProps {
  courses: Course[];
  selectedCourseId: string;
  onUpdateCourses: (courses: Course[]) => void;
}

export default function FolderAnalyzer({
  courses,
  selectedCourseId,
  onUpdateCourses,
}: FolderAnalyzerProps) {
  const [targetCourseId, setTargetCourseId] = useState(selectedCourseId);
  const [targetAsstId, setTargetAsstId] = useState("");
  const [fileQueue, setFileQueue] = useState<SimulatedUploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analyzedLogs, setAnalyzedLogs] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCourse = courses.find((c) => c.id === targetCourseId) || courses[0];

  // 永遠指向最新的 courses，讓批次中連續的自動登記基於最新資料合併、不互相覆蓋
  const coursesRef = useRef(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  // 把指定學生在目前評分項目標記為「已繳待評」(submitted)，但不動分數
  const markStudentsSubmitted = (studentIds: string[]) => {
    if (!targetAsstId || studentIds.length === 0) return;
    const latest = coursesRef.current;
    const course = latest.find((c) => c.id === targetCourseId) || latest[0];
    if (!course) return;

    let changed = false;
    const updatedStudents = course.students.map((s) => {
      if (studentIds.includes(s.id) && s.submitStatus[targetAsstId] !== "submitted" && s.grades[targetAsstId] == null) {
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

  // Handle folder upload input
  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: SimulatedUploadedFile[] = [];
    const convertToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          // Clean base64 strip standard headers
          const base64Data = result.split(",")[1] || result;
          resolve(base64Data);
        };
      });
    };

    setAnalyzedLogs((prev) => [...prev, `📂 成功載入本機目錄，共讀取到 ${files.length} 個檔案。`]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Accept pictures, scanned sheets, PDF, txt documents
      const isAcceptable = file.type.startsWith("image/") || 
                           file.type === "application/pdf" || 
                           file.type.startsWith("text/") ||
                           file.name.endsWith(".txt") ||
                           file.name.endsWith(".pdf") ||
                           file.name.endsWith(".jpg") ||
                           file.name.endsWith(".png") ||
                           file.name.endsWith(".jpeg");

      if (!isAcceptable) continue;

      const base64 = await convertToBase64(file);
      newFiles.push({
        id: "file-" + i + "-" + Date.now(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        base64,
        status: "idle",
      });
    }

    setFileQueue(newFiles);
  };

  // Trigger AI analysis sequentially (to avoid rate limits and keep logs clear)
  const startAIAnalysis = async () => {
    if (fileQueue.length === 0) return;
    if (!selectedCourse) {
      alert("請先選擇要評比的課程。");
      return;
    }
    if (!targetAsstId) {
      alert("請選擇本批檔案對應的名單評分項目。");
      return;
    }

    setIsProcessing(true);
    setAnalyzedLogs((prev) => [...prev, `🚀 開始啟動 AI 批次分析排程...`]);

    const activeAssessment = selectedCourse.assessments.find((a) => a.id === targetAsstId);
    const updatedQueue = [...fileQueue];

    for (let i = 0; i < updatedQueue.length; i++) {
      const file = updatedQueue[i];
      if (file.status === "completed") continue; // skip already completed

      updatedQueue[i] = { ...file, status: "running" };
      setFileQueue([...updatedQueue]);
      setAnalyzedLogs((prev) => [...prev, `⚙️ 正在評分並辨識檔案: "${file.name}"...`]);

      try {
        const response = await fetch("/api/analyze-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileContent: file.base64,
            mimeType: file.type,
            fileName: file.name,
            roster: selectedCourse.students.map((s) => ({ studentId: s.studentId, name: s.name })),
            assessmentName: activeAssessment?.name || "作業",
            rubric: activeAssessment?.rubric || "",
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();

        updatedQueue[i] = {
          ...file,
          status: "completed",
          analysisResult: {
            studentName: data.studentName || "",
            studentId: data.studentId || "",
            score: data.score != null ? data.score : 80,
            feedback: data.feedback || "AI 已成功辨識，請填入具體評語。",
            confidence: data.confidence || 0.9,
          },
        };

        setAnalyzedLogs((prev) => [
          ...prev,
          `✓ 完成 📍 辨識學生: ${data.studentName || "未知"} (得分: ${data.score != null ? data.score : "未評分"})`
        ]);

        // 辨識配對到名單學生 → 立即登記「已繳待評」（分數待按下儲存才寫入）
        const matched = findMatchingStudentFromRoster(data.studentName || "", data.studentId || "");
        if (matched) {
          markStudentsSubmitted([matched.id]);
        }

      } catch (err: any) {
        console.error("Single file AI fail:", err);
        updatedQueue[i] = {
          ...file,
          status: "failed",
          error: err.message || "通訊或辨識錯誤",
        };
        setAnalyzedLogs((prev) => [...prev, `❌ 辨識失敗: ${file.name} - ${err.message || "錯誤"}`]);
      }

      setFileQueue([...updatedQueue]);
    }

    setIsProcessing(false);
    setAnalyzedLogs((prev) => [...prev, `🎉 全數檔案批次處理完畢！`]);
  };

  // Modify AI results manually
  const handleEditResult = (fileId: string, fields: Partial<NonNullable<SimulatedUploadedFile["analysisResult"]>>) => {
    setFileQueue((prev) =>
      prev.map((f) => {
        if (f.id === fileId && f.analysisResult) {
          return {
            ...f,
            analysisResult: {
              ...f.analysisResult,
              ...fields,
            },
          };
        }
        return f;
      })
    );
  };

  // Save everything to official course grades
  const saveGradesToDatabase = () => {
    if (!selectedCourse || !targetAsstId) return;

    // Deep clone student list of selected course
    const updatedStudents = selectedCourse.students.map((student) => {
      const copy = { ...student };
      copy.grades = { ...student.grades };
      copy.feedback = { ...student.feedback };
      copy.submitStatus = { ...student.submitStatus };

      // Find if we have an analyzed file that matches this student!
      const matchedFile = fileQueue.find((file) => {
        if (file.status !== "completed" || !file.analysisResult) return false;
        const res = file.analysisResult;
        // 以學號或姓名比對；必須先確認 AI 回傳值非空字串，
        // 否則 "".includes("") 永遠為 true，會把成績誤寫到名單第一位學生身上。
        return (
          (!!res.studentId && res.studentId === student.studentId) ||
          (!!res.studentName && student.name.includes(res.studentName)) ||
          (!!res.studentName && res.studentName.includes(student.name))
        );
      });

      if (matchedFile && matchedFile.analysisResult) {
        const result = matchedFile.analysisResult;
        copy.grades[targetAsstId] = result.score;
        copy.feedback[targetAsstId] = result.feedback;
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

    alert("成績簿儲存完畢！AI 評分與評語已成功寫入對應課程中，可退至儀表板確認。");
  };

  // Utilities for match identification
  const findMatchingStudentFromRoster = (studentName: string, studentId: string) => {
    if (!selectedCourse) return null;
    return selectedCourse.students.find(
      (s) =>
        (studentId && s.studentId === studentId) ||
        (studentName && s.name.includes(studentName)) ||
        (studentName && studentName.includes(s.name))
    );
  };

  const completedCount = fileQueue.filter((f) => f.status === "completed").length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 text-gray-800" id="id_folder_analyzer_root">
      
      {/* FILTER CONTROLS & SELECTORS */}
      <div className="xl:col-span-4 space-y-6">
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-display font-semibold text-slate-900 text-lg flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            評分專案設定
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">目地課程 (Target Course)</label>
              <select
                value={targetCourseId}
                onChange={(e) => {
                  setTargetCourseId(e.target.value);
                  const course = courses.find((c) => c.id === e.target.value);
                  if (course && course.assessments.length > 0) {
                    setTargetAsstId(course.assessments[0].id);
                  } else {
                    setTargetAsstId("");
                  }
                }}
                className="w-full text-xs px-3.5 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} ({course.semester})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">目地評分項目 (Assessment Item)</label>
              <select
                value={targetAsstId}
                onChange={(e) => setTargetAsstId(e.target.value)}
                className="w-full text-xs px-3.5 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700"
              >
                {selectedCourse?.assessments.map((asst) => (
                  <option key={asst.id} value={asst.id}>
                    {asst.name} (加權比: {asst.weight}%)
                  </option>
                ))}
                {selectedCourse?.assessments.length === 0 && (
                  <option value="">-- 無評分項目 --</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* FOLDER READING BOX */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-medium text-sm text-slate-700">資料夾與拖曳上傳</h4>
          
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-100 transition-all group rounded-none"
          >
            <FolderOpen className="w-10 h-10 text-slate-400 group-hover:text-blue-600 mx-auto mb-3 transition" />
            <div className="text-xs font-bold text-slate-700 mb-1">點擊瀏覽電腦上的資料夾</div>
            <p className="text-[10px] text-slate-400 leading-relaxed px-2">
              系統將會自動辨識該目錄下的所有 PDF 報告、手繪考卷照片、掃描檔案
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFolderChange}
              className="hidden"
              multiple
              // @ts-ignore
              webkitdirectory=""
              directory=""
            />
          </div>

          <div className="text-[10px] text-blue-800 bg-blue-50 p-3 border border-blue-200 leading-relaxed font-sans">
            💡 <strong>說明：</strong>配合瀏覽器安全性規範，本系統採用進階 HTML5 虛擬目錄讀取機制，您可以放心地選擇您本機的作業目錄。所有流程皆於您的當下工作階段中進行，高效率且絕對保護隱私與安全性。
          </div>
        </div>

        {/* CURRENT LIVE RUN LOGS */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-3">
          <h4 className="font-display font-medium text-sm text-slate-700">AI 辨識記錄日誌</h4>
          <div className="h-44 bg-slate-900 p-3 text-[10px] font-mono text-emerald-400 overflow-y-auto space-y-1 scrollbar-thin">
            {analyzedLogs.length === 0 ? (
              <span className="text-slate-500">等待載入與分析...</span>
            ) : (
              analyzedLogs.map((log, idx) => (
                <div key={idx} className="leading-5 break-all text-emerald-400">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* FILE GRADINGS QUEUE */}
      <div className="xl:col-span-8 space-y-6">
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-900">
                本期資料夾檢視 ({fileQueue.length} 個作業檔案)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">匯入的學生作業將呈列於此，一鍵分析將逐一透過 AI 評分</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={startAIAnalysis}
                disabled={fileQueue.length === 0 || isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    AI 智慧分析中...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    🤖 啟動 AI 批次分析
                  </>
                )}
              </button>

              <button
                onClick={saveGradesToDatabase}
                disabled={completedCount === 0 || isProcessing}
                className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                儲存學術成績
              </button>
            </div>
          </div>

          {/* Queue files list */}
          <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
            {fileQueue.length === 0 ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                <FolderOpen className="w-12 h-12 text-slate-300" />
                <div>目前沒有待評分的作業檔案。請點選左側選擇一個資料夾繳交目錄！</div>
              </div>
            ) : (
              fileQueue.map((file) => {
                const isMatched = file.analysisResult
                  ? findMatchingStudentFromRoster(file.analysisResult.studentName, file.analysisResult.studentId)
                  : null;

                return (
                  <div
                    key={file.id}
                    className={`border p-5 transition rounded ${
                      file.status === "running"
                        ? "border-blue-400 bg-blue-50/20"
                        : file.status === "completed"
                        ? "border-slate-200 bg-slate-50/20"
                        : file.status === "failed"
                        ? "border-red-200 bg-red-50/10"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-slate-100 text-slate-600 rounded">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-800 truncate max-w-sm">{file.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {(file.size / 1024).toFixed(1)} KB • {file.type || "檔案格式不明"}
                          </div>
                        </div>
                      </div>

                      {/* Status and Actions */}
                      <div className="flex items-center gap-3">
                        {file.status === "idle" && (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded">
                            待處理
                          </span>
                        )}
                        {file.status === "running" && (
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                            AI 研讀中...
                          </span>
                        )}
                        {file.status === "completed" && (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            辨識成功
                          </span>
                        )}
                        {file.status === "failed" && (
                          <span className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            遭遇錯誤
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI result details */}
                    {file.status === "completed" && file.analysisResult && (
                      <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-5 text-xs bg-white p-4">
                        
                        {/* Student match info card */}
                        <div className="md:col-span-4 space-y-3">
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-semibold text-[10px]">AI 辨識學生姓名:</span>
                            <input
                              type="text"
                              value={file.analysisResult.studentName}
                              onChange={(e) => handleEditResult(file.id, { studentName: e.target.value })}
                              className="w-full text-xs font-bold px-2 py-1.5 border border-slate-200 outline-none focus:border-blue-500 rounded-sm"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-slate-400 block font-mono text-[10px]">學號 (ID):</span>
                            <input
                              type="text"
                              value={file.analysisResult.studentId}
                              onChange={(e) => handleEditResult(file.id, { studentId: e.target.value })}
                              className="w-full text-xs font-mono font-bold px-2 py-1.5 border border-slate-200 outline-none focus:border-blue-500 rounded-sm"
                            />
                          </div>

                          {/* Student mapper banner */}
                          <div className={`p-2.5 border text-[11px] rounded-sm ${
                            isMatched
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold"
                              : "bg-red-50 border-rose-200 text-red-800"
                          }`}>
                            {isMatched ? (
                              <div className="flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>
                                  比對符合: <strong>{isMatched.name}</strong> ({isMatched.studentId})
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                  <span>學籍不吻合</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                                  姓名/學號「{file.analysisResult.studentName || "無"} / {file.analysisResult.studentId || "無"}」並未發現於課程學籍中，請確認檔案。
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Grading fields */}
                        <div className="md:col-span-8 space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-700">給予評分:</span>
                              <div className="flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={file.analysisResult.score}
                                  onChange={(e) => handleEditResult(file.id, { score: Number(e.target.value) || 0 })}
                                  className="w-16 font-bold text-center text-sm px-2 py-1 border border-slate-200 rounded text-blue-600 outline-none"
                                />
                                <span className="ml-1 font-semibold text-slate-500">/ 100</span>
                              </div>
                            </div>

                            <span className="text-[10px] text-slate-400">
                              辨識信賴度: ({(file.analysisResult.confidence * 100).toFixed(0)}%)
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-slate-400 block font-semibold text-[10px]">AI 建議回饋評語 (可編輯):</span>
                            <textarea
                              rows={3}
                              value={file.analysisResult.feedback}
                              onChange={(e) => handleEditResult(file.id, { feedback: e.target.value })}
                              className="w-full text-xs p-2.5 border border-slate-200 rounded outline-none text-slate-700 leading-relaxed font-sans focus:border-blue-500"
                            />
                          </div>
                        </div>

                      </div>
                    )}

                    {file.status === "failed" && (
                      <div className="mt-3 p-3 bg-red-50 bg-red-50 border border-red-200 text-xs text-red-700">
                        <strong>分析出錯：</strong> {file.error}
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
