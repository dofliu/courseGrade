import { useState, useEffect } from "react";
import { KeyRound, Loader, Check, ExternalLink, Cpu } from "lucide-react";

interface ModelOption {
  id: string;
  label: string;
}
interface SettingsStatus {
  hasGeminiKey: boolean;
  geminiKeyMasked: string;
  geminiKeySource: "env" | "config" | "none";
  geminiModel: string;
  geminiModelEnv: string;
  modelOptions: ModelOption[];
}

// app 內設定 Gemini API key 與模型（桌面版用；網頁版也可用）。寫入本機 config.json，即時生效。
export default function ApiKeySettings({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [model, setModel] = useState("");
  const [savingModel, setSavingModel] = useState(false);
  const [modelMsg, setModelMsg] = useState("");

  const load = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: SettingsStatus) => {
        setStatus(s);
        setModel(s.geminiModel || "");
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const saveModel = async () => {
    const m = model.trim();
    if (!m) return;
    setSavingModel(true);
    setModelMsg("");
    try {
      const r = await fetch("/api/settings/gemini-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "儲存失敗");
      setModelMsg(`✓ 已切換為 ${d.geminiModel}，即時生效。`);
      load();
      onChange?.();
    } catch (e: any) {
      setModelMsg("❌ " + e.message);
    } finally {
      setSavingModel(false);
    }
  };

  const save = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      const r = await fetch("/api/settings/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "儲存失敗");
      setKey("");
      setStatus({ hasGeminiKey: d.hasGeminiKey, geminiKeyMasked: d.geminiKeyMasked, geminiKeySource: d.geminiKeySource });
      setMsg(
        d.overriddenByEnv
          ? "已存檔，但目前由環境變數 GEMINI_API_KEY 優先生效（要改用此 key 需清掉環境變數或重啟）。"
          : "✓ 已儲存並即時生效，現在可使用 AI 功能。"
      );
      onChange?.();
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel =
    status?.geminiKeySource === "env" ? "環境變數" : status?.geminiKeySource === "config" ? "app 設定" : "未設定";

  return (
    <div className="bg-white p-6 border border-slate-200 shadow-sm space-y-3">
      <h3 className="font-display font-semibold text-base text-slate-900 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-blue-600" />
        AI 金鑰設定（Gemini API Key）
      </h3>

      <div className="text-xs">
        {status?.hasGeminiKey ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            <Check className="w-3.5 h-3.5" /> 已設定（{sourceLabel}）{status.geminiKeyMasked && `・${status.geminiKeyMasked}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            尚未設定，AI 評分／出題會無法使用
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="貼上 Gemini API key…"
          className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500 font-mono"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <button
          onClick={save}
          disabled={saving || !key.trim()}
          className="px-3.5 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          儲存
        </button>
      </div>

      {msg && <div className="text-[11px] text-slate-500 leading-relaxed">{msg}</div>}

      {/* 模型選擇 */}
      <div className="pt-2 border-t border-slate-100">
        <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mb-1.5">
          <Cpu className="w-3.5 h-3.5 text-blue-600" />
          AI 模型
        </label>
        <div className="flex items-center gap-2">
          <select
            value={(status?.modelOptions || []).some((o) => o.id === model) ? model : "__custom__"}
            onChange={(e) => { if (e.target.value !== "__custom__") setModel(e.target.value); }}
            className="flex-1 text-xs px-2 py-2 border border-slate-200 rounded outline-none focus:border-blue-500 bg-white text-slate-700"
          >
            {(status?.modelOptions || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            <option value="__custom__">自訂（手動輸入 id）…</option>
          </select>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型 id，如 gemini-3.1-flash-lite"
            className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={saveModel}
            disabled={savingModel || !model.trim()}
            className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {savingModel ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            套用
          </button>
        </div>
        {modelMsg && <div className="text-[11px] text-slate-500 leading-relaxed mt-1">{modelMsg}</div>}
        {status?.geminiModelEnv && status.geminiModel !== status.geminiModelEnv && (
          <div className="text-[10px] text-slate-400 mt-1">系統環境變數 GEMINI_MODEL={status.geminiModelEnv}，但 app 設定優先。</div>
        )}
      </div>

      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1"
      >
        取得 API key <ExternalLink className="w-3 h-3" />
      </a>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        金鑰只會存在本機 <code>edugrade-config.json</code>，不會上傳。若已用環境變數設定，環境變數優先。
      </p>
    </div>
  );
}
