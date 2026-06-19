import { useState } from "react";
import { Course, Student, AssessmentItem } from "../types";
import { accumulatedWeighted } from "../lib/grades";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Award, CheckCircle, HelpCircle, Users, BarChart3, Mail, Copy, Check, FileDown, BookOpen, AlertCircle } from "lucide-react";

interface GradingDashboardProps {
  courses: Course[];
  selectedCourseId: string;
}

export default function GradingDashboard({
  courses,
  selectedCourseId,
}: GradingDashboardProps) {
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const [targetAsstId, setTargetAsstId] = useState("");
  const [copiedRemindText, setCopiedRemindText] = useState(false);

  if (!currentCourse) {
    return (
      <div className="bg-white p-12 text-center rounded-2xl border border-gray-100 text-slate-400">
        找不到任何有效的課程，請先至課程設定。
      </div>
    );
  }

  // Handle default assessment selection
  if (!targetAsstId && currentCourse.assessments.length > 0) {
    setTargetAsstId(currentCourse.assessments[0].id);
  }

  const students = currentCourse.students;
  const assessments = currentCourse.assessments;
  const activeAssessment = assessments.find((a) => a.id === targetAsstId) || assessments[0];

  // 1. 目前累計加權分（共用邏輯見 lib/grades）
  const calculateWeightedGrade = (student: Student) => accumulatedWeighted(student.grades, assessments);

  const studentWithFinals = students.map((s) => ({
    ...s,
    finalWeighted: calculateWeightedGrade(s),
  }));

  // 2. Metrics Summaries
  const studentCount = students.length;
  
  // Class final average
  const finalClassAverage = studentCount > 0
    ? Math.round((studentWithFinals.reduce((sum, s) => sum + s.finalWeighted, 0) / studentCount) * 10) / 10
    : 0;

  // Active assignment statistics
  const activeGrades = targetAsstId 
    ? students.map((s) => s.grades[targetAsstId]).filter((g) => g != null) as number[]
    : [];

  const activeAsstAverage = activeGrades.length > 0
    ? Math.round((activeGrades.reduce((sum, g) => sum + g, 0) / activeGrades.length) * 10) / 10
    : 0;

  // Submitted vs Missing
  const missingStudents = targetAsstId
    ? students.filter((s) => s.grades[targetAsstId] == null)
    : [];

  const submittedCount = studentCount - missingStudents.length;
  const submissionRate = studentCount > 0 
    ? Math.round((submittedCount / studentCount) * 100) 
    : 0;

  // 3. Distribution chart for active assessment
  const buckets = [
    { range: "0-59 (不及格)", count: 0, color: "#ef4444" },
    { range: "60-69 (丙)", count: 0, color: "#f97316" },
    { range: "70-79 (乙)", count: 0, color: "#eab308" },
    { range: "80-89 (甲)", count: 0, color: "#6366f1" },
    { range: "90-100 (優)", count: 0, color: "#10b981" },
  ];

  activeGrades.forEach((score) => {
    if (score < 60) buckets[0].count++;
    else if (score < 70) buckets[1].count++;
    else if (score < 80) buckets[2].count++;
    else if (score < 90) buckets[3].count++;
    else buckets[4].count++;
  });

  // Calculate missing reminder mail text
  const getReminderTemplate = () => {
    if (!activeAssessment) return "";
    const namesList = missingStudents.map((s) => `${s.name} (${s.studentId})`).join("、\n");
    return `【催繳通知】${currentCourse.name} - ${activeAssessment.name}

諸位同學好，
系統統計到您目前的評分項目「${activeAssessment.name}」尚無作業檔案上傳或評定記錄。

未繳交同學清單如下：
${namesList || "（目前全數繳交完畢）"}

請儘速將作業寄至教授信箱，或補交至助教系統，以免影響期末成績權益。

祝學安,
${currentCourse.semester} 課程助教組`;
  };

  const handleCopyReminder = () => {
    navigator.clipboard.writeText(getReminderTemplate());
    setCopiedRemindText(true);
    setTimeout(() => setCopiedRemindText(false), 2000);
  };

  return (
    <div className="space-y-6 text-slate-800" id="id_grading_dashboard_root">
      
      {/* SCORE CARDS ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <h3 className="font-display font-semibold text-xl text-slate-900 tracking-tight">
          {currentCourse.name} 學期總體數據分析 (KPI Dashboard)
        </h3>
        <span className="text-[11px] font-mono text-slate-400">最後同步時間: {new Date().toLocaleTimeString()}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total students */}
        <div className="bg-white p-5 border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">修課總學員</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-display">{studentCount}</span>
              <span className="text-slate-400 text-xs">/ 人</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1 mt-3">
            <div className="bg-blue-500 h-1 w-full"></div>
          </div>
        </div>

        {/* Weighted final average */}
        <div className="bg-white p-5 border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">全班平均累計加權分</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600 font-display">{finalClassAverage}</span>
              <span className="text-blue-500 text-xs">/ 100</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1 mt-3">
            <div className="bg-blue-600 h-1" style={{ width: `${Math.min(finalClassAverage || 0, 100)}%` }}></div>
          </div>
        </div>

        {/* Selected assessment average */}
        <div className="bg-white p-5 border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">主項平均 ({activeAssessment?.name || "無"})</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-display">{activeAsstAverage}</span>
              <span className="text-slate-400 text-xs">分</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1 mt-3">
            <div className="bg-amber-500 h-1" style={{ width: `${Math.min(activeAsstAverage || 0, 100)}%` }}></div>
          </div>
        </div>

        {/* Target assessment submission rate */}
        <div className="bg-white p-5 border border-slate-200 shadow-sm flex flex-col justify-between h-32">
          <div>
            <p className="text-slate-500 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">主項繳交比率</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-600 font-display">{submissionRate}%</span>
              <span className="text-slate-400 text-slate-400 text-xs">({submittedCount}/{studentCount})</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1 mt-3">
            <div className="bg-green-500 h-1" style={{ width: `${submissionRate}%` }}></div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* BELL CURVE BAR CHART */}
        <div className="lg:col-span-8 bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h4 className="font-display font-semibold text-slate-900 text-md flex items-center gap-1.5">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                項目成績區間分佈統計
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">即時統計各項目不同分數階段的同學人數比例</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">切換評估:</span>
              <select
                value={targetAsstId}
                onChange={(e) => setTargetAsstId(e.target.value)}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded outline-none bg-slate-50 text-slate-700 font-medium focus:border-blue-500"
              >
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-72 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 0" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,130,246,0.03)' }}
                  contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '4px', color: 'white', fontSize: '11px' }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={45}>
                  {buckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.range.includes("90-100") || entry.range.includes("80-89") ? "#2563eb" : entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* UN-SUBMITTED REMIND ASSISTANT */}
        <div className="lg:col-span-4 bg-white p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-100 space-y-1">
              <h4 className="font-display font-semibold text-slate-900 text-md flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                未交名單與催促助手
              </h4>
              <p className="text-xs text-slate-400">目前「{activeAssessment?.name || "作業"}」項目中，尚未取得評分者</p>
            </div>

            {/* List of outstanding students */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {missingStudents.length === 0 ? (
                <div className="py-8 text-center text-emerald-700 bg-emerald-50 rounded p-3 border border-emerald-100 flex flex-col items-center justify-center space-y-1.5">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="text-xs font-bold">全體修課生皆已完成評分！</span>
                </div>
              ) : (
                missingStudents.map((stud) => (
                  <div
                    key={stud.id}
                    className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs rounded flex items-center justify-between border border-slate-200"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{stud.name}</span>
                      <span className="text-slate-400 ml-1.5 font-mono">({stud.studentId})</span>
                    </div>
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-semibold font-mono">
                      未交 (缺)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Copy Template helper */}
          {missingStudents.length > 0 && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded space-y-2.5">
              <div className="flex items-center justify-between text-xs text-blue-800">
                <span className="font-semibold flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  教授專用催繳信件範本
                </span>
                
                <button
                  onClick={handleCopyReminder}
                  className="p-1 hover:bg-blue-100 text-blue-700 rounded transition flex items-center gap-1"
                >
                  {copiedRemindText ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="text-[10px] font-semibold">{copiedRemindText ? "已複製" : "複製範本"}</span>
                </button>
              </div>

              <textarea
                readOnly
                rows={3}
                value={getReminderTemplate()}
                className="w-full text-[10px] p-2 bg-white border border-slate-200 rounded outline-none font-sans text-slate-600 select-all"
              />
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
