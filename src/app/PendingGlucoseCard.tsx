"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fillGlucoseAfterAction } from "./history/actions";

export type PendingMeal = {
  id: string;
  eatenAt: string;
  label: string;
};

// 4.2：首頁「待補填餐後血糖」快速入口。列出 1.5–3 小時前、尚未填餐後血糖的餐，可一鍵補填。
export default function PendingGlucoseCard({
  pending,
}: {
  pending: PendingMeal[];
}) {
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
        有 {pending.length} 餐待補填餐後血糖
      </p>
      <ul className="flex flex-col gap-2">
        {pending.map((m) => (
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
    startTransition(async () => {
      const res = await fillGlucoseAfterAction(meal.id, v);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
          {formatTime(meal.eatenAt)}・{meal.label}
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="餐後血糖"
          className="h-10 w-28 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-sm"
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
