import React, { useState } from "react";
import { Course, Student, AssessmentItem } from "../types";
import { Download, Save, Search, Filter, Edit3, Check, X, FileSpreadsheet, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

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

  if (!currentCourse) {
    return (
      <div className="bg-white p-12 text-center rounded-2xl border border-gray-100 text-slate-450">
        目前無有效課程資料。
      </div>
    );
  }

  const { students, assessments } = currentCourse;

  // Final weighted grade formula
  const calculateWeightedGrade = (student: Student) => {
    let totalWeightUsed = 0;
    let earnedPoints = 0;

    assessments.forEach((asst) => {
      const score = student.grades[asst.id];
      if (score != null) {
        earnedPoints += (score * asst.weight);
        totalWeightUsed += asst.weight;
      }
    });

    if (totalWeightUsed === 0) return 0;
    // Normalize if weights don't sum to 100% yet
    return Math.round((earnedPoints / totalWeightUsed) * 10) / 10;
  };

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
    headers.push("學期總成績(加權)");
    
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

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-6 text-slate-800" id="id_gradebook_root">
      
      {/* FILTER BUTTONS & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            課程成績簿中心
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">滑鼠「雙擊」各學術欄位即可在線手動修正得分，表格支援即時學期加權成績公式演算</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-slate-250 bg-slate-50">
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
            onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 shadow-sm transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            批次匯出成績 (CSV)
          </button>
        </div>
      </div>

      {/* CORE GRADEBOOK GRID TABLE */}
      <div className="border border-slate-200 overflow-x-auto">
        <table className="w-full text-left min-w-[700px] border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-505 text-slate-600 font-semibold text-xs font-display">
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
                學期總分(加權)
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
                          className="p-1 text-slate-450 text-slate-400 hover:text-blue-600 font-bold"
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
                                ? "bg-amber-50/5 text-slate-350 font-medium" 
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
                                  <MessageSquare className="w-3 h-3 text-blue-550 text-blue-500 inline ml-1 inline-block opacity-45 group-hover:opacity-100 transition" />
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
                      <tr className="bg-slate-55/40 bg-slate-50">
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
                                      <span className="text-[10px] text-slate-401">評語回饋</span>
                                    </div>
                                    <textarea
                                      rows={2}
                                      value={fb}
                                      placeholder="尚無回饋內容。可在此手動輸入，或點擊 AI 資料夾分析 / Gmail Scanners 系統自動產製..."
                                      onChange={(e) => handleSaveFeedback(student.id, asst.id, e.target.value)}
                                      className="w-full text-[11px] p-2 bg-white rounded-sm border border-slate-200 outline-none focus:border-blue-500 font-sans leading-relaxed text-slate-655"
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
