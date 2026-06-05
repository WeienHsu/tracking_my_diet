"use client";

import { useState } from "react";

// 本月起訖（本地時間），送給 /api/report。
function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function MonthlyReport() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thisMonthRange()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "產生失敗，請稍後再試。");
        return;
      }
      setReport(data.report);
    } catch {
      setError("網路錯誤，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4">
      <h2 className="text-sm font-medium text-zinc-700">AI 月報（本月）</h2>
      <p className="text-xs text-zinc-500">
        由 AI 根據本月去識別化統計，產生一段白話回顧。僅描述觀察，不構成醫療建議。
      </p>

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="h-12 rounded-lg bg-black text-base font-medium text-white disabled:opacity-50"
      >
        {loading ? "產生中…" : "產生本月 AI 月報"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {report && (
        <div className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-800">
          {report}
        </div>
      )}
    </section>
  );
}
