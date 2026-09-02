# Step Challenge

Small company step-challenge app built with Express, SQLite, and vanilla JavaScript.

**Production:** https://step-app-4x-yhw.fly.dev/

## Current challenge

- Challenge ID: `6`
- Dates: September 1–15, 2026
- Opens: September 1, 00:00 Singapore time
- Closes: September 15, 23:59:59 Pacific time

## Features

- Passwordless Mailgun login
- Daily step entry and CSV export
- Individual and team leaderboards
- Admin management for users, teams, challenges, themes, and MCP tokens
- MCP API and local bridges

## Local development

Requires Node.js 22.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:3000. Development magic links are printed to the console.

## Validation

```bash
npm test
npm audit --omit=dev
```

Authenticated browser tests are manual:

```bash
npm run test:e2e
```

## Production

The app runs on Fly.io with one machine and an encrypted SQLite volume mounted at `/data`.

```bash
flyctl status -a step-app-4x-yhw
curl https://step-app-4x-yhw.fly.dev/health
npm run deploy
```

Create a database backup:

```bash
node src/scripts/backup.js --production
```

Required Fly secrets:

- `NODE_ENV`
- `SESSION_SECRET`
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `FROM_EMAIL`
- `PUBLIC_BASE_URL` — canonical HTTPS origin used in magic links

## Layout

- `src/server.js` — Express application and routes
- `src/database.js` — SQLite schema and backups
- `src/public/` — browser JavaScript and CSS
- `src/views/` — HTML pages
- `mcp/` — MCP bridges and utilities
- `tests/` — unit, integration, and browser tests
- `docs/` — operational and historical notes
