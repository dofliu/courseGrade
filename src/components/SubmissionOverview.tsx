import { Course, Student } from "../types";
import { ClipboardList, CheckCircle2, Clock, XCircle, Lock } from "lucide-react";

interface SubmissionOverviewProps {
  courses: Course[];
  selectedCourseId: string;
}

// 一格的狀態：已評分 / 已繳待評 / 未開放 / 未繳
type CellState = "graded" | "submitted" | "unreleased" | "missing";

export default function SubmissionOverview({
  courses,
  selectedCourseId,
}: SubmissionOverviewProps) {
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  if (!currentCourse) {
    return (
      <div className="bg-white p-12 text-center border border-slate-200 shadow-sm text-slate-400">
        找不到課程資料，請先至課程設定建立課程。
      </div>
    );
  }

  const { students, assessments } = currentCourse;

  // 判斷某學生在某項目的狀態：有分數即「已評分」，否則看繳交狀態
  const cellState = (s: Student, aId: string): CellState => {
    if (s.grades[aId] != null) return "graded";
    const st = s.submitStatus[aId];
    if (st === "submitted") return "submitted";
    if (st === "unreleased") return "unreleased";
    return "missing";
  };

  // 目前累計加權分：實際已取得的加權分數（score×權重/100 加總），未評/未繳以 0 計、不正規化。
  const calcWeighted = (s: Student): number | null => {
    let earned = 0;
    let any = false;
    assessments.forEach((a) => {
      const sc = s.grades[a.id];
      if (sc != null) {
        earned += (sc * a.weight) / 100;
        any = true;
      }
    });
    return any ? Math.round(earned * 10) / 10 : null;
  };

  // 找出「期末考」項目：優先用 type=final，否則用名稱（含「期末」「考」且非「加分」）
  const PASS_MARK = 60;
  const finalAsst =
    assessments.find((a) => a.type === "final") ||
    assessments.find((a) => a.name.includes("期末") && a.name.includes("考") && !a.name.includes("加分")) ||
    null;

  // 期末考要考幾分才能讓「累計加權分」達及格門檻
  const neededOnFinal = (
    s: Student
  ): { kind: "nofinal" | "done" | "passed" | "need" | "impossible"; need?: number } => {
    if (!finalAsst) return { kind: "nofinal" };
    if (s.grades[finalAsst.id] != null) return { kind: "done" }; // 期末已考過

    // 排除期末考本身，把其他已評項目的加權分加總（已銀行的分數）
    let banked = 0;
    assessments.forEach((a) => {
      if (a.id === finalAsst.id) return;
      const sc = s.grades[a.id];
      if (sc != null) banked += (sc * a.weight) / 100;
    });
    if (banked >= PASS_MARK) return { kind: "passed" }; // 不靠期末已及格

    const fw = finalAsst.weight / 100;
    const need = fw > 0 ? (PASS_MARK - banked) / fw : Infinity;
    if (need > 100) return { kind: "impossible", need: Math.ceil(need) };
    return { kind: "need", need: Math.ceil(need) };
  };

  // 每個項目（欄）的繳交統計
  const columnStats = assessments.map((a) => {
    let graded = 0;
    let submitted = 0;
    let unreleased = 0;
    let missing = 0;
    students.forEach((s) => {
      const st = cellState(s, a.id);
      if (st === "graded") graded++;
      else if (st === "submitted") submitted++;
      else if (st === "unreleased") unreleased++;
      else missing++;
    });
    const turnedIn = graded + submitted;
    const rate = students.length ? Math.round((turnedIn / students.length) * 100) : 0;
    return { graded, submitted, unreleased, missing, turnedIn, rate };
  });

  const renderCell = (s: Student, aId: string) => {
    const st = cellState(s, aId);
    if (st === "graded") {
      const score = s.grades[aId];
      return (
        <span className={score < 60 ? "text-red-500 font-bold" : "text-slate-700 font-semibold"}>
          {score}
        </span>
      );
    }
    if (st === "submitted") {
      return (
        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-semibold whitespace-nowrap">
          已繳待評
        </span>
      );
    }
    if (st === "unreleased") {
      return <span className="text-slate-300 text-[10px]">未開放</span>;
    }
    return (
      <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded text-[10px] font-semibold whitespace-nowrap">
        未繳
      </span>
    );
  };

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-5 text-slate-800" id="id_submission_overview_root">
      {/* HEADER + LEGEND */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            {currentCourse.name}　繳交總覽
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            一覽全班在各項作業、考試、專題的「繳交狀態」與「分數」（{students.length} 位學生 × {assessments.length} 個項目）
          </p>
        </div>

        {/* 狀態圖例 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />已評分（分數）</span>
          <span className="flex items-center gap-1 text-amber-700"><Clock className="w-3.5 h-3.5 text-amber-600" />已繳待評</span>
          <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5 text-red-500" />未繳</span>
          <span className="flex items-center gap-1 text-slate-400"><Lock className="w-3.5 h-3.5 text-slate-300" />未開放</span>
        </div>
      </div>

      {/* MATRIX TABLE */}
      <div className="border border-slate-200 overflow-x-auto">
        <table className="w-full text-left min-w-[920px] border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs font-display">
              <th className="p-3 w-28">學號</th>
              <th className="p-3 w-24">姓名</th>
              {assessments.map((a) => (
                <th key={a.id} className="p-3 text-center truncate" title={`${a.name}（佔 ${a.weight}%）`}>
                  <div className="truncate max-w-[120px] mx-auto">{a.name}</div>
                  <div className="text-[10px] text-slate-400 pt-0.5 font-medium">佔 {a.weight}%</div>
                </th>
              ))}
              <th className="p-3 text-right text-blue-600 font-bold w-28">目前累計加權分</th>
              <th className="p-3 text-center text-amber-700 font-bold w-32" title={finalAsst ? `要讓累計加權分達 ${PASS_MARK} 分，${finalAsst.name}（佔 ${finalAsst.weight}%）需考幾分` : "本課程未設定期末考項目"}>
                <div>期末及格需考</div>
                <div className="text-[10px] text-slate-400 pt-0.5 font-medium">達 {PASS_MARK} 分</div>
              </th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-200 bg-white">
            {students.length === 0 ? (
              <tr>
                <td colSpan={assessments.length + 4} className="p-12 text-center text-slate-400">
                  此課程尚無學生，請先至「課程與配分管理」匯入名單。
                </td>
              </tr>
            ) : (
              students.map((s) => {
                const weighted = calcWeighted(s);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-medium text-slate-600">{s.studentId}</td>
                    <td className="p-3 font-bold text-slate-800">{s.name}</td>
                    {assessments.map((a) => (
                      <td key={a.id} className="p-3 text-center">
                        {renderCell(s, a.id)}
                      </td>
                    ))}
                    <td className="p-3 text-right font-display font-black pr-4">
                      {weighted == null ? (
                        <span className="text-slate-300 text-xs font-normal">—</span>
                      ) : (
                        <span className={weighted < 60 ? "text-red-500" : "text-blue-600"}>{weighted} 分</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {(() => {
                        const nf = neededOnFinal(s);
                        if (nf.kind === "nofinal") return <span className="text-slate-300">—</span>;
                        if (nf.kind === "done") return <span className="text-slate-400 text-[11px]">期末已考</span>;
                        if (nf.kind === "passed") return <span className="text-emerald-600 font-semibold text-[11px]">已穩過</span>;
                        if (nf.kind === "impossible") return <span className="text-red-500 font-semibold text-[11px]" title={`需 ${nf.need} 分，超過滿分`}>滿分仍不及格</span>;
                        return <span className="text-amber-600 font-bold">{nf.need} 分</span>;
                      })()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* 每欄繳交統計列 */}
          {students.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 text-[10px] text-slate-500 font-semibold">
                <td className="p-3" colSpan={2}>繳交率（已繳 / 總人數）</td>
                {assessments.map((a, i) => {
                  const st = columnStats[i];
                  return (
                    <td key={a.id} className="p-2 text-center">
                      <div className={`font-bold text-xs ${st.rate >= 80 ? "text-emerald-600" : st.rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                        {st.rate}%
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        評{st.graded}・繳{st.submitted}・缺{st.missing}
                      </div>
                    </td>
                  );
                })}
                <td className="p-3"></td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
