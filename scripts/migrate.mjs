// Supabase Postgres migration runner（Node，純 .sql 檔）。
//
// 用法：
//   1. 在 .env.local 設 DATABASE_URL（Supabase → Project Settings → Database →
//      Connection string，建議用 pooler 連線字串，並把 [YOUR-PASSWORD] 換成資料庫密碼）。
//   2. npm run migrate
//
// 行為：建立 schema_migrations 追蹤表，依檔名排序套用 migrations/ 下尚未套用的
// .sql 檔，每檔包在一個交易內執行；已套用的會跳過（重跑為 no-op）。

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // 從 .env.local 撈 DATABASE_URL（避免額外相依套件）。
  try {
    const envFile = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    const line = envFile
      .split("\n")
      .find((l) => l.trim().startsWith("DATABASE_URL="));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    // 無 .env.local 就略過
  }
  return null;
}

async function main() {
  const connectionString = loadDatabaseUrl();
  if (!connectionString) {
    console.error(
      "缺少 DATABASE_URL。請在 .env.local 設定 Supabase 的資料庫連線字串後再跑 npm run migrate。",
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(
      `create table if not exists schema_migrations (
         version text primary key,
         applied_at timestamptz default now()
       )`,
    );

    const { rows } = await client.query("select version from schema_migrations");
    const applied = new Set(rows.map((r) => r.version));

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ranCount = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log(`skip  ${version}（已套用）`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`apply ${version} …`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (version) values ($1)",
          [version],
        );
        await client.query("commit");
        ranCount++;
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${version} 失敗：${err.message}`);
      }
    }

    console.log(
      ranCount === 0 ? "已是最新，無需套用。" : `完成，套用 ${ranCount} 個 migration。`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
