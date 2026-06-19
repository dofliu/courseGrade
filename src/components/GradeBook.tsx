import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Course, Student, AssessmentItem } from "../types";
import { accumulatedWeighted } from "../lib/grades";
import { Download, Save, Search, Filter, Edit3, Check, X, FileSpreadsheet, MessageSquare, ChevronDown, ChevronUp, Upload, FileUp } from "lucide-react";

interface GradeBookProps {
  courses: Course[];
  selectedCourseId: string;
  onUpdateCourses: (courses: Course[]) => void;
}

export default function GradeBook({
  courses,
  selectedCourseId,
  onUpdateCourses,
}: GradeBookProps) {
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  
  // Searching & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string | null>(null);

  // Expanded student row for detail comment editing
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // In-line cell editing state
  const [editingCell, setEditingCell] = useState<{ studentId: string; asstId: string } | null>(null);
  const [editingScoreText, setEditingScoreText] = useState("");

  // 成績匯入（貼上 / Excel）— 把已批改完的整份成績一次寫入某評分項目
  const [showImport, setShowImport] = useState(false);
  const [importAsstId, setImportAsstId] = useState("");
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<{ studentId: string; score: number | null; feedback: string }[]>([]);

  if (!currentCourse) {
    return (
      <div className="bg-white p-12 text-center rounded-2xl border border-gray-100 text-slate-400">
        目前無有效課程資料。
      </div>
    );
  }

  const { students, assessments } = currentCourse;

  // 目前累計加權分（共用邏輯見 lib/grades）
  const calculateWeightedGrade = (student: Student) => accumulatedWeighted(student.grades, assessments);

  // Perform filtering
  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.name.includes(searchQuery) || 
                          s.studentId.includes(searchQuery) ||
                          s.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Handle saving of cell click
  const handleSaveCellGrade = (studentId: string, asstId: string) => {
    const scoreVal = parseInt(editingScoreText);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      alert("請輸入介於 0 至 100 之間的有效分數！");
      return;
    }

    const updatedStudents = students.map((stud) => {
      if (stud.id === studentId) {
        const nextGrades = { ...stud.grades, [asstId]: scoreVal };
        const nextStatus = { ...stud.submitStatus, [asstId]: "submitted" as const };
        return {
          ...stud,
          grades: nextGrades,
          submitStatus: nextStatus,
        };
      }
      return stud;
    });

    const updatedCourse = {
      ...currentCourse,
      students: updatedStudents,
    };

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);
    setEditingCell(null);
  };

  // Handle detailed feedback editing for student
  const handleSaveFeedback = (studentId: string, asstId: string, text: string) => {
    const updatedStudents = students.map((stud) => {
      if (stud.id === studentId) {
        return {
          ...stud,
          feedback: {
            ...stud.feedback,
            [asstId]: text,
          },
        };
      }
      return stud;
    });

    const updatedCourse = {
      ...currentCourse,
      students: updatedStudents,
    };

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);
  };

  // CSV Batch Export function
  const handleExportCSV = () => {
    if (students.length === 0) {
      alert("目前修課中尚無學生，無法導出 CSV 報表。");
      return;
    }

    // Build headers row: 学號,姓名,電子信箱,作業1,作業2,...,期末總加權成績,評語備註...
    let headers = ["學號", "姓名", "信箱"];
    assessments.forEach((a) => {
      headers.push(`${a.name}(佔${a.weight}%)`);
    });
    headers.push("目前累計加權分");
    
    // Add columns for feedback
    assessments.forEach((a) => {
      headers.push(`${a.name}建議評語`);
    });

    // Build values rows
    let csvContent = "\uFEFF"; // Include BOM for proper MS Excel Chinese encoding!
    csvContent += headers.join(",") + "\n";

    students.forEach((student) => {
      let row = [
        student.studentId,
        student.name,
        student.email,
      ];

      // Add scores
      assessments.forEach((a) => {
        const score = student.grades[a.id];
        row.push(score != null ? score.toString() : "-");
      });

      // Add overall grade
      row.push(calculateWeightedGrade(student).toString());

      // Add feedbacks (escape CSV commas)
      assessments.forEach((a) => {
        const feedbackText = student.feedback[a.id] || "";
        const escapedContent = `"${feedbackText.replace(/"/g, '""')}"`;
        row.push(escapedContent);
      });

      csvContent += row.join(",") + "\n";
    });

    // Browser triggered file trigger
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${currentCourse.name}_學期端成績單匯出_${currentCourse.semester}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 預設匯入目標為第一個評分項目
  if (!importAsstId && assessments.length > 0) {
    setImportAsstId(assessments[0].id);
  }

  // 找出某列資料對應的學生（學號優先，找不到再比對姓名）
  const findStudentForRow = (row: { studentId: string }) =>
    students.find((s) => s.studentId === row.studentId || s.name === row.studentId) || null;

  // 解析一行文字：「學號 分數 [評語]」，分隔符容許 tab / 逗號 / 空白
  const parseScoreLine = (line: string): { studentId: string; score: number | null; feedback: string } | null => {
    const text = line.trim();
    if (!text) return null;
    let parts: string[];
    if (text.includes("\t")) parts = text.split("\t");
    else if (text.includes(",")) parts = text.split(",");
    else parts = text.split(/\s+/);
    parts = parts.map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const studentId = parts[0];
    // 第一個 0–100 的純數字當分數，其後文字併為評語
    let score: number | null = null;
    let scoreIdx = -1;
    for (let i = 1; i < parts.length; i++) {
      if (/^\d+(\.\d+)?$/.test(parts[i])) {
        const n = Number(parts[i]);
        if (n >= 0 && n <= 100) {
          score = n;
          scoreIdx = i;
          break;
        }
      }
    }
    const feedback = scoreIdx >= 0 ? parts.slice(scoreIdx + 1).join(" ") : "";
    return { studentId, score, feedback };
  };

  const handleParseText = () => {
    const rows = importText
      .split("\n")
      .map(parseScoreLine)
      .filter(Boolean) as { studentId: string; score: number | null; feedback: string }[];
    if (rows.length === 0) {
      alert("無法解析任何資料，請確認格式為「學號 分數 [評語]」。");
      return;
    }
    setImportRows(rows);
  };

  const processScoreExcel = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls" && ext !== "csv") {
      alert("不支援的檔案格式！請上傳 .xlsx, .xls 或 .csv。");
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        if (rawRows.length === 0) {
          alert("此檔案沒有任何資料。");
          return;
        }

        // 智慧辨識欄位：學號 / 分數 / 評語
        let headerRow = -1, idCol = 0, scoreCol = 1, fbCol = -1;
        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
          const row = rawRows[r] as any[];
          if (!row) continue;
          let i = -1, sc = -1, fb = -1;
          for (let c = 0; c < row.length; c++) {
            const v = String(row[c] || "").trim().toLowerCase();
            if (v.includes("學號") || v.includes("学号") || v === "id" || v.includes("studentid") || v.includes("學籍")) i = c;
            else if (v.includes("分數") || v.includes("成績") || v.includes("得分") || v === "分" || v.includes("score") || v.includes("grade")) sc = c;
            else if (v.includes("評語") || v.includes("回饋") || v.includes("備註") || v.includes("評論") || v.includes("comment") || v.includes("feedback") || v.includes("remark")) fb = c;
          }
          if (i !== -1 && sc !== -1) { headerRow = r; idCol = i; scoreCol = sc; fbCol = fb; break; }
        }

        const parsed: { studentId: string; score: number | null; feedback: string }[] = [];
        const start = headerRow >= 0 ? headerRow + 1 : 0;
        for (let r = start; r < rawRows.length; r++) {
          const row = rawRows[r] as any[];
          if (!row || row.length === 0) continue;
          const sId = String(row[idCol] ?? "").trim();
          if (!sId) continue;
          const rawScore = row[scoreCol];
          let score: number | null = null;
          if (rawScore !== undefined && rawScore !== null && String(rawScore).trim() !== "") {
            const n = Number(rawScore);
            if (!isNaN(n) && n >= 0 && n <= 100) score = n;
          }
          const feedback = fbCol >= 0 && row[fbCol] != null ? String(row[fbCol]).trim() : "";
          parsed.push({ studentId: sId, score, feedback });
        }

        if (parsed.length === 0) {
          alert("無法從檔案剖析出成績。請確認包含「學號」與「分數」欄位。");
          return;
        }
        setImportRows(parsed);
      } catch (err) {
        console.error(err);
        alert("剖析檔案出錯，請確認格式正確。");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleApplyImport = () => {
    if (!importAsstId) {
      alert("請先選擇要匯入的評分項目。");
      return;
    }
    const usable = importRows.filter((r) => r.score != null && findStudentForRow(r));
    if (usable.length === 0) {
      alert("沒有可套用的資料（學號查無對應學生，或分數無效）。");
      return;
    }

    const updatedStudents = students.map((stud) => {
      const row = importRows.find(
        (r) => r.score != null && (r.studentId === stud.studentId || r.studentId === stud.name)
      );
      if (row && row.score != null) {
        return {
          ...stud,
          grades: { ...stud.grades, [importAsstId]: row.score },
          feedback: row.feedback ? { ...stud.feedback, [importAsstId]: row.feedback } : stud.feedback,
          submitStatus: { ...stud.submitStatus, [importAsstId]: "submitted" as const },
        };
      }
      return stud;
    });

    const skipped = importRows.filter((r) => r.score != null && !findStudentForRow(r)).length;
    const invalid = importRows.filter((r) => r.score == null).length;

    onUpdateCourses(courses.map((c) => (c.id === currentCourse.id ? { ...currentCourse, students: updatedStudents } : c)));
    alert(
      `匯入完成：成功套用 ${usable.length} 筆` +
        (skipped > 0 ? `，${skipped} 筆學號查無對應學生（略過）` : "") +
        (invalid > 0 ? `，${invalid} 筆分數無效（略過）` : "") +
        "。"
    );
    setShowImport(false);
    setImportText("");
    setImportRows([]);
    setImportFileName("");
  };

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-6 text-slate-800" id="id_gradebook_root">
      
      {/* FILTER BUTTONS & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            課程成績簿中心
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">滑鼠「雙擊」各學術欄位即可在線手動修正得分；總分欄為「目前累計加權分」＝實際已取得的加權分數（未評/未繳項目以 0 計，學期末即為最終成績）</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-slate-50">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋姓名或學號..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs outline-none bg-transparent w-40 font-medium text-slate-700"
            />
          </div>

          <button
            onClick={() => setShowImport((v) => !v)}
            className={`px-4 py-2 rounded text-xs font-semibold shadow-sm transition flex items-center gap-1.5 ${
              showImport ? "bg-blue-700 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            匯入成績
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow-sm transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            批次匯出成績 (CSV)
          </button>
        </div>
      </div>

      {/* 成績匯入面板 */}
      {showImport && (
        <div className="border border-blue-200 bg-blue-50/40 rounded p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="font-display font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                匯入已批改成績（不經 AI）
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                貼上或上傳「學號 分數 評語(選填)」，一次寫入指定評分項目；同時自動標記為已繳交。
              </p>
            </div>
            <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 目標評分項目 */}
          <div className="max-w-xs">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">匯入到哪個評分項目</label>
            <select
              value={importAsstId}
              onChange={(e) => setImportAsstId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-white focus:border-blue-500 font-semibold text-slate-700"
            >
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（佔 {a.weight}%）
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 貼上文字 */}
            <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                複製貼上
              </div>
              <div className="text-[10px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded p-1.5 leading-relaxed">
                111306021 85 推導正確<br />
                111306042 92<br />
                111306075,78,需補空間複雜度
              </div>
              <textarea
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="每行：學號 分數 評語(選填)。可用空白、Tab 或逗號分隔。"
                className="w-full text-xs p-2 bg-white border border-slate-200 rounded outline-none font-mono focus:border-blue-500"
              />
              <button
                onClick={handleParseText}
                disabled={!importText.trim()}
                className="w-full px-3 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 transition disabled:opacity-40 flex items-center justify-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                解析預覽
              </button>
            </div>

            {/* Excel / CSV */}
            <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                Excel / CSV 上傳
              </div>
              <label className="border-2 border-dashed border-slate-250 bg-slate-50 hover:border-blue-500 transition cursor-pointer p-4 h-[104px] flex flex-col items-center justify-center text-center rounded">
                <FileUp className="w-7 h-7 text-slate-400 mb-1" />
                <span className="text-[11px] font-bold text-slate-700">
                  {importFileName || "選擇檔案"}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5">含「學號」「分數」欄位；「評語」選填</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => e.target.files?.[0] && processScoreExcel(e.target.files[0])}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* 預覽 */}
          {importRows.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-600">
                預覽（共 {importRows.length} 筆）
              </div>
              <div className="border border-slate-200 rounded bg-white max-h-52 overflow-y-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">學號</th>
                      <th className="p-2 text-left">對應學生</th>
                      <th className="p-2 text-center">分數</th>
                      <th className="p-2 text-left">評語</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importRows.map((r, i) => {
                      const stud = findStudentForRow(r);
                      const ok = stud && r.score != null;
                      return (
                        <tr key={i} className={ok ? "" : "bg-red-50/40"}>
                          <td className="p-2 font-mono text-slate-600">{r.studentId}</td>
                          <td className="p-2">
                            {stud ? (
                              <span className="text-slate-700 font-semibold">{stud.name}</span>
                            ) : (
                              <span className="text-red-500">查無此學號</span>
                            )}
                          </td>
                          <td className="p-2 text-center font-bold">
                            {r.score != null ? (
                              <span className="text-blue-600">{r.score}</span>
                            ) : (
                              <span className="text-red-500">無效</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-500 truncate max-w-[200px]">{r.feedback}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => { setImportRows([]); setImportText(""); setImportFileName(""); }}
                  className="px-3 py-1.5 text-xs text-slate-500 font-medium hover:text-slate-700"
                >
                  清除
                </button>
                <button
                  onClick={handleApplyImport}
                  className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  確認套用到「{assessments.find((a) => a.id === importAsstId)?.name}」
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CORE GRADEBOOK GRID TABLE */}
      <div className="border border-slate-200 overflow-x-auto">
        <table className="w-full text-left min-w-[700px] border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-slate-600 font-semibold text-xs font-display">
              <th className="p-3.5 w-10">編詳</th>
              <th className="p-3.5 w-28">學號</th>
              <th className="p-3.5 w-24">學生姓名</th>
              {assessments.map((a) => (
                <th key={a.id} className="p-3.5 text-center truncate" title={`${a.name} (佔 ${a.weight}%)`}>
                  <div>{a.name}</div>
                  <div className="text-[10px] text-slate-400 pt-0.5 font-medium">佔 {a.weight}%</div>
                </th>
              ))}
              <th className="p-3.5 text-right font-display text-blue-600 font-bold w-32">
                目前累計加權分
              </th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-200 bg-white">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={assessments.length + 4} className="p-12 text-center text-slate-400 bg-slate-50/10">
                  沒有搜尋到相符的學生成績記錄。
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const isExpanded = expandedStudentId === student.id;
                const finalGrade = calculateWeightedGrade(student);

                return (
                  <React.Fragment key={student.id}>
                    <tr className="hover:bg-slate-50">
                      
                      {/* Expander detail key */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                          className="p-1 text-slate-400 text-slate-400 hover:text-blue-600 font-bold"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>

                      <td className="p-3 font-mono font-medium text-slate-600">{student.studentId}</td>
                      <td className="p-3 font-bold text-slate-800">{student.name}</td>

                      {/* Grades assessments scores columns */}
                      {assessments.map((asst) => {
                        const scoreVal = student.grades[asst.id];
                        const feedbackText = student.feedback[asst.id] || "";
                        const isCellEditing = editingCell?.studentId === student.id && editingCell?.asstId === asst.id;

                        return (
                          <td
                            key={asst.id}
                            onDoubleClick={() => {
                              setEditingCell({ studentId: student.id, asstId: asst.id });
                              setEditingScoreText(scoreVal != null ? scoreVal.toString() : "");
                            }}
                            className={`p-3 text-center cursor-pointer transition select-none ${
                              scoreVal == null 
                                ? "bg-amber-50/5 text-slate-300 font-medium" 
                                : scoreVal < 60
                                ? "text-red-500 font-bold"
                                : "text-slate-700 font-medium hover:bg-slate-100"
                            }`}
                            title="按滑鼠兩下即可更改成績；展開下方可編輯評語"
                          >
                            {isCellEditing ? (
                              <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={editingScoreText}
                                  onChange={(e) => setEditingScoreText(e.target.value)}
                                  onBlur={() => handleSaveCellGrade(student.id, asst.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveCellGrade(student.id, asst.id);
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  className="w-10 text-center font-bold text-xs p-0.5 border border-blue-600 rounded bg-white text-blue-600 outline-none"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <div className="group relative">
                                <span>{scoreVal != null ? scoreVal : "-"}</span>
                                {feedbackText && (
                                  <MessageSquare className="w-3 h-3 text-blue-500 text-blue-500 inline ml-1 inline-block opacity-45 group-hover:opacity-100 transition" />
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Overall Final Grade */}
                      <td className="p-3 text-right font-display font-black text-blue-600 pr-4 text-sm">
                        <span className={finalGrade < 60 ? "text-red-500 font-bold" : "text-blue-600 font-semibold"}>
                          {finalGrade} 分
                        </span>
                      </td>

                    </tr>

                    {/* EXPANDED FEEDBACK WORKSPACE ROW */}
                    {isExpanded && (
                      <tr className="bg-slate-50/40 bg-slate-50">
                        <td colSpan={assessments.length + 4} className="p-4 pl-12">
                          <div className="bg-white p-4 border border-slate-200 space-y-3">
                            <div className="text-xs font-semibold text-slate-700 flex items-center justify-between pb-1 border-b border-slate-200">
                              <span>📚 學員個別作業 AI 與助教評語備忘 (Roster Remarks Record) - {student.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">信箱: {student.email}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                              {assessments.map((asst) => {
                                const fb = student.feedback[asst.id] || "";
                                const scr = student.grades[asst.id];

                                return (
                                  <div key={asst.id} className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-slate-800 text-[11px]">{asst.name} ({scr != null ? `${scr}分` : "缺考/缺交"})</span>
                                      <span className="text-[10px] text-slate-400">評語回饋</span>
                                    </div>
                                    <textarea
                                      rows={2}
                                      value={fb}
                                      placeholder="尚無回饋內容。可在此手動輸入，或點擊 AI 資料夾分析 / Gmail Scanners 系統自動產製..."
                                      onChange={(e) => handleSaveFeedback(student.id, asst.id, e.target.value)}
                                      className="w-full text-[11px] p-2 bg-white rounded-sm border border-slate-200 outline-none focus:border-blue-500 font-sans leading-relaxed text-slate-600"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
