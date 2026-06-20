import { useState, useEffect } from "react";
import { Download, Dice5, RefreshCw } from "lucide-react";

interface Participant {
  id: string;
  name: string;
}
interface RollCallPickerProps {
  participants: Participant[];
  courseName: string;
}

const shuffleArray = <T,>(array: T[]): T[] => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function RollCallPicker({ participants, courseName }: RollCallPickerProps) {
  const [numToSelect, setNumToSelect] = useState<number | "">(1);
  const [selected, setSelected] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const [callCounts, setCallCounts] = useState<Map<string, number>>(new Map());
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    const m = new Map<string, number>();
    participants.forEach((p) => m.set(p.id, 0));
    setCallCounts(m);
    setSelected([]);
  }, [participants, courseName]);

  const handleDraw = () => {
    setError("");
    const num = typeof numToSelect === "number" ? numToSelect : 0;
    if (num <= 0) return setError("請輸入大於 0 的數字。");
    if (num > participants.length) return setError(`點名人數不能超過總人數（${participants.length}）。`);

    // 分層隨機：優先點還沒被點到的
    const notYet: Participant[] = [];
    const once: Participant[] = [];
    const multi: Participant[] = [];
    participants.forEach((p) => {
      const c = callCounts.get(p.id) ?? 0;
      if (c === 0) notYet.push(p);
      else if (c === 1) once.push(p);
      else multi.push(p);
    });

    const final: Participant[] = [];
    let need = num;
    const take = (pool: Participant[]) => {
      if (need <= 0) return;
      const picked = shuffleArray(pool).slice(0, need);
      final.push(...picked);
      need -= picked.length;
    };
    take(notYet);
    take(once);
    take(multi);

    setSelected(final);
    const nc = new Map<string, number>(callCounts);
    const na = new Map<string, boolean>();
    final.forEach((s) => {
      nc.set(s.id, (nc.get(s.id) ?? 0) + 1);
      na.set(s.id, true);
    });
    setCallCounts(nc);
    setAttendance(na);
  };

  const toggleAttendance = (id: string) =>
    setAttendance((prev) => {
      const n = new Map(prev);
      n.set(id, !n.get(id));
      return n;
    });

  const handleExport = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const dt = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}`;
    let csv = "﻿序號,學號,姓名,出席狀態,點名時間\n";
    selected.forEach((s, i) => {
      const status = (attendance.get(s.id) ?? false) ? "出席" : "缺席";
      csv += `${i + 1},"${s.id}","${s.name}","${status}","${dt}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `點名紀錄_${courseName}_${ts}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const canDraw = participants.length > 0 && typeof numToSelect === "number" && numToSelect > 0;

  if (participants.length === 0) {
    return (
      <div className="flex justify-center items-center p-6 min-h-[360px]">
        <p className="text-center text-xl text-slate-400">請先選擇課程以使用點名功能。</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
        <h2 className="text-xl font-bold text-center text-blue-600 mb-4">課程隨機點名</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <label htmlFor="numToSelect" className="text-slate-700 font-semibold">選擇點名人數：</label>
          <input
            id="numToSelect"
            type="number"
            value={numToSelect}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") setNumToSelect("");
              else {
                const n = parseInt(v, 10);
                setNumToSelect(n > 0 ? n : "");
              }
            }}
            min={1}
            max={participants.length}
            className="bg-white border-2 border-slate-200 rounded-lg p-2.5 w-24 text-center text-lg font-bold text-slate-700 focus:border-blue-500 outline-none"
          />
          <button
            onClick={handleDraw}
            disabled={!canDraw}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-7 rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Dice5 className="w-4 h-4" />
            抽選
          </button>
        </div>
        {error && <p className="text-red-500 text-center mt-3">{error}</p>}
      </div>

      {selected.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">點名結果（{selected.length} 人）</h3>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              匯出紀錄 (CSV)
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
            {selected.map((s) => {
              const present = attendance.get(s.id);
              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg border-2 flex justify-between items-center ${
                    present ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${present ? "text-emerald-600" : "text-red-600"}`}>
                      {present ? "出席" : "缺席"}
                    </span>
                    <button
                      onClick={() => toggleAttendance(s.id)}
                      className="p-1 rounded-full bg-white hover:bg-slate-100 border border-slate-200"
                      title={`標記為${present ? "缺席" : "出席"}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
