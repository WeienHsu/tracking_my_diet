"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { A1cRecord } from "@/lib/types";
import { createA1cAction, deleteA1cAction } from "./actions";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500";

// 今天的本地日期，給 <input type="date"> 用。
function todayLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function A1cManager({ records }: { records: A1cRecord[] }) {
  const router = useRouter();

  const [measuredAt, setMeasuredAt] = useState(todayLocal);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      setMessage({ type: "err", text: "請輸入有效的 A1C 數值。" });
      return;
    }

    setSaving(true);
    try {
      await createA1cAction({
        measured_at: measuredAt,
        value: v,
        note: note.trim() || null,
      });
      setValue("");
      setNote("");
      setMeasuredAt(todayLocal());
      setMessage({ type: "ok", text: "已記錄 A1C ✓" });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "記錄失敗，請再試一次。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 新增 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">量測日期</span>
            <input
              type="date"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">A1C（%）</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="例：6.5"
              className={inputClass}
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">備註（可留空）</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="檢驗單位、當下狀況等"
            className={inputClass}
          />
        </label>

        {message && (
          <p
            className={`text-sm ${
              message.type === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="h-14 rounded-xl bg-black dark:bg-white text-lg font-medium text-white dark:text-black disabled:opacity-50"
        >
          {saving ? "記錄中…" : "記錄 A1C"}
        </button>
      </form>

      {/* 歷史 */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">共 {records.length} 筆</p>
        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">尚無紀錄。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {records.map((r) => (
              <A1cItem key={r.id} record={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function A1cItem({ record }: { record: A1cRecord }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("確定刪除這筆 A1C 紀錄？")) return;
    startTransition(() => deleteA1cAction(record.id));
  }

  return (
    <li className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <div>
        <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{record.value}%</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(record.measured_at)}</p>
        {record.note && (
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">備註：{record.note}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label="刪除"
        className="text-sm text-zinc-400 dark:text-zinc-500 disabled:opacity-50"
      >
        刪除
      </button>
    </li>
  );
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00`).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
