# Optima Desk

Solopreneur desk for Webiton: maintenance (30‑min slots), client Kanban, daily job list + day resume, commercial proposals, projects, and finance goals.

## Stack

- Next.js (App Router) + TypeScript
- [HeroUI](https://heroui.com/) v3 + Tailwind CSS v4
- Prisma + **MySQL** (cPanel)
- Auth.js (next-auth) — wired in a later step

## Docs & agents

- [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md)
- Skills: `skills/optima-maintenance`, `optima-commercial`, `optima-projects`, `optima-finance`

## Setup

```bash
cd optima-desk
cp .env.example .env
# Set DATABASE_URL (local MySQL or cPanel)
# Set AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Login with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (seed default: `admin@webiton.pt` / `optima`).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local app |
| `npm run build` | Production build |
| `npx prisma db push` | Sync schema to MySQL (local) |
| `npx prisma migrate dev` | Migrations (needs CREATE DATABASE privilege) |
| `npm run db:seed` | Admin + demo client/pack/requests |
| `npx prisma studio` | Browse data |

## Phase 1 (done)

- Admin auth (Auth.js credentials)
- Clients + contracts (pack / retainer / hourly)
- Maintenance Kanban (4 columns)
- Interventions in 30‑min steps with pack/retainer deduction
- Quick Log + idle nudge (60–90 min)
- Daily Job List + day resume
- Monthly report generate + copy

## Later phases

2. Client portal  
3. Voice + `requests@webiton.pt`  
4. Commercial + Projects  
5. Finance coach  
