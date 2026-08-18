# Personal PC deployment

This release is designed to run as a private Node.js service on a Windows or Linux personal computer.

## 1. Prepare the server

Install Node.js 22.13 or newer, copy the repository to the server, and run:

```powershell
npm ci
npm test
```

`npm test` creates a production build and runs the rendered-page and scheduling tests. If you prefer to build without running tests, use `npm run build`.

## 2. Configure optional AI

The local tutor works without credentials. To enable model-backed tutoring:

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` in `.env`.
3. Optionally change `OPENAI_MODEL`.
4. Keep `.env` private and never commit it.

## 3. Start the production server

```powershell
npm start
```

The default address is `http://0.0.0.0:3000`. Use `npm start -- -p 8080` to select another port.

Windows may display a firewall prompt the first time Node listens on the network. Allow Private networks only for a home-LAN deployment.

## 4. Keep it running

### Windows Task Scheduler

Create a task that starts at sign-in or system startup, uses the repository as its working directory, and runs:

```text
C:\Program Files\nodejs\npm.cmd start
```

Run it as the Windows account that owns the repository so the same local database is used on every launch.

### Linux systemd

Use a service similar to this, replacing the user and paths:

```ini
[Unit]
Description=Homework Helper
After=network.target

[Service]
Type=simple
User=homework
WorkingDirectory=/srv/homework-helper
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 5. HTTPS and remote access

For access beyond a trusted home LAN:

- Put the service behind an HTTPS reverse proxy.
- Restrict the proxy with authentication, a VPN, or an IP allowlist.
- Do not forward the raw Node port directly from a home router.
- Keep the operating system and Node dependencies patched.

## 6. Backups and updates

- Stop the server before making a filesystem-level backup.
- Back up `data/homework-helper.sqlite`, `.env`, and the repository together. Back up `.wrangler/state` too if you also use the worker development path.
- Test restoring the backup on another directory before relying on it.
- Before updating, back up data, run `npm ci`, run `npm test`, and then restart the service.

## Health check

Request `/` and expect HTTP 200. A deeper local check can create a test profile, read `/api/workspace`, call `/api/tutor`, and delete the test account; this flow is exercised during project verification.
