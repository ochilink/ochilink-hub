
# Ochilink - Vercel Fullstack (FREE)

One push = live frontend + backend + DB.

## Deploy in 2 minutes

1. Create free Neon DB:
   - Go to neon.tech -> New Project -> copy connection string
   - Example: postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

2. Push to Vercel:
```
npm i -g vercel
vercel --prod
# When prompted, set env vars:
# DATABASE_URL = your Neon string
# POSTGRES_URL = same as DATABASE_URL
# JWT_SECRET = any random string like ochilink-2026-secret
```

3. Initialize DB (one time):
```
# In Vercel dashboard -> Storage -> Run this SQL, or locally:
psql $DATABASE_URL -f ../ochilink-master-final/backend/schema.sql
psql $DATABASE_URL -f schema-additions.sql
```

## What's included

- Frontend: public/index.html (Ochilink landing with dark/light toggle)
- Admin: public/admin/index.html (Admin + Login with role-based)
- Backend: /api/*.js as Vercel Functions (free)
  - /api/health -> DB check
  - /api/exercises, /api/workouts, /api/measurements, /api/prs
  - /api/auth/login -> unified login
  - /api/track -> behavioral tracking

Demo logins work even without DB:
- admin@ochilink.com / admin123
- staff@ochilink.com / staff123
- customer@ochilink.com / cust123

## Local dev
```
npm install
vercel dev
```

Live at https://your-project.vercel.app
