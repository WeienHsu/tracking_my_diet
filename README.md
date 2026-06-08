This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database migrations

Schema 以版本化 `.sql` 檔管理在 `migrations/`，用 Node 腳本套用：

```bash
npm run migrate
```

需先在 `.env.local` 設 `DATABASE_URL`（Supabase → Project Settings → Database →
Connection string，建議用 pooler 字串，並把密碼填入）。重新部署或換新環境時，跑一次
`npm run migrate` 即可重建所有資料表與 RLS；已套用的 migration 會自動跳過。

## 存取控制（Email 白名單）

正式環境請在環境變數設 `ALLOWED_EMAILS`（逗號分隔，例：`a@gmail.com,b@gmail.com`）。
只有名單內的 Google 帳號可使用系統，其餘登入後會被自動登出並導向 `/unauthorized`。
未設 `ALLOWED_EMAILS` 時不做限制（方便本機開發），上線務必設定。

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) — see the [LICENSE](LICENSE) file for the full text.
