# bc-violation-scraper

Next.js 16 app with:

- **NextAuth v4** (Google OAuth only; database sessions)
- **Drizzle ORM** + **postgres.js**
- **Tailwind Catalyst** UI
- Single DB env var: **`DB_URL`**
- App Router (v4 NextAuth route handler)

---

## Quick Start

```bash
pnpm install

# set env
cp .env.local.example .env.local
# edit .env.local

# drizzle
pnpm generate
pnpm migrate

# dev
pnpm dev
# http://localhost:3000
```

---

## Environment

Create **`.env.local`**:

```ini
# Database (include SSL in URL if needed)
DB_URL=postgresql://USER:PASS@HOST:PORT/DBNAME?sslmode=require

# NextAuth (v4)
GOOGLE_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_WITH_openssl_rand_-base64_32

# Optional: auto-authorize/admin list (comma-separated)
ALLOWED_ADMIN_EMAILS=you@domain.com
```

**Prod:** set `NEXTAUTH_URL=https://your-domain.com` and keep `NEXTAUTH_SECRET` stable.

---

## Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "generate": "drizzle-kit generate",
  "migrate": "drizzle-kit migrate",
  "studio": "drizzle-kit studio"
}
```

- `pnpm studio` → Drizzle Studio at https://local.drizzle.studio

---

## Auth Wiring (v4)

- Config: `src/lib/auth.ts` exports **`authOptions`**.
- Route handler (v4 pattern):

```ts
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/src/lib/auth";
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- Providers: **Google only**.
- Sessions: `{ strategy: "database" }` (uses `sessions` table).
- Bootstrap: first user => `admin` + `isAuthorized=true`. Emails in `ALLOWED_ADMIN_EMAILS` auto-authorized.

---

## DB Client (singleton)

`src/db/config/configureClient.ts` uses a postgres.js **singleton** to prevent dev hot-reload connection storms. Exposes:

- `migrationConnection` / `migrationClient` (CLI/programmatic)
- `db` (runtime with schema)

Keep SSL in `DB_URL` (e.g., `?sslmode=require`).

---

## Schema (auth tables)

`src/db/migrations/schema.ts`:

- `users` (uuid pk, **`email_verified`** mapped as `timestamp("email_verified")`)
- `accounts` (`user_id` fk → `users.id`, composite pk `[provider, provider_account_id]`)
- `sessions` (pk `session_token`)
- `verification_tokens` (composite pk)

> **Match DB column names** (snake_case): `email_verified`, `is_authorized`, `created_at`, `updated_at`, `first_name`, `last_name`.

---

## UI (Catalyst) + Login

- New Catalyst template layout.
- **Google-only** login: server page renders your existing client button.

Example:

```tsx
// src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/src/lib/auth";

import { Logo } from "@app/logo";
import { Heading } from "@components/catalyst/heading";
import { Text, TextLink, Strong } from "@components/catalyst/text";
import SignIn from "@components/sign-in"; // uses signIn("google")

export const metadata: Metadata = { title: "Login" };

export default async function Login() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const role = (session.user as any).role ?? "pending";
    if (role === "admin") redirect("/admin/dashboard");
    redirect("/dashboard");
  }

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Sign in to your account</Heading>
      <SignIn />
      <Text>
        Don’t have an account?{" "}
        <TextLink href="/register"><Strong>Request access</Strong></TextLink>
      </Text>
    </div>
  );
}
```

---

## Google OAuth Setup

Google Cloud Console → Credentials → OAuth 2.0 Client:

- **Redirect URI (dev):** `http://localhost:3000/api/auth/callback/google`
- **Redirect URI (prod):** `https://your-domain.com/api/auth/callback/google`
- Publish consent screen.

---

## Deployment Notes

- Serve HTTPS behind Nginx/Ingress; forward correct host/proto headers.
- Each Node/PM2 worker opens its own pool → size DB accordingly.
- Keep `NEXTAUTH_SECRET` stable per environment.
- Prefer a single `DB_URL` over host/port/password blocks.

---

## Troubleshooting

**`adapter_error_getUserByAccount` with `users."emailVerified"`**  
Map to the real column:

```ts
emailVerified: timestamp("email_verified", { mode: "date" })
```

**`Cannot read properties of undefined (reading 'GET')`**  
You used next-auth v5 handlers in v4.

Use the v4 route handler (see Auth Wiring section).

**Drizzle CLI can’t see `DB_URL`**  
`drizzle.config.ts` explicitly loads `.env.local`:

```ts
import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";
const envLocal = join(process.cwd(), ".env.local");
loadEnv({ path: existsSync(envLocal) ? envLocal : join(process.cwd(), ".env") });
export default defineConfig({ dialect: "postgresql", out: "src/db/migrations", schema: "src/db/migrations/schema.ts", dbCredentials: { url: process.env.DB_URL! } });
```

---

## Structure

```
src/
  app/
    (auth)/login/page.tsx
    api/auth/[...nextauth]/route.ts
  db/
    config/configureClient.ts
    migrations/schema.ts
components/
  catalyst/...
  sign-in.tsx
```

---

## License

Private/internal.
# violation-frontend
