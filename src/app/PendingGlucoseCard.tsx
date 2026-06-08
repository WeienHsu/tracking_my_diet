"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fillGlucoseAfterAction } from "./history/actions";

export type PendingMeal = {
  id: string;
  eatenAt: string;
  label: string;
};

// 餐後落在此視窗（小時）才提示補填。
const LO_H = 1.5;
const HI_H = 3;

// 4.2：首頁「待補填餐後血糖」。傳入近 4h 未填的候選，這裡依「當下時間」即時篩 1.5–3h；
// 用 30 秒 tick 讓頁面開著時也會自動跳出/收起，不必手動重新整理。
export default function PendingGlucoseCard({
  candidates,
}: {
  candidates: PendingMeal[];
}) {
  // 初始 null → SSR 與首次 client 渲染輸出一致（避免 hydration 不符）；掛載後才開始即時判定。
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const t = setTimeout(tick, 0); // 掛載後立即更新一次
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  if (nowMs == null) return null; // 尚未掛載：不顯示（避免時間不一致）
  const visible = candidates.filter((m) => {
    const h = (nowMs - new Date(m.eatenAt).getTime()) / 3_600_000;
    return h >= LO_H && h <= HI_H;
  });
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
        有 {visible.length} 餐待補填餐後血糖
      </p>
      <ul className="flex flex-col gap-2">
        {visible.map((m) => (
          <PendingRow key={m.id} meal={m} />
        ))}
      </ul>
    </div>
  );
}

function PendingRow({ meal }: { meal: PendingMeal }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    setError(null);
    // 首頁卡片針對「1.5–3h 前」的及時補填，量測時間預設為當下（B′）。
    const measuredAt = new Date().toISOString();
    startTransition(async () => {
      const res = await fillGlucoseAfterAction(meal.id, v, measuredAt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2">
      {/* 進食內容獨立一行、完整顯示，不再被輸入框擠壓 */}
      <span className="text-sm text-zinc-700 dark:text-zinc-200">
        {formatTime(meal.eatenAt)}・{meal.label}
      </span>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="餐後血糖"
          className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || value === ""}
          className="h-10 shrink-0 rounded-lg bg-black dark:bg-white px-3 text-sm font-medium text-white dark:text-black disabled:opacity-50"
        >
          {pending ? "…" : "補填"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
