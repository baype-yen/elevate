# Elevate

Elevate is a Next.js + Supabase language-learning platform with separate teacher and student experiences (dashboards, classes, assignments, progress, and activity).

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (Auth, Postgres, RLS, Storage)
- Tailwind CSS 4
- Vercel Analytics

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- A Supabase project (cloud or local)
- Git
- Vercel account (for deployment)

## Clone and Install

```bash
git clone <YOUR_REPOSITORY_URL>
cd elevate
npm install
```

## Environment Variables

Create `.env.local` from `.env.example` and fill in your Supabase values:

```bash
cp .env.example .env.local
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env.local
```

Required keys:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Notes:

- Use the **Project URL** and **anon public key** from Supabase Project Settings.
- Do not commit `.env.local`.

## Run Locally

1. Make sure `.env.local` is configured (see section above).

2. Start development server:

   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000`.

## Database Setup (Supabase)

This repository includes Supabase migrations in `supabase/migrations` and seed data in `supabase/seed.sql`.

### Option A: Use Supabase Cloud (quickest)

- Create a Supabase project.
- Apply migrations and seed (using SQL Editor or Supabase CLI).
- Put the hosted Supabase URL + anon key in `.env.local`.

### Option B: Run Supabase fully local

1. Install Supabase CLI (if not installed):

   ```bash
   npm install -g supabase
   ```

2. Start local Supabase services:

   ```bash
   supabase start
   ```

3. Apply migrations + seed:

   ```bash
   supabase db reset
   ```

4. Get local API URL and anon key:

   ```bash
   supabase status
   ```

5. Put those values into `.env.local`.

## Auth / First Login

- Login page is at `/login`.
- Create users in Supabase Auth (email/password) before logging in.
- Teacher dashboards require the user profile role to be `teacher`.
- Student dashboards require `student` (default for new users unless metadata/SQL changes it).

## Available Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint

## Deploy to Vercel

### Recommended: Git-connected deployment

1. Push your repository to GitHub/GitLab/Bitbucket.
2. In Vercel, click **Add New Project** and import the repo.
3. Framework preset should auto-detect as Next.js.
4. Add environment variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy.

Set **Production Branch** to `main`. After that, every push to `main` triggers a production deployment automatically.

### CLI deployment (optional)

```bash
npm install -g vercel
vercel login
vercel
vercel --prod
```

Also set the same environment variables in Vercel before production deploys.

## Git Flow (Commit and Push to `main`)

Use this flow when you are ready to publish changes directly to `main`:

```bash
git checkout main
git pull origin main
git status
git add .
git commit -m "docs: update README for local + Vercel workflow"
git push origin main
```

If push fails because remote changed, sync and retry:

```bash
git pull --rebase origin main
git push origin main
```

## Vercel Release Flow (End-to-End)

1. Make changes locally and verify with `npm run lint` and `npm run build`.
2. Commit and push to `main`.
3. Vercel auto-builds the new production deployment from `main`.
4. Check deploy logs in Vercel if build fails.

## Troubleshooting

- **"Invalid API key" / auth errors**: verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Login works but dashboard access fails**: verify profile role (`teacher` vs `student`) and applied migrations/RLS policies.
- **Empty dashboards**: ensure migrations and seed data are applied, and user is enrolled/has records in relevant tables.
