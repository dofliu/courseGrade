import { useState, useEffect, useMemo } from "react";
import { Play, RotateCcw } from "lucide-react";

interface Participant {
  id: string;
  name: string;
}
interface LotteryPickerProps {
  participants: Participant[];
  courseName: string;
}

type AnimationPhase =
  | "idle"
  | "initialShuffle"
  | "revealAll"
  | "hideAll"
  | "finalShuffle"
  | "awaitingPick"
  | "revealingPick"
  | "winnerAnnounced";

const shuffleArray = <T,>(array: T[]): T[] => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function LotteryPicker({ participants, courseName }: LotteryPickerProps) {
  const [remaining, setRemaining] = useState<Participant[]>(participants);
  const [drawn, setDrawn] = useState<Participant[]>([]);
  const [phase, setPhase] = useState<AnimationPhase>("idle");
  const [cards, setCards] = useState<Participant[]>([]);
  const [cardOrder, setCardOrder] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [pickedData, setPickedData] = useState<Participant | null>(null);
  const [inProgress, setInProgress] = useState(false);

  const MAX = 20;

  useEffect(() => {
    setRemaining(participants);
    setDrawn([]);
    setPhase("idle");
    setInProgress(false);
  }, [courseName, participants]);

  const displayable = useMemo(() => remaining.slice(0, MAX), [remaining]);

  const start = () => {
    if (remaining.length === 0) return;
    setInProgress(true);
    setCards(displayable);
    setCardOrder(displayable.map((_, i) => i));
    setRevealed(new Array(displayable.length).fill(false));
    setPickedIdx(null);
    setPickedData(null);
    setPhase("initialShuffle");
  };

  const reset = () => {
    setRemaining(participants);
    setDrawn([]);
    setPhase("idle");
    setInProgress(false);
    setPickedIdx(null);
    setPickedData(null);
  };

  useEffect(() => {
    let timer: number | undefined;
    switch (phase) {
      case "initialShuffle":
        setCardOrder(shuffleArray(displayable.map((_, i) => i)));
        timer = window.setTimeout(() => setPhase("revealAll"), 750);
        break;
      case "revealAll":
        setRevealed(new Array(displayable.length).fill(true));
        timer = window.setTimeout(() => setPhase("hideAll"), 1500);
        break;
      case "hideAll":
        setRevealed(new Array(displayable.length).fill(false));
        timer = window.setTimeout(() => setPhase("finalShuffle"), 500);
        break;
      case "finalShuffle":
        setCardOrder(shuffleArray(displayable.map((_, i) => i)));
        timer = window.setTimeout(() => setPhase("awaitingPick"), 750);
        break;
      case "revealingPick":
        if (pickedIdx !== null) {
          setRevealed((prev) => {
            const n = [...prev];
            n[pickedIdx] = true;
            return n;
          });
          timer = window.setTimeout(() => setPhase("winnerAnnounced"), 2000);
        }
        break;
      case "winnerAnnounced":
        timer = window.setTimeout(() => {
          if (pickedData) {
            setDrawn((prev) => [...prev, pickedData]);
            setRemaining((prev) => prev.filter((p) => p.id !== pickedData.id));
          }
          setPhase("idle");
          setInProgress(false);
        }, 2500);
        break;
    }
    return () => clearTimeout(timer);
  }, [phase, displayable, pickedIdx, pickedData]);

  const clickCard = (visualIndex: number) => {
    if (phase === "awaitingPick") {
      setPickedIdx(visualIndex);
      const p = cards[cardOrder[visualIndex]];
      setPickedData(p);
      setPhase("revealingPick");
    }
  };

  const gridCols = Math.min(Math.ceil(Math.sqrt(cards.length || 1)), 5);

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="text-slate-700">
          <span className="text-sm text-slate-500">待抽: </span>
          <span className="font-bold text-lg text-blue-600">{remaining.length}</span>
          <span className="mx-3 text-slate-400">|</span>
          <span className="text-sm text-slate-500">已抽: </span>
          <span className="font-bold text-lg text-emerald-600">{drawn.length}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={start}
            disabled={inProgress || remaining.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            開始抽籤
          </button>
          <button
            onClick={reset}
            disabled={inProgress}
            className="bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 px-6 rounded-lg transition border border-slate-200 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            重設
          </button>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-6 min-h-[360px] flex items-center justify-center border border-slate-200">
        {phase === "idle" && !inProgress && remaining.length === 0 && (
          <p className="text-xl text-slate-400">✅ 所有人都已抽完！</p>
        )}
        {phase === "idle" && !inProgress && remaining.length > 0 && (
          <p className="text-xl text-slate-400">👆 點「開始抽籤」開始</p>
        )}
        {(phase !== "idle" || inProgress) && cards.length > 0 && (
          <div className="w-full">
            <div
              className="grid gap-3 w-full max-w-4xl mx-auto"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, perspective: "1000px" }}
            >
              {cardOrder.map((origIdx, visualIndex) => {
                const p = cards[origIdx];
                if (!p) return null;
                const isRevealed = revealed[visualIndex];
                const isPicked = pickedIdx === visualIndex;
                let dyn = "";
                if (phase === "winnerAnnounced" && isPicked) dyn = "ring-4 ring-emerald-400 scale-105 z-10";
                else if (phase === "revealingPick" && isPicked) dyn = "ring-4 ring-amber-400 scale-105 z-10";
                return (
                  <div
                    key={p.id + "-" + visualIndex}
                    className={`aspect-[3/4] cursor-pointer eg-flip-card rounded-lg ${dyn}`}
                    onClick={() => clickCard(visualIndex)}
                  >
                    <div className={`eg-flip-inner w-full h-full relative rounded-lg shadow-sm ${isRevealed ? "is-flipped" : ""}`}>
                      <div className="eg-flip-face eg-flip-back absolute w-full h-full bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                        <span className="text-4xl font-bold text-white/80">?</span>
                      </div>
                      <div className="eg-flip-face eg-flip-front absolute w-full h-full bg-white rounded-lg flex flex-col items-center justify-center text-center p-2 overflow-hidden border-2 border-slate-200">
                        <div className="font-bold text-slate-800 truncate w-full px-1 text-sm" title={p.name}>{p.name}</div>
                        <div className="text-slate-400 text-xs truncate w-full px-1" title={p.id}>{p.id}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-center h-8" aria-live="polite">
              {phase === "awaitingPick" && <p className="text-amber-500 animate-pulse text-lg font-semibold">請點選一張卡牌！</p>}
              {phase === "winnerAnnounced" && pickedData && (
                <p className="text-emerald-600 font-bold text-xl">🎉 本輪抽中：{pickedData.name}（{pickedData.id}）</p>
              )}
            </div>
          </div>
        )}
      </div>

      {drawn.length > 0 && (
        <div className="mt-6 bg-slate-50 rounded-lg p-4 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-3">📋 已抽取名單（{drawn.length} 人）</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {drawn.map((p, idx) => (
              <div key={p.id + "-d-" + idx} className="bg-white p-2 rounded border border-slate-200">
                <p className="font-semibold text-slate-800 text-sm truncate" title={p.name}>{p.name}</p>
                <p className="text-xs text-slate-400 truncate" title={p.id}>{p.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
