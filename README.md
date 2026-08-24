# Homework Helper

Homework Helper is a calm, local-first homework planning and tutoring website for students age 13+. Phase A is implemented as a responsive website that runs on a personal PC server and stores authoritative data in the server's local D1/SQLite database.

## What is working

- Local owner setup with a 13+ gate and private server session
- Profile, timezone, preferred study hours, sleep hours, breaks, workload limits, dark mode, and reduced motion
- Course workspaces with schedules, instructors, grading notes, archive state, and class-specific materials
- Assignments, commitments, deadlines, effort, difficulty, confidence, importance, grade impact, milestones, completion, and actual-time tracking
- Pasted-text, photo/file, and browser voice capture with a review-before-save draft
- Day, week, and month calendar views with ICS import/export
- Explainable 0-100 priority scores using the approved 35/20/15/15/10/5 weighting
- Deterministic study-block proposals that respect busy time, preferred hours, breaks, deadlines, and daily limits
- Preview, edit, remove, and accept workflow; the calendar never changes silently
- Pomodoro/custom focus timers, pause/resume, local completion reminders, and reflections
- Cached agenda plus an offline change queue; D1/SQLite remains authoritative
- Tutor modes for hints, explanations, worked examples, checking work, and direct answers
- Class-isolated source citations and student-controlled tutor memory
- Credential-free local study coach plus an optional server-side OpenAI Responses API path
- Private insights, JSON/CSV exports, and complete account/data deletion

## Run on a personal PC

Requirements: Node.js 22.13 or newer and npm.

```powershell
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. The production server listens on `0.0.0.0` by default, so another device on the same network can use `http://YOUR-PC-IP:3000` after the operating-system firewall allows inbound TCP port 3000.

### Keep the local development server running on Windows

Install the per-user background server once:

```powershell
npm run server:install
```

It starts immediately, runs without an open PowerShell window, starts again whenever you sign in to Windows, and watches source files for changes. Open `http://localhost:3000` after installation.

Use these commands only when you need to manage it:

```text
npm run server:status     show whether the background server is running
npm run server:restart    restart after dependency or configuration changes
npm run server:update     reinstall changed dependencies and restart
npm run server:stop       stop it temporarily
npm run server:start      start it again
npm run server:uninstall  remove the Windows startup task
```

The server log is written to `logs/dev-server.log`. Use `npm run server:update` instead of running `npm ci` while the background server is active; the update command avoids Windows file locks by stopping and restarting the server for you.

For an internet-facing server, put Homework Helper behind an HTTPS reverse proxy such as Caddy, restrict access at the network edge, and back up `data/homework-helper.sqlite`. Do not expose the raw development server to the public internet.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Windows and Linux service examples, backup guidance, environment variables, and production cautions.

## Optional OpenAI tutor

Homework Helper works without an API key. In that mode the private local study coach cites matching class materials and gives structured study guidance.

For model-backed responses, copy `.env.example` to `.env` and set `OPENAI_API_KEY`. Keep it server-side and out of Git. `OPENAI_MODEL` defaults to `gpt-5.6-terra`, which can be changed without code. The route uses the OpenAI Responses API and falls back locally if the provider is unavailable.

## Commands

```text
npm run dev          local development server
npm run build        production build
npm start            production server on port 3000
npm test             production build plus rendered-app and planning tests
npm run lint         lint source files
npm run db:generate  regenerate the checked-in SQLite migration
```

## Architecture

- vinext / Next.js App Router, React 19, and TypeScript
- Cloudflare-compatible worker runtime with D1 in worker deployments and native SQLite for `npm start` on a personal PC
- Server-side HttpOnly sessions for the personal-server owner profile
- One versioned workspace snapshot per user with optimistic concurrency
- Service worker for app-shell caching; browser storage is limited to an agenda cache and offline mutation queue
- Deterministic priority and scheduling functions in `app/lib/planning.ts`

## Production infrastructure still needed

The local-owner website is complete and deployable. A public, multi-device production service still needs the external systems that cannot be safely invented without accounts and credentials:

- Email one-time-code and Google OAuth, plus recovery and abuse controls
- Cloud-hosted database, row-level policies, encrypted backups, and true multi-device synchronization
- Server-side OCR and transcription for automated photo/audio extraction
- Native device-calendar access (the website includes standards-based ICS import/export)
- Durable scheduled notifications when the browser is closed
- Hosted file/vector storage for large class materials and file-search retrieval
- Security review, legal review for broader minor/school use, monitoring, rate limits, and disaster-recovery drills
- The separate Expo Go mobile implementation described in the revised plan

## Data and safety defaults

No public profiles, rankings, guardian/teacher roles, payment system, remote push, or automatic calendar changes are included. External provider integrations stay disabled until Phase B. The tutor labels AI assistance, preserves the selected class boundary, and reminds students to verify citations and instructor guidance.
