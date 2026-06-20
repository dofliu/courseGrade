import { useState, useMemo, useEffect } from "react";
import { Course } from "../types";
import { Grid3x3, Dices, Hand, Armchair } from "lucide-react";
import LotteryPicker from "./classroom/LotteryPicker";
import RollCallPicker from "./classroom/RollCallPicker";
import SeatingChart from "./classroom/SeatingChart";

interface ClassroomToolsProps {
  courses: Course[];
  selectedCourseId: string;
}

type ToolMode = "lottery" | "rollcall" | "seating";

// 注意：目前學生清單來自課程的 students（沿用既有資料）；待 B 模組 roster 完成後可改接 roster。
export default function ClassroomTools({ courses, selectedCourseId }: ClassroomToolsProps) {
  const [courseId, setCourseId] = useState(selectedCourseId);
  const [mode, setMode] = useState<ToolMode>("lottery");

  useEffect(() => {
    if (selectedCourseId) setCourseId(selectedCourseId);
  }, [selectedCourseId]);

  const course = courses.find((c) => c.id === courseId) || courses[0];

  const participants = useMemo(
    () => (course?.students || []).map((s) => ({ id: s.studentId, name: s.name })),
    [course]
  );

  const tabs: { key: ToolMode; label: string; icon: typeof Dices }[] = [
    { key: "lottery", label: "報告抽籤", icon: Dices },
    { key: "rollcall", label: "課程點名", icon: Hand },
    { key: "seating", label: "安排座位", icon: Armchair },
  ];

  return (
    <div className="bg-white border border-slate-200 shadow-sm" id="id_classroom_tools_root">
      <div className="p-6 border-b border-slate-200">
        <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
          <Grid3x3 className="w-5 h-5 text-blue-600" />
          課堂工具
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">隨機抽籤、課程點名與座位安排（學生名單取自所選課程）</p>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-semibold text-slate-600">選擇課程</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.students.length} 人）
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">目前名單：<span className="font-bold text-blue-600">{participants.length}</span> 人</span>
        </div>
      </div>

      {participants.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          此課程目前沒有學生名單，請先到「課程與配分管理」匯入學生。
        </div>
      ) : (
        <>
          <div className="flex gap-2 p-4 border-b border-slate-200">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setMode(t.key)}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-1.5 ${
                    mode === t.key
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {mode === "lottery" && <LotteryPicker participants={participants} courseName={course?.name || ""} />}
          {mode === "rollcall" && <RollCallPicker participants={participants} courseName={course?.name || ""} />}
          {mode === "seating" && <SeatingChart participants={participants} courseName={course?.name || ""} />}
        </>
      )}
    </div>
  );
}
