# Deploying HMS — API on Render, frontend on Vercel

Two services and a database:

```
Vercel (static)            Render (Node web service)        MongoDB Atlas
client/dist  ──HTTPS──▶    Express API  ──────────────▶     hms database
  VITE_API_URL               CLIENT_URL (CORS allow-list)     MONGODB_URI
```

This is a monorepo, so each platform is pointed at a subdirectory: Render at
`server/`, Vercel at `client/`. Neither builds the other.

There is a deliberate two-pass step: the API refuses to start in production
without `CLIENT_URL`, and the frontend needs the API's URL at build time. So
the backend goes up first with a placeholder origin, the frontend second, and
then `CLIENT_URL` is corrected. Steps 2 and 4 below.

---

## 1. MongoDB Atlas

1. Create a cluster (M0 is enough to start — see [Limits](#limits-of-the-free-tiers)).
2. **Database Access → Add New Database User.** Give it a strong generated
   password and the `readWrite` role on the `hms` database only, not
   `atlasAdmin`.
3. **Network Access → Add IP Address → `0.0.0.0/0`.**

   Render's Starter plan has no static outbound IPs, so an address allow-list
   cannot be used. Access is protected by the SCRAM credentials and enforced
   TLS instead. If that trade-off is unacceptable, Render's paid tiers offer
   static outbound IPs which you can allow-list precisely.
4. Copy the connection string and **add the database name before the query
   string** — without it Mongoose writes to a database called `test`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/hms?retryWrites=true&w=majority
   ```

   URL-encode any of `@ : / ? # [ ] %` in the password.

## 2. Render — the API

**New → Web Service**, connect the repo, then:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

`--include=dev` is not optional. With `NODE_ENV=production` set, npm skips
`devDependencies` — and TypeScript is one, so the build would fail with
`tsc: not found`. The compiled `dist/` needs no dev dependencies at runtime.

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | the Atlas string from step 1 |
| `JWT_SECRET` | 48 random bytes — see below. Must be ≥ 32 chars or the server refuses to boot |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | `https://placeholder.vercel.app` for now; corrected in step 4 |
| `TRUST_PROXY` | `1` |
| `LOG_LEVEL` | `info` |
| `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first administrator |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`TRUST_PROXY=1` matters more than it looks: Render terminates TLS at its
proxy, so without it every request appears to come from the proxy's IP. Login
rate limiting would then throttle all users as one client, and the audit trail
would record the wrong IP for every action.

Do not set `PORT` — Render assigns it and `server.ts` reads `process.env.PORT`.

Alternatively, commit-based setup: the repo includes
[`server/render.yaml`](server/render.yaml), so **New → Blueprint** will create
the service with these commands and prompt for the secrets.

Deploy, then confirm:

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
# {"success":true,"message":"API is running","data":{"uptime":…}}
```

If it fails to boot, the log says why in one line — the startup guards check
`JWT_SECRET` length and `CLIENT_URL` presence explicitly.

## 3. Vercel — the frontend

**Add New → Project**, import the repo, then:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

One environment variable:

```
VITE_API_URL = https://YOUR-SERVICE.onrender.com/api
```

**The `/api` suffix is required.** The Axios client uses `VITE_API_URL` as its
`baseURL` and appends paths like `/auth/login`. Without the suffix every
request 404s. No trailing slash after `/api`.

Two Vite facts worth internalising:

- `VITE_*` variables are **inlined at build time**, not read at runtime.
  Changing one in the Vercel dashboard does nothing until you redeploy.
- The dev proxy in `vite.config.ts` is development-only. In production the
  browser calls the Render domain directly, which is why CORS matters.

[`client/vercel.json`](client/vercel.json) is committed and handles the part
static hosts get wrong: every unmatched path rewrites to `index.html`, so
deep links such as `/patient/appointments/abc123` survive a refresh instead of
404ing. It also sets long-lived caching on hashed assets and a few response
headers (Helmet covers the API, not the static site).

## 4. Close the loop

Set `CLIENT_URL` on Render to the real Vercel production domain:

```
CLIENT_URL = https://your-app.vercel.app
```

No trailing slash — CORS compares the browser's `Origin` header exactly, and
`https://x.vercel.app/` will never match `https://x.vercel.app`. Saving the
variable redeploys the service.

## 5. First administrator

`npm run seed:admin` runs through `tsx`, a dev dependency, so the simplest
path is to run it from your machine pointed at the production database:

```bash
cd server
MONGODB_URI="<production Atlas URI>" \
ADMIN_EMAIL="admin@your-hospital.org" \
ADMIN_PASSWORD="<temporary password>" \
ADMIN_FIRST_NAME="Site" ADMIN_LAST_NAME="Administrator" \
npm run seed:admin
```

On PowerShell, set the variables with `$env:NAME = "value"` on separate lines
first, then run the script. The seed is idempotent — it skips an existing
admin; add `-- --reset` to reset that admin's password from the env values.

Then sign in and **change the password immediately** via *My profile →
Security* (or the admin's own account), so the value that passed through your
shell history stops being valid. That change is recorded in the audit trail as
`password_changed`.

## 6. Verify the deployment

- `GET /api/health` returns 200.
- Sign in through the Vercel URL. If login fails with a CORS or network error,
  `CLIENT_URL` is wrong; if it 404s, `VITE_API_URL` is missing `/api`.
- **Admin → System health** shows `environment: production`, `database:
  connected`, and the database name — and no connection string, which the
  endpoint deliberately never exposes.
- **Admin → Audit logs** contains your `login`. If the IP column shows one
  fixed value for different clients, `TRUST_PROXY` is unset.
- Hard-refresh a deep link such as `/admin/audit-logs` — a 404 means
  `vercel.json` was not picked up (check Root Directory is `client`).
- Book an appointment, then confirm the slot disappears from the picker. This
  exercises Mongo writes, the index builds that run at startup, and the
  double-booking guard in one action.

---

## Limits of the free tiers

Worth knowing before demoing to anyone:

- **Render Starter/free spins down when idle.** The first request after that
  takes roughly 50 seconds while the container cold-starts, and index builds
  run before the port opens. The UI has no request timeout, so it waits rather
  than erroring — but it looks broken. Any paid instance type removes this.
- **Atlas M0 has no automated backups.** Take your own before anything
  destructive: `mongodump --uri "<prod URI>" --gzip --archive=hms-$(date +%F).gz`.
- **M0 caps connections at 500** and shares CPU. Fine for a pilot, not for a
  ward running all day.

## Custom domains

Add the domain in Vercel, then update `CLIENT_URL` on Render to match it
exactly. If you want both `example.com` and `www.example.com`, configure one
as a redirect to the other in Vercel rather than serving both: `CLIENT_URL`
holds a single origin, so two live hostnames would leave one of them blocked
by CORS. (Supporting a list would be a small change to the `cors` call in
`server/app.ts` — ask if you need it.)

Vercel **preview deployments** get a fresh URL per commit, so they will not be
allowed by a production `CLIENT_URL`. Either point previews at a separate
Render service with its own `CLIENT_URL`, or accept that previews exercise the
UI only.

## Rotating secrets

- **`JWT_SECRET`** — changing it invalidates every issued token, so all users
  are signed out at once. That is the intended lever if a token leaks.
- **Database password** — rotate in Atlas, update `MONGODB_URI` on Render.
- **`.env` is git-ignored and must stay uncommitted.** Real values belong only
  in the Render and Vercel dashboards. If one ever lands in a commit, rotate
  it rather than rewriting history and hoping.

## Updating a deployment

Both platforms deploy on push to the default branch. Before pushing:

```bash
cd server && npm test && npm run build
cd ../client && npm run typecheck && npm run build
```

The API suite runs against an in-memory MongoDB, so it never touches the
production database. Render keeps the previous deploy available for one-click
rollback; Vercel keeps every build and can promote an earlier one instantly.
