"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

// 套用主題到 <html>，與 layout 的 inline script 規則一致。
function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

// 以 localStorage 為來源、useSyncExternalStore 讀取，避免 SSR 與 hydration 不一致。
let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function getSnapshot(): Theme {
  const s = localStorage.getItem("theme");
  return s === "light" || s === "dark" ? s : "system";
}
function getServerSnapshot(): Theme {
  return "system";
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "淺色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟隨系統" },
];

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: Theme) {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    applyTheme(next);
    listeners.forEach((l) => l());
  }

  return (
    <div>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        外觀主題
      </span>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            className={`h-12 rounded-lg border text-sm ${
              theme === o.value
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
