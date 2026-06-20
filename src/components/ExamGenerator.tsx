import { useState, useRef } from "react";
import { Packer } from "docx";
import { Course, ExamPaper, ExamQuestion, ExamQuestionType, ExamDifficulty } from "../types";
import { buildExamDocument } from "../lib/examDocx";
import {
  FileText, Sparkles, Upload, X, Trash2, Plus, Printer, Save, Loader, FolderOpen, FileDown,
} from "lucide-react";

interface ExamGeneratorProps {
  courses: Course[];
  selectedCourseId: string;
  examPapers: ExamPaper[];
  onUpdateExamPapers: (papers: ExamPaper[]) => void;
}

interface UploadFile {
  name: string;
  mimeType: string;
  size: number;
  base64: string;
}

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  "multiple-choice": "選擇題",
  "true-false": "是非題",
  "fill-in-the-blank": "填空題",
};
const DIFF_LABEL: Record<ExamDifficulty, string> = { basic: "基礎", medium: "中等", advanced: "進階" };
const DIFF_POINTS: Record<ExamDifficulty, number> = { basic: 4, medium: 5, advanced: 8 };

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
  });

export default function ExamGenerator({ courses, selectedCourseId, examPapers, onUpdateExamPapers }: ExamGeneratorProps) {
  const [courseId, setCourseId] = useState(selectedCourseId || courses[0]?.id || "");
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<Set<ExamQuestionType>>(new Set(["multiple-choice", "true-false", "fill-in-the-blank"]));
  const [mode, setMode] = useState<"strict" | "creative">("strict");
  const [contentFocus, setContentFocus] = useState("");
  const [topics, setTopics] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const course = courses.find((c) => c.id === courseId) || courses[0];

  const toggleType = (t: ExamQuestionType) =>
    setTypes((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: UploadFile[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const lower = f.name.toLowerCase();
      const ok =
        f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("text/") ||
        [".pdf", ".docx", ".ipynb", ".txt"].some((e) => lower.endsWith(e));
      if (!ok) continue;
      next.push({ name: f.name, mimeType: f.type || "application/octet-stream", size: f.size, base64: await fileToBase64(f) });
    }
    setFiles((prev) => [...prev, ...next]);
  };

  const handleGenerate = async () => {
    if (!course) return;
    if (types.size === 0) {
      alert("請至少選一種題型。");
      return;
    }
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (totalBytes > 38 * 1024 * 1024) {
      alert(`講義檔案太大（約 ${(totalBytes / 1024 / 1024).toFixed(0)}MB），可能超過上傳上限。請減少份數或先壓縮 PDF。`);
      return;
    }
    setGenerating(true);
    setLogs([`🤖 正在依${files.length > 0 ? `${files.length} 份講義` : "章節範圍"}生成 ${count} 題...`]);
    try {
      const r = await fetch("/api/exam/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: course.name,
          count,
          questionTypes: Array.from(types),
          mode,
          contentFocus,
          topics,
          files: files.map((f) => ({ filename: f.name, mimeType: f.mimeType, base64: f.base64 })),
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "出題失敗");
      }
      const data = await r.json();
      setQuestions(data.questions || []);
      if (!title) setTitle(`${course.name} 小考（${new Date().toLocaleDateString("zh-TW")}）`);
      setLogs((prev) => [
        ...prev,
        `✓ 已生成 ${data.questions?.length || 0} 題。` +
          (data.skippedFiles?.length ? `（略過無法讀取：${data.skippedFiles.join("、")}）` : ""),
      ]);
    } catch (e: any) {
      setLogs((prev) => [...prev, `❌ ${e.message}`]);
    } finally {
      setGenerating(false);
    }
  };

  const updateQuestion = (idx: number, patch: Partial<ExamQuestion>) =>
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const updateOption = (idx: number, key: string, value: string) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, options: { ...(q.options || {}), [key]: value } } : q))
    );

  const addQuestion = () =>
    setQuestions((prev) => [
      ...prev,
      { id: `q-${Date.now()}`, type: "multiple-choice", question: "", options: { A: "", B: "", C: "", D: "" }, correctAnswer: "A", difficulty: "medium", points: 5 },
    ]);

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  const saveExam = () => {
    if (questions.length === 0) {
      alert("沒有題目可儲存。");
      return;
    }
    if (!course) return;
    const paper: ExamPaper = {
      id: `paper-${Date.now()}`,
      courseId: course.id,
      title: title.trim() || `${course.name} 考卷`,
      topics,
      createdAt: Date.now(),
      questions,
    };
    onUpdateExamPapers([paper, ...examPapers]);
    alert(`已儲存考卷「${paper.title}」（${questions.length} 題）。`);
  };

  const loadPaper = (p: ExamPaper) => {
    setCourseId(p.courseId);
    setTitle(p.title);
    setTopics(p.topics || "");
    setQuestions(p.questions);
    setLogs([`📂 已載入考卷「${p.title}」（${p.questions.length} 題）。`]);
  };

  const deletePaper = (id: string) => {
    if (confirm("確定刪除這份考卷？")) onUpdateExamPapers(examPapers.filter((p) => p.id !== id));
  };

  // 列印（瀏覽器列印對話框可另存 PDF）
  const printExam = (qs: ExamQuestion[], examTitle: string, withAnswer: boolean) => {
    const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const blocks = qs
      .map((q, i) => {
        let body = "";
        if (q.type === "multiple-choice" && q.options) {
          body = `<div class="opts">${Object.entries(q.options)
            .map(([k, v]) => `<div${withAnswer && q.correctAnswer === k ? ' class="ans"' : ""}>(${esc(k)}) ${esc(v)}</div>`)
            .join("")}</div>`;
        } else if (q.type === "true-false") {
          body = `<div class="tf">（　）是非　${withAnswer ? `<span class="ans">正解：${esc(q.correctAnswer)}</span>` : ""}</div>`;
        } else {
          body = `<div class="fill">作答：__________________ ${withAnswer ? `<span class="ans">正解：${esc(q.correctAnswer)}</span>` : ""}</div>`;
        }
        return `<div class="q"><div class="qh"><b>${i + 1}.</b> ${esc(q.question)} <span class="pt">(${q.points}分・${TYPE_LABEL[q.type]})</span></div>${body}</div>`;
      })
      .join("");
    const total = qs.reduce((s, q) => s + (q.points || 0), 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(examTitle)}</title>
<style>
  body{font-family:"Microsoft JhengHei",sans-serif;padding:28px;color:#111;font-size:14px;}
  h1{text-align:center;font-size:20px;margin:0 0 4px;}
  .meta{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px;font-size:13px;}
  .info{margin-bottom:16px;font-size:13px;}
  .q{margin:0 0 14px;page-break-inside:avoid;} .qh{margin-bottom:4px;}
  .pt{color:#666;font-size:12px;} .opts div{margin:2px 0 2px 18px;} .tf,.fill{margin-left:18px;color:#333;}
  .ans{color:#c00;font-weight:bold;}
  @media print{ .q{margin-bottom:12px;} }
</style></head><body>
  <h1>${esc(examTitle)}${withAnswer ? "（教師答案卷）" : ""}</h1>
  <div class="meta"><span>${esc(course?.name || "")}</span><span>滿分：${total} 分　共 ${qs.length} 題</span></div>
  ${withAnswer ? "" : '<div class="info">班級：__________　座號：______　姓名：__________　學號：__________</div>'}
  ${blocks}
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  // 匯出 Word .docx（可在 Word 直接編輯）
  const exportDocx = async (qs: ExamQuestion[], examTitle: string, withAnswer: boolean) => {
    if (qs.length === 0) {
      alert("沒有題目可匯出。");
      return;
    }
    const doc = buildExamDocument({ title: examTitle, courseName: course?.name || "", questions: qs, withAnswer });
    const blob = await Packer.toBlob(doc);
    const safe = (examTitle || "考卷").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}${withAnswer ? "_答案卷" : "_學生卷"}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const coursePapers = examPapers.filter((p) => !course || p.courseId === course.id);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 text-slate-800" id="id_exam_generator_root">
      {/* LEFT: settings + upload + saved */}
      <div className="xl:col-span-4 space-y-6">
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            AI 出題設定
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">課程</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none bg-slate-50 focus:border-blue-500 font-semibold text-slate-700">
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-600">題數</label>
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 text-sm font-bold text-center px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500 text-blue-700" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">題型</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABEL) as ExamQuestionType[]).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer bg-slate-50 border border-slate-200 rounded px-2 py-1">
                  <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} className="w-3.5 h-3.5 accent-blue-600" />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">出題範圍模式</label>
            <div className="flex gap-2">
              {([["strict", "嚴格（只用講義）"], ["creative", "延伸（以講義為基礎）"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 text-[11px] py-1.5 px-2 rounded font-semibold border transition ${
                    mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">額外指示（選填）</label>
            <input type="text" value={contentFocus} onChange={(e) => setContentFocus(e.target.value)}
              placeholder="如：偏重計算題、避免直接抄定義"
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">章節範圍（沒上傳講義時用）</label>
            <input type="text" value={topics} onChange={(e) => setTopics(e.target.value)}
              placeholder="如：第3章 桁架、第4章 摩擦"
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* 講義上傳 */}
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-3">
          <h4 className="font-display font-medium text-sm text-slate-700 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            上傳講義（可多份）
          </h4>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-100 transition rounded"
          >
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-700">點擊或拖曳講義至此</div>
            <div className="text-[10px] text-slate-400 mt-0.5">支援 PDF / Word / Jupyter / 圖片 / txt</div>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.ipynb,.txt,image/*"
              onChange={(e) => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="hidden" />
          </div>
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded text-[11px]">
                  <span className="font-semibold text-blue-900 truncate max-w-[180px]" title={f.name}>📄 {f.name}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
            {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "生成中..." : "🤖 AI 生成題目"}
          </button>
          {logs.length > 0 && (
            <div className="h-24 bg-slate-900 p-2.5 text-[10px] font-mono text-emerald-400 overflow-y-auto rounded space-y-1">
              {logs.map((l, i) => <div key={i} className="break-all">{l}</div>)}
            </div>
          )}
        </div>

        {/* 已存考卷 */}
        {coursePapers.length > 0 && (
          <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-2">
            <h4 className="font-display font-medium text-sm text-slate-700">已儲存考卷</h4>
            {coursePapers.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={p.title}>{p.title}</span>
                  <button onClick={() => deletePaper(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{p.questions.length} 題</div>
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={() => loadPaper(p)} className="text-[10px] px-2 py-1 bg-slate-100 rounded hover:bg-slate-200 font-semibold">載入編輯</button>
                  <button onClick={() => printExam(p.questions, p.title, false)} className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-semibold">列印學生卷</button>
                  <button onClick={() => printExam(p.questions, p.title, true)} className="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 font-semibold">列印答案卷</button>
                </div>
                <div className="flex gap-1.5 mt-1">
                  <button onClick={() => exportDocx(p.questions, p.title, false)} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 font-semibold flex items-center gap-1"><FileDown className="w-3 h-3" /> Word學生卷</button>
                  <button onClick={() => exportDocx(p.questions, p.title, true)} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 font-semibold flex items-center gap-1"><FileDown className="w-3 h-3" /> Word答案卷</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: questions editor */}
      <div className="xl:col-span-8">
        <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                題目編輯（{questions.length} 題・滿分 {totalPoints}）
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">可手動增刪改；確認後存檔並列印</p>
            </div>
            {questions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="考卷標題"
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500 w-44" />
                <button onClick={saveExam} className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> 儲存
                </button>
                <button onClick={() => printExam(questions, title || "考卷", false)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> 列印學生卷
                </button>
                <button onClick={() => printExam(questions, title || "考卷", true)} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> 列印答案卷
                </button>
                <button onClick={() => exportDocx(questions, title || "考卷", false)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> Word學生卷
                </button>
                <button onClick={() => exportDocx(questions, title || "考卷", true)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> Word答案卷
                </button>
              </div>
            )}
          </div>

          {questions.length === 0 ? (
            <div className="py-20 text-center text-slate-400 space-y-2">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <div>上傳講義並按「AI 生成題目」，或手動新增題目。</div>
            </div>
          ) : (
            <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-slate-200 rounded p-4 space-y-2 bg-slate-50/40">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-slate-500 text-sm pt-1.5">{idx + 1}.</span>
                    <textarea rows={2} value={q.question} onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                      placeholder="題目內容" className="flex-1 text-sm p-2 border border-slate-200 rounded outline-none focus:border-blue-500 text-slate-700" />
                    <button onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-6 text-xs">
                    <select value={q.type} onChange={(e) => updateQuestion(idx, { type: e.target.value as ExamQuestionType })}
                      className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-600">
                      {(Object.keys(TYPE_LABEL) as ExamQuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                    <select value={q.difficulty}
                      onChange={(e) => { const d = e.target.value as ExamDifficulty; updateQuestion(idx, { difficulty: d, points: DIFF_POINTS[d] }); }}
                      className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-600">
                      {(Object.keys(DIFF_LABEL) as ExamDifficulty[]).map((d) => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
                    </select>
                    <span className="text-slate-400">配分</span>
                    <input type="number" min={0} value={q.points} onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) || 0 })}
                      className="w-14 text-center px-1 py-1 border border-slate-200 rounded text-blue-600 font-bold" />
                  </div>

                  {q.type === "multiple-choice" && (
                    <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {["A", "B", "C", "D"].map((k) => (
                        <div key={k} className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold w-4 ${q.correctAnswer === k ? "text-emerald-600" : "text-slate-400"}`}>{k}</span>
                          <input value={q.options?.[k] || ""} onChange={(e) => updateOption(idx, k, e.target.value)}
                            className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded outline-none focus:border-blue-500" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pl-6 flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-semibold">正解：</span>
                    {q.type === "multiple-choice" ? (
                      <select value={q.correctAnswer} onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                        className="px-2 py-1 border border-emerald-300 rounded bg-emerald-50 text-emerald-700 font-bold">
                        {["A", "B", "C", "D"].map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    ) : (
                      <input value={q.correctAnswer} onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                        placeholder={q.type === "true-false" ? "正確 / 錯誤" : "標準答案"}
                        className="flex-1 px-2 py-1 border border-emerald-300 rounded bg-emerald-50 text-emerald-700 font-semibold outline-none" />
                    )}
                  </div>
                </div>
              ))}
              <button onClick={addQuestion} className="w-full py-2 border-2 border-dashed border-slate-200 rounded text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> 新增題目
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
