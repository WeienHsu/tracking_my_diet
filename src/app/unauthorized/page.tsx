import Link from "next/link";

// 非白名單帳號被登出後導向此頁。
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">無法存取</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          此帳號未獲授權使用本系統。如需使用，請聯絡管理者將你的 Email 加入白名單。
        </p>
        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base font-medium text-zinc-800 dark:text-zinc-100"
        >
          回登入
        </Link>
      </div>
    </main>
  );
}
