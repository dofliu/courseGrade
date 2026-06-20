import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Course, Student, AssessmentItem, RubricTemplate } from "../types";
import ApiKeySettings from "./ApiKeySettings";
import { Plus, Trash2, Edit2, AlertCircle, CheckCircle, Upload, HelpCircle, Users, Percent, GraduationCap, ChevronDown, Check, FileSpreadsheet, FileUp } from "lucide-react";

interface CourseSetupProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
  onUpdateCourses: (courses: Course[]) => void;
  rubricTemplates?: RubricTemplate[];
  onUpdateRubricTemplates?: (templates: RubricTemplate[]) => void;
}

export default function CourseSetup({
  courses,
  selectedCourseId,
  onSelectCourse,
  onUpdateCourses,
  rubricTemplates = [],
  onUpdateRubricTemplates,
}: CourseSetupProps) {
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseSemester, setNewCourseSemester] = useState("114-2");

  // Roster batch input state
  const [rosterInput, setRosterInput] = useState("");
  const [studentIdPrefix, setStudentIdPrefix] = useState("");
  const [showHelper, setShowHelper] = useState(false);

  // Single student input
  const [singleName, setSingleName] = useState("");
  const [singleId, setSingleId] = useState("");
  const [singleEmail, setSingleEmail] = useState("");

  // Excel / CSV file states
  const [excelStudents, setExcelStudents] = useState<any[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  // Current selected course details
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  const handleCreateCourse = () => {
    if (!newCourseName.trim()) return;
    const newCourse: Course = {
      id: "course-" + Date.now(),
      name: newCourseName.trim(),
      semester: newCourseSemester,
      assessments: [
        { id: "hw1", name: "作業 1", weight: 20, type: "hw" },
        { id: "midterm", name: "期中考試", weight: 40, type: "midterm" },
        { id: "project", name: "期末專案", weight: 40, type: "project" },
      ],
      students: [],
    };

    const updated = [...courses, newCourse];
    onUpdateCourses(updated);
    onSelectCourse(newCourse.id);
    setNewCourseName("");
    setIsCreatingCourse(false);
  };

  const handleDeleteCourse = (courseId: string) => {
    if (courses.length <= 1) {
      alert("必須保留至少一門課程。");
      return;
    }
    if (confirm("確定要刪除這門課程嗎？這將會清除該課程的所有學生成績資料。")) {
      const updated = courses.filter((c) => c.id !== courseId);
      onUpdateCourses(updated);
      if (selectedCourseId === courseId) {
        onSelectCourse(updated[0].id);
      }
    }
  };

  // Assessment additions/deletions
  const handleAddAssessment = () => {
    if (!currentCourse) return;
    const defaultName = `新評分項目 ${currentCourse.assessments.length + 1}`;
    const newItem: AssessmentItem = {
      id: "asst-" + Date.now(),
      name: defaultName,
      weight: 10,
      type: "hw",
    };

    const updatedCourse = {
      ...currentCourse,
      assessments: [...currentCourse.assessments, newItem],
    };

    // Update students' initial status in case we have students
    updatedCourse.students = currentCourse.students.map((student) => ({
      ...student,
      submitStatus: {
        ...student.submitStatus,
        [newItem.id]: "unreleased",
      },
    }));

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);
  };

  const handleUpdateAssessment = (index: number, fields: Partial<AssessmentItem>) => {
    if (!currentCourse) return;
    const updatedAssessments = [...currentCourse.assessments];
    updatedAssessments[index] = { ...updatedAssessments[index], ...fields };

    const updatedCourse = {
      ...currentCourse,
      assessments: updatedAssessments,
    };

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);
  };

  // 更新課程層級欄位（如及格門檻 passMark）
  const handleUpdateCourse = (fields: Partial<Course>) => {
    if (!currentCourse) return;
    onUpdateCourses(courses.map((c) => (c.id === currentCourse.id ? { ...currentCourse, ...fields } : c)));
  };

  // 評分標準範本庫：套用到某評分項目 / 把目前內容存成範本 / 刪除範本
  const applyRubricTemplate = (index: number, templateId: string) => {
    const t = rubricTemplates.find((r) => r.id === templateId);
    if (t) handleUpdateAssessment(index, { rubric: t.content });
  };

  const saveRubricAsTemplate = (rubric: string) => {
    if (!onUpdateRubricTemplates) return;
    const content = (rubric || "").trim();
    if (!content) {
      alert("此項目尚無評分標準內容可存成範本。");
      return;
    }
    const name = window.prompt("範本名稱：", "");
    if (name == null) return;
    const nm = name.trim() || `範本 ${rubricTemplates.length + 1}`;
    onUpdateRubricTemplates([...rubricTemplates, { id: "rt-" + Date.now(), name: nm, content }]);
  };

  const deleteRubricTemplate = (id: string) => {
    if (!onUpdateRubricTemplates) return;
    if (confirm("確定刪除這個評分標準範本？")) {
      onUpdateRubricTemplates(rubricTemplates.filter((r) => r.id !== id));
    }
  };

  const handleDeleteAssessment = (asstId: string) => {
    if (!currentCourse) return;
    const updatedAssessments = currentCourse.assessments.filter((a) => a.id !== asstId);

    // Clean up grades and feedback reference
    const updatedStudents = currentCourse.students.map((stud) => {
      const g = { ...stud.grades };
      const f = { ...stud.feedback };
      const s = { ...stud.submitStatus };
      delete g[asstId];
      delete f[asstId];
      delete s[asstId];
      return {
        ...stud,
        grades: g,
        feedback: f,
        submitStatus: s,
      };
    });

    const updatedCourse = {
      ...currentCourse,
      assessments: updatedAssessments,
      students: updatedStudents,
    };

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);
  };

  // Student list integrations
  const handleAddSingleStudent = () => {
    if (!currentCourse || !singleName.trim() || !singleId.trim()) return;

    // Check duplicate student ID
    if (currentCourse.students.some((s) => s.studentId === singleId.trim())) {
      alert("學號重複！請檢查。");
      return;
    }

    const newStudent: Student = {
      id: "std-" + Date.now(),
      studentId: singleId.trim(),
      name: singleName.trim(),
      email: singleEmail.trim() || `${singleId.trim()}@example.com`,
      grades: {},
      feedback: {},
      submitStatus: {},
    };

    // Prepopulate status
    currentCourse.assessments.forEach((a) => {
      newStudent.submitStatus[a.id] = "missing";
    });

    const updatedCourse = {
      ...currentCourse,
      students: [...currentCourse.students, newStudent],
    };

    const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
    onUpdateCourses(updatedCourses);

    setSingleName("");
    setSingleId("");
    setSingleEmail("");
  };

  const handleBatchImport = () => {
    if (!currentCourse || !rosterInput.trim()) return;

    let lines = rosterInput.split("\n");
    let addedCount = 0;
    let duplicateCount = 0;
    const newStudents: Student[] = [];

    lines.forEach((line) => {
      const text = line.trim();
      if (!text) return;

      // Smart parse columns by tab, comma or spaces
      let parts: string[] = [];
      if (text.includes("\t")) {
        parts = text.split("\t");
      } else if (text.includes(",")) {
        parts = text.split(",");
      } else {
        parts = text.split(/\s+/);
      }

      parts = parts.map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length < 2) return;

      const id = parts[0];
      const name = parts[1];
      // Check if email provided, otherwise auto create
      const email = parts[2] || `${id}@example.com`;

      // Check duplicate in current course
      const isDuplicate = currentCourse.students.some((s) => s.studentId === id) || 
                          newStudents.some((s) => s.studentId === id);

      if (isDuplicate) {
        duplicateCount++;
        return;
      }

      const stud: Student = {
        id: "std-" + Math.random().toString(36).substring(2, 9),
        studentId: id,
        name: name,
        email: email,
        grades: {},
        feedback: {},
        submitStatus: {},
      };

      currentCourse.assessments.forEach((a) => {
        stud.submitStatus[a.id] = "missing";
      });

      newStudents.push(stud);
      addedCount++;
    });

    if (addedCount > 0) {
      const updatedCourse = {
        ...currentCourse,
        students: [...currentCourse.students, ...newStudents],
      };
      const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
      onUpdateCourses(updatedCourses);
      alert(`匯入完成！成功匯入 ${addedCount} 位學生。${duplicateCount > 0 ? `跳過 ${duplicateCount} 位學號重複的學生。` : ""}`);
      setRosterInput("");
    } else {
      alert("未能剖析出學生資料，請確認格式（學號 姓名 信箱）。");
    }
  };

  const handleDeleteStudent = (id: string) => {
    if (!currentCourse) return;
    if (confirm("確定要將這名學生移出此課程嗎？")) {
      const updatedStudents = currentCourse.students.filter((s) => s.id !== id);
      const updatedCourse = {
        ...currentCourse,
        students: updatedStudents,
      };
      const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
      onUpdateCourses(updatedCourses);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processExcelFile(file);
    }
  };

  const processExcelFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
      alert("不支援的檔案格式！請上傳 .xlsx, .xls 或 .csv 檔案。");
      return;
    }

    setExcelFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        if (rawRows.length === 0) {
          alert("此檔案中似乎沒有任何資料！");
          return;
        }

        // Intelligently identify columns
        let headerRowIdx = 0;
        let idColIdx = 0;
        let nameColIdx = 1;
        let emailColIdx = 2;
        let foundHeaders = false;

        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
          const row = rawRows[r] as any[];
          if (!row || !row.length) continue;
          
          let idIdx = -1, nameIdx = -1, emailIdx = -1;
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || "").trim().toLowerCase();
            if (
              val.includes("學號") || 
              val.includes("學籍") || 
              val.includes("学号") || 
              val === "id" || 
              val === "student id" || 
              val === "studentid" || 
              val === "student_id"
            ) {
              idIdx = c;
            } else if (
              val.includes("姓名") || 
              val === "name" || 
              val === "student name" || 
              val === "student_name"
            ) {
              nameIdx = c;
            } else if (
              val.includes("信箱") || 
              val.includes("郵件") || 
              val.includes("邮箱") || 
              val.includes("email") || 
              val.includes("mail") ||
              val.includes("電子信箱") ||
              val.includes("電子郵件")
            ) {
              emailIdx = c;
            }
          }
          if (idIdx !== -1 && nameIdx !== -1) {
            headerRowIdx = r;
            idColIdx = idIdx;
            nameColIdx = nameIdx;
            if (emailIdx !== -1) emailColIdx = emailIdx;
            else emailColIdx = -1;
            foundHeaders = true;
            break;
          }
        }

        const parsed: any[] = [];
        const startRow = foundHeaders ? headerRowIdx + 1 : 0;
        
        for (let i = startRow; i < rawRows.length; i++) {
          const row = rawRows[i] as any[];
          if (!row || row.length === 0) continue;
          
          const rawId = row[idColIdx];
          const rawName = row[nameColIdx];
          if (rawId === undefined || rawName === undefined) continue;
          
          const sId = String(rawId).trim();
          const sName = String(rawName).trim();
          if (!sId || !sName || sId.toLowerCase() === "id" || sId.toLowerCase().includes("學號")) continue;
          
          const sEmail = (emailColIdx !== -1 && row[emailColIdx]) 
            ? String(row[emailColIdx]).trim() 
            : `${sId}@example.com`;

          parsed.push({
            studentId: sId,
            name: sName,
            email: sEmail,
          });
        }

        if (parsed.length === 0) {
          alert("無法從檔案中剖析出學生名單。請確保包含「學號」與「姓名」欄位值。");
          setExcelStudents([]);
          return;
        }

        setExcelStudents(parsed);
      } catch (err) {
        console.error("Excel import failed:", err);
        alert("剖析 Excel/CSV 檔案出錯，請確認檔案格式正確且內容無損壞。");
      }
    };
    
    reader.readAsBinaryString(file);
  };

  const handleConfirmExcelImport = () => {
    if (!currentCourse || excelStudents.length === 0) return;

    let addedCount = 0;
    let duplicateCount = 0;
    const newStudents: Student[] = [];

    excelStudents.forEach((row) => {
      const id = row.studentId;
      const name = row.name;
      const email = row.email;

      const isDuplicate = currentCourse.students.some((s) => s.studentId === id) || 
                          newStudents.some((s) => s.studentId === id);

      if (isDuplicate) {
        duplicateCount++;
        return;
      }

      const stud: Student = {
        id: "std-" + Math.random().toString(36).substring(2, 9),
        studentId: id,
        name: name,
        email: email,
        grades: {},
        feedback: {},
        submitStatus: {},
      };

      currentCourse.assessments.forEach((a) => {
        stud.submitStatus[a.id] = "missing";
      });

      newStudents.push(stud);
      addedCount++;
    });

    if (addedCount > 0) {
      const updatedCourse = {
        ...currentCourse,
        students: [...currentCourse.students, ...newStudents],
      };
      const updatedCourses = courses.map((c) => (c.id === currentCourse.id ? updatedCourse : c));
      onUpdateCourses(updatedCourses);
      alert(`成功匯入 ${addedCount} 位學生！${duplicateCount > 0 ? `跳過 ${duplicateCount} 筆重複學號。` : ""}`);
      setExcelStudents([]);
      setExcelFileName("");
    } else {
      alert("所有學生的學號在課程中皆已重複，未做任何新增。");
    }
  };

  // Assessment total weight check
  const totalWeight = currentCourse ? currentCourse.assessments.reduce((sum, item) => sum + item.weight, 0) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-gray-800" id="id_course_setup_root">
      
      {/* LEFT: Course Directory & Selection */}
      <div className="lg:col-span-4 space-y-6">
        <ApiKeySettings />
        <div className="bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              課程目錄
            </h3>
            <button
              onClick={() => setIsCreatingCourse(!isCreatingCourse)}
              className="px-3 py-1 text-xs bg-blue-50 text-blue-600 font-medium rounded hover:bg-blue-100 transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              建立課程
            </button>
          </div>

          {/* New Course Form */}
          {isCreatingCourse && (
            <div className="mb-4 p-4 bg-blue-50/50 rounded border border-blue-100 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">課程名稱 (例如：微積分甲)</label>
                <input
                  type="text"
                  placeholder="學科名稱..."
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">學期代號 (Semester)</label>
                <input
                  type="text"
                  placeholder="114-1"
                  value={newCourseSemester}
                  onChange={(e) => setNewCourseSemester(e.target.value)}
                  className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setIsCreatingCourse(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 font-medium hover:text-slate-700"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateCourse}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white font-medium rounded hover:bg-blue-700"
                >
                  確認新增
                </button>
              </div>
            </div>
          )}

          {/* Courses selection list */}
          <div className="space-y-1.5">
            {courses.map((course) => {
              const isSelected = course.id === selectedCourseId;
              return (
                <div
                  key={course.id}
                  onClick={() => onSelectCourse(course.id)}
                  className={`group p-3.5 rounded cursor-pointer flex items-center justify-between border transition ${
                    isSelected
                      ? "bg-slate-900 border-slate-900 text-white font-bold"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div className="truncate">
                    <div className="font-semibold text-sm truncate">{course.name}</div>
                    <div className={`text-xs mt-0.5 ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
                      學期：{course.semester} • {course.students.length} 位學生
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCourse(course.id);
                    }}
                    className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition ${
                      isSelected ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic score summary status */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-slate-900 flex items-center gap-2 text-md">
            <Percent className="w-5 h-5 text-blue-500" />
            評分權重檢查
          </h4>
          <div className="p-4 rounded border border-slate-200 flex items-center gap-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${totalWeight === 100 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              {totalWeight === 100 ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">目前配分權重總和</div>
              <div className="text-2xl font-bold font-display text-slate-900">{totalWeight}%</div>
              <div className="text-xs mt-0.5">
                {totalWeight === 100 ? (
                  <span className="text-emerald-600 font-semibold">總配分平衡 100% (完美)</span>
                ) : totalWeight > 100 ? (
                  <span className="text-red-500 font-semibold">已超出：多配了 {totalWeight - 100}%</span>
                ) : (
                  <span className="text-amber-600 font-semibold">尚有：仍剩餘 {100 - totalWeight}% 待分配</span>
                )}
              </div>
            </div>
          </div>

          {/* 及格門檻設定 */}
          {currentCourse && (
            <div className="mt-4 p-4 rounded border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400 font-medium">及格門檻</div>
                <p className="text-[11px] text-slate-400 mt-0.5">用於「期末及格需考」試算與及格上色</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={currentCourse.passMark ?? 60}
                  onChange={(e) => {
                    const v = e.target.value === "" ? 60 : Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    handleUpdateCourse({ passMark: v });
                  }}
                  className="w-16 text-center px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500 text-blue-700 font-bold"
                />
                <span className="text-xs text-slate-400">分</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Selected Course Configuration (Assessments & Roster) */}
      <div className="lg:col-span-8 space-y-6">
        {!currentCourse ? (
          <div className="bg-white p-12 text-center border border-slate-200 shadow-sm text-slate-400">
            請在左側選擇一個課程或建立新課程。
          </div>
        ) : (
          <>
            {/* Assessment settings block */}
            <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="space-y-0.5">
                  <h3 className="font-display font-semibold text-lg text-slate-900">
                    評分項目與權重設定
                  </h3>
                  <p className="text-xs text-slate-400">自訂各項作業、小考、考科，調整期末加權百分比</p>
                </div>
                <button
                  onClick={handleAddAssessment}
                  className="px-3.5 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  新增評分項目
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentCourse.assessments.map((asst, index) => (
                  <div
                    key={asst.id}
                    className="p-4 rounded bg-slate-50 border border-slate-200 hover:border-slate-300 transition relative group space-y-3"
                  >
                    <div className="flex items-center gap-2">
                       <select
                        value={asst.type}
                        onChange={(e) => handleUpdateAssessment(index, { type: e.target.value as any })}
                        className="text-xs bg-white border border-slate-200 rounded px-1.5 py-1 outline-none text-slate-600 font-medium"
                      >
                        <option value="hw">作業 (HW)</option>
                        <option value="quiz">小考 (Quiz)</option>
                        <option value="midterm">期中考</option>
                        <option value="final">期末考</option>
                        <option value="project">專題報告</option>
                        <option value="other">其他</option>
                      </select>
                      <input
                        type="text"
                        value={asst.name}
                        onChange={(e) => handleUpdateAssessment(index, { name: e.target.value })}
                        className="text-sm font-semibold bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white px-1 py-0.5 outline-none text-slate-700 flex-1 truncate"
                        placeholder="項目名稱..."
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>占加權比率:</span>
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={asst.weight}
                            onChange={(e) => handleUpdateAssessment(index, { weight: Number(e.target.value) || 0 })}
                            className="w-12 text-sm font-bold bg-white border border-slate-200 rounded text-blue-600 text-center py-0.5 outline-none"
                          />
                          <span className="ml-1 font-semibold">%</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteAssessment(asst.id)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition"
                        title="刪除此項"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* AI 評分標準 — 評分時會一併送給 Gemini 當依據 */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-slate-500 font-semibold">
                          AI 評分標準 / 配分依據（選填）
                        </label>
                        {onUpdateRubricTemplates && (
                          <div className="flex items-center gap-1.5">
                            {rubricTemplates.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) applyRubricTemplate(index, e.target.value); }}
                                className="text-[10px] px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-500 outline-none focus:border-blue-500"
                                title="套用評分標準範本"
                              >
                                <option value="">套用範本…</option>
                                {rubricTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            )}
                            <button
                              onClick={() => saveRubricAsTemplate(asst.rubric || "")}
                              className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 font-semibold"
                              title="把目前內容存成範本"
                            >
                              ＋存成範本
                            </button>
                          </div>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={asst.rubric || ""}
                        onChange={(e) => handleUpdateAssessment(index, { rubric: e.target.value })}
                        placeholder="例如：滿分 100。正確性 60%、推導完整 30%、表達清晰 10%；未寫時間/空間複雜度分析各扣 10 分。"
                        className="w-full text-[11px] p-2 bg-white border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700 leading-relaxed font-sans"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 評分標準範本庫 */}
            {onUpdateRubricTemplates && rubricTemplates.length > 0 && (
              <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-3">
                <h3 className="font-display font-semibold text-base text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  評分標準範本庫（{rubricTemplates.length}）
                </h3>
                <p className="text-[11px] text-slate-400 -mt-1">在各評分項目可用「套用範本」快速帶入；範本跨課程共用。</p>
                <div className="space-y-1.5">
                  {rubricTemplates.map((t) => (
                    <div key={t.id} className="flex items-start justify-between gap-2 border border-slate-200 rounded p-2.5">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-700 truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{t.content}</div>
                      </div>
                      <button
                        onClick={() => deleteRubricTemplate(t.id)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 flex-shrink-0"
                        title="刪除範本"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Students roster block */}
            <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="pb-2 border-b border-slate-200">
                <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  修課學生名單 ({currentCourse.students.length} 人)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">匯入、管理學生基本資料（包含學號與郵件，Gmail 辨識關聯需正確對應郵件地址）</p>
              </div>

              {/* Roster Input Tab Options */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Custom Single additions */}
                <div className="p-4 rounded border border-dashed border-slate-200 bg-slate-50 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">手動單筆新增</div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <label className="text-[10px] text-slate-400">學號 (必填)</label>
                        <input
                          type="text"
                          placeholder="111306001"
                          value={singleId}
                          onChange={(e) => setSingleId(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 outline-none focus:border-blue-500 rounded"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">姓名 (必填)</label>
                        <input
                          type="text"
                          placeholder="王小美"
                          value={singleName}
                          onChange={(e) => setSingleName(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 outline-none focus:border-blue-500 rounded"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] text-slate-400">電子信箱 (建議輸入)</label>
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={singleEmail}
                        onChange={(e) => setSingleEmail(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 outline-none focus:border-blue-500 rounded"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddSingleStudent}
                    disabled={!singleId || !singleName}
                    className="w-full mt-3 px-3 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold shadow hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
                  >
                    加入學生
                  </button>
                </div>

                {/* Batch text imports */}
                <div className="p-4 rounded border border-slate-200 bg-slate-50 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">複製貼上文字匯入</span>
                      <button
                        onClick={() => setShowHelper(!showHelper)}
                        className="text-slate-400 hover:text-blue-600 transition"
                        title="查看貼上格式範本"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>

                    {showHelper && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800 space-y-1 font-mono">
                        <div>建議格式：學號、姓名、電子信箱用空格或 Tab 分隔。</div>
                        <div className="font-mono bg-white p-1.5 border border-blue-200 text-slate-600">
                          1110020 王小明 xiaoming@gmail.com<br/>
                          1110021 李小華 xiaohua@gmail.com
                        </div>
                      </div>
                    )}

                    <textarea
                      rows={showHelper ? 2 : 4}
                      placeholder="貼上「學號 姓名 信箱」整表行列..."
                      value={rosterInput}
                      onChange={(e) => setRosterInput(e.target.value)}
                      className="w-full text-xs mt-3 p-2.5 bg-white border border-slate-200 rounded outline-none font-mono focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleBatchImport}
                    disabled={!rosterInput.trim()}
                    className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    解析並批次匯入
                  </button>
                </div>

                {/* Excel / CSV Importer */}
                <div 
                  className={`p-4 rounded border ${isDragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-slate-50"} space-y-3 flex flex-col justify-between`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                        Excel / CSV 檔案匯入
                      </span>
                    </div>

                    {!excelFileName ? (
                      <label className="mt-3 border-2 border-dashed border-slate-200 bg-white hover:border-blue-500 hover:bg-slate-50 transition cursor-pointer p-4 h-32 flex flex-col items-center justify-center text-center rounded-sm">
                        <FileUp className="w-8 h-8 text-slate-400 mb-1.5" />
                        <span className="text-[11px] font-bold text-slate-700">選擇或拖曳檔案至此</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">支援 .xlsx, .xls 或 .csv</span>
                        <input 
                          type="file" 
                          accept=".xlsx,.xls,.csv" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              processExcelFile(e.target.files[0]);
                            }
                          }}
                          className="hidden" 
                        />
                      </label>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-2 rounded text-[11px]">
                          <span className="font-semibold text-blue-900 truncate max-w-[130px]" title={excelFileName}>
                            📄 {excelFileName}
                          </span>
                          <span className="text-xs font-bold text-blue-800 flex-shrink-0">
                            共 {excelStudents.length} 筆
                          </span>
                        </div>

                        {/* Scrolling Preview rows */}
                        <div className="border border-slate-200 rounded-sm bg-white max-h-24 overflow-y-auto text-[10px] divide-y divide-slate-100">
                          {excelStudents.map((st, sidx) => (
                            <div key={sidx} className="p-1.5 flex justify-between gap-1.5 hover:bg-slate-50">
                              <span className="font-mono text-slate-500 font-semibold">{st.studentId}</span>
                              <span className="font-bold text-slate-700 truncate max-w-[80px]">{st.name}</span>
                              <span className="text-slate-400 truncate max-w-[90px]">{st.email}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={handleConfirmExcelImport}
                            className="px-2 py-1.5 text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition cursor-pointer"
                          >
                            確認匯入
                          </button>
                          <button
                            onClick={() => {
                              setExcelStudents([]);
                              setExcelFileName("");
                            }}
                            className="px-2 py-1.5 text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded transition cursor-pointer"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-400 leading-normal">
                    💡 首列需包含學號、姓名等標題；不吻合時預設以第一、二欄做剖析。
                  </div>
                </div>

              </div>

              {/* Registered Student Table */}
              <div className="mt-4 border border-slate-200 rounded-sm overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-slate-600 text-slate-600 text-xs font-medium border-b border-slate-200">
                      <th className="p-3">學號</th>
                      <th className="p-3">姓名</th>
                      <th className="p-3">Gmail / Email</th>
                      <th className="p-3 text-right">管理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs text-slate-600 bg-white">
                    {currentCourse.students.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400 bg-slate-50/10">
                          目前名單尚未有學員建立。請透過上方新增或匯入。
                        </td>
                      </tr>
                    ) : (
                      currentCourse.students.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-medium text-slate-700">{student.studentId}</td>
                          <td className="p-3 font-semibold text-slate-800">{student.name}</td>
                          <td className="p-3 text-slate-400">{student.email}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition"
                              title="移出此生"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </>
        )}
      </div>

    </div>
  );
}
