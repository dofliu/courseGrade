import { useState, useEffect, useMemo } from "react";
import { Printer, Shuffle, RotateCcw } from "lucide-react";

interface Participant {
  id: string;
  name: string;
}
interface SeatingChartProps {
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

export default function SeatingChart({ participants, courseName }: SeatingChartProps) {
  const [rows, setRows] = useState<number | "">(8);
  const [cols, setCols] = useState<number | "">(10);
  const [seatLayout, setSeatLayout] = useState<(Participant | null)[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [error, setError] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const numRows = typeof rows === "number" ? rows : 0;
  const numCols = typeof cols === "number" ? cols : 0;
  const totalSeats = useMemo(() => numRows * numCols, [numRows, numCols]);

  const reset = () => {
    setIsGenerated(false);
    setSeatLayout([]);
    setError("");
  };

  useEffect(() => {
    reset();
  }, [courseName, participants]);

  const generate = () => {
    setError("");
    if (numRows <= 0 || numCols <= 0) return setError("行數與列數必須大於 0。");
    const numSeats = numRows * numCols;
    if (participants.length > numSeats) {
      return setError(`座位數（${numSeats}）不足以容納 ${participants.length} 位學生，請增加行/列。`);
    }
    const shuffled = shuffleArray(participants);
    const seats: (Participant | null)[] = new Array(numSeats).fill(null);
    const n = participants.length;

    if (numSeats - n > n) {
      // 棋盤式分散：空位多時讓學生散開
      const black: number[] = [];
      const white: number[] = [];
      for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) ((r + c) % 2 === 0 ? black : white).push(r * numCols + c);
      let pi = 0;
      for (const idx of shuffleArray(black)) {
        if (pi < n) seats[idx] = shuffled[pi++];
        else break;
      }
      for (const idx of shuffleArray(white)) {
        if (pi < n) seats[idx] = shuffled[pi++];
        else break;
      }
    } else {
      const flat = [...shuffled, ...new Array(numSeats - n).fill(null)];
      const r = shuffleArray(flat);
      for (let i = 0; i < numSeats; i++) seats[i] = r[i];
    }
    setSeatLayout(seats);
    setIsGenerated(true);
  };

  const onDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const n = [...seatLayout];
    [n[draggedIndex], n[dropIndex]] = [n[dropIndex], n[draggedIndex]];
    setSeatLayout(n);
  };

  // 列印（瀏覽器列印對話框可選「另存為 PDF」）— 開新視窗只印座位表，免額外套件
  const printChart = () => {
    const cell = (p: Participant | null) =>
      `<div class="seat${p ? "" : " empty"}">${p ? `<b>${p.name}</b><span>${p.id}</span>` : ""}</div>`;
    const grid = seatLayout.map(cell).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>座位表 ${courseName}</title>
<style>
  body{font-family:"Microsoft JhengHei",sans-serif;padding:24px;}
  h2{text-align:center;margin:0 0 4px;} .date{text-align:center;color:#666;font-size:13px;}
  .podium{margin:10px auto;width:200px;height:8px;background:#2563eb;border-radius:4px;}
  .podium-label{text-align:center;color:#666;font-size:12px;margin-bottom:16px;}
  .grid{display:grid;grid-template-columns:repeat(${numCols},1fr);gap:8px;}
  .seat{border:1px solid #cbd5e1;border-radius:6px;aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px;background:#fff;}
  .seat.empty{background:#f8fafc;border-style:dashed;}
  .seat b{font-size:13px;} .seat span{font-size:10px;color:#64748b;}
  @media print{ .grid{gap:6px;} }
</style></head><body>
  <h2>${courseName}－座位表</h2>
  <div class="date">${new Date().toLocaleDateString("zh-TW")}</div>
  <div class="podium"></div><div class="podium-label">（講台）</div>
  <div class="grid">${grid}</div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  if (participants.length === 0) {
    return (
      <div className="flex justify-center items-center p-6 min-h-[360px]">
        <p className="text-center text-xl text-slate-400">請先選擇課程以使用座位安排功能。</p>
      </div>
    );
  }

  const seatInput = (label: string, value: number | "", setter: (v: number | "") => void) => (
    <div className="flex items-center gap-2">
      <label className="text-slate-700 font-semibold">{label}：</label>
      <input
        type="number"
        value={value}
        onChange={(e) => setter(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
        className="w-20 p-2 text-center rounded-lg border-2 border-slate-200 bg-white outline-none focus:border-blue-500"
      />
    </div>
  );

  return (
    <div className="p-6">
      <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-6">
        <h2 className="text-xl font-bold text-center text-blue-600 mb-4">🪑 隨機座位安排</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {seatInput("行", rows, setRows)}
          {seatInput("列", cols, setCols)}
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={isGenerated}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Shuffle className="w-4 h-4" />
              產生座位表
            </button>
            <button
              onClick={reset}
              className="bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 px-5 rounded-lg transition border border-slate-200 flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              重設
            </button>
          </div>
        </div>
        <div className="text-center text-sm text-slate-500 mt-3">
          總座位數：{totalSeats}　學生人數：{participants.length}
        </div>
        {error && <p className="text-red-500 text-center mt-3">{error}</p>}
      </div>

      {isGenerated && (
        <>
          <div className="mb-4 flex justify-between items-center">
            <p className="text-xs text-slate-400">拖曳座位上的學生即可互換位置</p>
            <button
              onClick={printChart}
              className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded font-semibold hover:bg-slate-700 transition flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              列印 / 存 PDF
            </button>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">{courseName}－座位表</h3>
              <p className="text-sm text-slate-400">{new Date().toLocaleDateString("zh-TW")}</p>
              <div className="mt-2 mx-auto w-48 h-2 bg-blue-600 rounded-full" />
              <p className="text-slate-400 text-sm mt-1">（講台）</p>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))` }}>
              {seatLayout.map((p, index) => {
                const isDragged = draggedIndex === index;
                const isTarget = dragOverIndex === index;
                return (
                  <div
                    key={`seat-${index}`}
                    draggable={!!p}
                    onDragStart={() => p && setDraggedIndex(index)}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (index !== draggedIndex) setDragOverIndex(index);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(index);
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`relative flex items-center justify-center border rounded-md transition aspect-[4/3]
                      ${p ? "cursor-move" : "cursor-default"}
                      ${isDragged ? "opacity-50 scale-95" : ""}
                      ${isTarget ? "ring-2 ring-blue-500 border-blue-400" : "border-slate-200"}
                      ${p ? "bg-white shadow-sm" : "bg-slate-100/50 border-dashed"}`}
                  >
                    {p && (
                      <div className="text-center p-1">
                        <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate" title={p.name}>{p.name}</div>
                        <div className="text-slate-400 text-[10px] sm:text-xs truncate" title={p.id}>{p.id}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
