# Hospital Management System (HMS)

A production-ready Hospital Management System built on the MERN stack
(TypeScript end to end). All ten phases are implemented: authentication and
RBAC, patients, doctors and appointments, consultations and medical records,
pharmacy, laboratory, billing and payments, inpatient and bed management,
reports/analytics/notifications, and — most recently — **Phase 10: security,
audit logging, and system administration**.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Language | TypeScript (strict) on both client and server |
| Frontend | React 18, Vite 6, React Router 6, Tailwind CSS 4, Axios |
| Backend  | Node.js, Express 4, Mongoose 8, JWT, bcryptjs, Helmet, CORS (tsx runtime, tsc build) |
| Database | MongoDB (Atlas or local) |

## Folder structure

```text
HMS/
├── client/                  # React + TypeScript frontend (Vite)
│   └── src/
│       ├── components/      # UI primitives, charts, and per-module widgets
│       ├── context/         # AuthContext (session), SettingsContext (system settings)
│       ├── hooks/           # useAuth, useSettings, useUnreadNotifications
│       ├── layouts/         # DashboardLayout (sidebar + header shell)
│       ├── pages/           # Login + one folder per module (admin, patients, billing, …)
│       ├── routes/          # AppRoutes, ProtectedRoute, RoleRoute
│       ├── services/        # Axios instance + one typed service per module
│       └── utils/           # Roles, labels, dates, money, permissions
└── server/                  # Express + TypeScript API
    ├── config/              # db.ts — MongoDB connection
    ├── controllers/         # One controller per module (auth, users, …, admin)
    ├── middleware/          # authenticate, authorize, validation, audit, errors
    ├── models/              # Mongoose models incl. User, AuditLog, SystemSetting
    ├── routes/              # /api/auth, /api/users, …, /api/admin
    ├── scripts/             # seedAdmin.ts
    ├── services/            # Business logic (sequences, billing, audit, settings, …)
    ├── tests/               # vitest + supertest + in-memory MongoDB
    ├── utils/               # ApiError, asyncHandler, generateToken, logger, metrics, csv
    └── server.ts            # App entry — connects, builds indexes, then listens
```

## Prerequisites

- Node.js 18+ (tested on Node 24)
- A MongoDB database — either a free [MongoDB Atlas](https://www.mongodb.com/atlas)
  cluster or a local MongoDB instance

## Installation

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

## Environment variables

Copy the example file and fill it in:

```bash
cd server
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string (Atlas or local) |
| `JWT_SECRET` | Long random string used to sign tokens |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` | Name of the first admin account |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials for the first admin (password ≥ 8 chars) |
| `CLIENT_URL` | Frontend origin allowed by CORS (default `http://localhost:5173`) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | Login brute-force window and max failed attempts per IP (default 15 min / 10) |
| `LOGIN_LOCK_THRESHOLD` / `LOGIN_LOCK_MINUTES` | Failed attempts before an account is *temporarily* locked, and the lock duration (default 10 / 15). Locks always expire — accounts are never locked permanently |
| `BCRYPT_ROUNDS` | bcrypt cost (default 12; tests use 4 for speed) |
| `LOG_LEVEL` | pino log level (default `info`) |
| `TRUST_PROXY` | Set (e.g. `1`) when behind a reverse proxy so rate limiting sees real client IPs |

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The client needs no env vars in development (the Vite dev server proxies
`/api` to `http://localhost:5000`). For production builds, set
`VITE_API_URL` in `client/.env` — see `client/.env.example`.

### MongoDB Atlas setup

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a database user (Database Access → Add New Database User).
3. Allow your IP (Network Access → Add IP Address).
4. Copy the connection string (Connect → Drivers) and set it as
   `MONGODB_URI`, e.g.
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/hms?retryWrites=true&w=majority`

## Seed the first admin

Public registration is disabled — the first admin comes from `.env`:

```bash
cd server
npm run seed:admin
```

The script is idempotent: it exits without changes if the admin email
already exists. Change the seeded password after the first login.

To rotate an existing admin's password to the current `ADMIN_PASSWORD`
value (e.g. after a credential leak):

```bash
npm run seed:admin -- --reset
```

## Running the app

```bash
# Terminal 1 — API (http://localhost:5000)
cd server
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd client
npm run dev
```

Log in at `http://localhost:5173` with the seeded admin credentials, then
create staff accounts under **Users**.

Other scripts: `npm start` (server, production mode), `npm run build` and
`npm run preview` (client).

### Backend tests

```bash
cd server
npm test          # full auth / RBAC / rate-limit suite (in-memory MongoDB)
npm run test:watch
```

The suite spins up an isolated in-memory MongoDB — it never touches the
database in `MONGODB_URI`.

## Roles

| Role | Access |
|------|--------|
| `admin` | Admin dashboard, full user management, audit logs, system settings, system health |
| `doctor` | Doctor dashboard |
| `receptionist` | Receptionist dashboard |
| `nurse` | Nurse dashboard |
| `pharmacist` | Pharmacy dashboard, inventory, and dispensing |
| `lab_technician` | Laboratory dashboard, samples, results, and verification |
| `patient` | Self-service portal: own appointments (view/book/cancel), medical records, prescriptions, lab results, medications, billing, admission, notifications, profile. No access to any staff API. Accounts are issued from the patient record (admin/receptionist), never from user management |

Roles are enforced on the backend (`authenticate` + `authorize`
middleware) and mirrored on the frontend (`ProtectedRoute` + `RoleRoute`).
A user who manually enters another role's URL is redirected; a request to
another role's API returns `403`.

## Authentication flow

1. `POST /api/auth/login` verifies credentials (bcrypt) and returns a JWT
   containing `userId` and `role`, plus the user object.
2. The client stores the token and attaches it as a `Bearer` header via an
   Axios interceptor.
3. On page refresh, the client calls `GET /api/auth/me` once to restore
   the session; invalid or expired tokens are discarded and the user is
   returned to the login page.
4. Deactivated accounts are rejected at login and on every authenticated
   request (the token's user is re-checked against the database).
5. Logout clears the token and auth state client-side.

## API overview

All responses share one shape:
`{ "success": true|false, "message": "…", "data": { … } }`

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Log in, returns JWT + user |
| `GET` | `/api/auth/me` | Authenticated | Current user |
| `POST` | `/api/auth/logout` | Authenticated | Acknowledge logout |
| `POST` | `/api/auth/change-password` | Authenticated | Change your OWN password (current password required; audited). No admin variant exists |
| `GET` | `/api/users` | Admin | List users (`search`, `role`, `status`, `page`, `limit`) |
| `POST` | `/api/users` | Admin | Create a staff account |
| `GET` | `/api/users/:id` | Admin | Get one user |
| `PATCH` | `/api/users/:id` | Admin | Update profile / role / password |
| `PATCH` | `/api/users/:id/status` | Admin | Activate / deactivate |
| `POST` | `/api/patients` | Admin, receptionist | Register a patient (auto `PAT-000001` ID) |
| `GET` | `/api/patients` | All staff roles | List patients (`search`, `gender`, `bloodGroup`, `status`, `page`, `limit`) |
| `GET` | `/api/patients/stats` | Admin, receptionist | Dashboard statistics |
| `GET` | `/api/patients/:id` | All staff roles | Patient profile |
| `PATCH` | `/api/patients/:id` | Admin, receptionist | Update patient details |
| `PATCH` | `/api/patients/:id/status` | Admin | Activate / deactivate (soft status, never deletes) |
| `GET/POST` | `/api/departments` | List: all roles (active only for non-admin) / create: admin | Departments |
| `GET/PATCH` | `/api/departments/:id` (+ `/status`) | Admin | Manage departments (soft status, guarded against active doctors/appointments) |
| `GET/POST` | `/api/doctors` | List: all roles / create: admin | Doctor directory & profiles (linked to User accounts) |
| `GET` | `/api/doctors/me`, `/api/doctors/specializations` | Doctor / all roles | Own profile; filter values |
| `GET/PATCH` | `/api/doctors/:id` (+ `/status`) | View: all roles / manage: admin | Doctor profile management |
| `GET/PUT` | `/api/doctors/:id/availability` | View: all roles / edit: admin or the owning doctor | Weekly availability |
| `GET/POST` | `/api/appointments` | List: all roles (doctors see own only) / create: admin + receptionist | Appointments with search/filter/pagination |
| `GET` | `/api/appointments/stats` | Admin, receptionist, doctor (own scope) | Dashboard statistics |
| `GET/PATCH` | `/api/appointments/:id` (+ `/status`) | Per-role rules; transitions validated | Details, reschedule, status lifecycle |
| `GET/POST` | `/api/consultations` | Read: admin/doctor/nurse (scoped) / author: doctor only | Clinical consultations (one per appointment) |
| `GET` | `/api/consultations/stats` | Admin, doctor (own scope) | Consultation statistics |
| `GET/PATCH` | `/api/consultations/:id` (+ `/status`) | Author: assigned doctor; completed records are read-only | Clinical record, complete/cancel |
| `GET` | `/api/patients/:id/consultations` | Admin, doctor, nurse | Patient medical timeline |
| `GET` | `/api/doctors/:id/consultations` | Admin; doctor (own only) | A doctor's consultations |
| `*` | `/api/pharmacy/categories` (+ `/:id`, `/:id/status`) | Admin, pharmacist | Medicine categories |
| `*` | `/api/pharmacy/medicines` (+ `/:id`, `/:id/status`) | Admin, pharmacist | Medicine catalog with live stock levels |
| `GET/POST` | `/api/pharmacy/inventory` (+ `/:id/adjust`) | Admin, pharmacist | Batches, stock-in, adjustments (never negative) |
| `GET` | `/api/pharmacy/transactions` | Admin, pharmacist | Immutable stock ledger |
| `GET` | `/api/pharmacy/prescriptions` (+ `/:id`) | Admin, pharmacist | Prescription queue (clinical data read-only) |
| `GET/POST` | `/api/pharmacy/dispensing` | Admin, pharmacist | FEFO dispensing + history |
| `GET` | `/api/pharmacy/stats` | Admin, pharmacist | Pharmacy dashboard statistics |
| `*` | `/api/laboratory/categories`, `/tests` | Manage: admin / view: admin, lab tech, doctor | Lab test catalog |
| `GET/POST` | `/api/laboratory/orders` (+ `/:id`, `/:id/status`) | Order: doctor (own consultations) / view: role-scoped / cancel: admin, lab tech | Lab orders (workflow-driven statuses) |
| `GET/PATCH` | `/api/laboratory/samples` (+ `/:id/collect`, `/:id/reject`) | Admin, lab technician | Sample collection & rejection (reason required) |
| `GET/PATCH` | `/api/laboratory/results` (+ `/:id`, `/:id/verify`) | Enter/verify: admin, lab tech / view: role-scoped | Results — verified records are read-only |
| `GET` | `/api/laboratory/stats` | Admin, lab technician | Laboratory dashboard statistics |
| `*` | `/api/billing/invoices` (+ `/:id`, `/:id/status`) | Manage: admin, receptionist / read: + doctor, nurse / cancel: admin | Invoices (draft → issued → cancelled; backend-computed totals) |
| `GET` | `/api/billing/billable/:patientId` | Admin, receptionist | Billable items from consultations, lab orders, dispensings |
| `GET/POST` | `/api/billing/payments` (+ `/:id`) | Record: admin, receptionist / read: + doctor, nurse | Payment ledger (overpayment-proof) |
| `POST` | `/api/billing/refunds` | Admin | Refund records (capped at paid amount) |
| `GET` | `/api/billing/stats` | Admin, receptionist | Billing dashboard statistics |
| `*` | `/api/inpatient/wards` (+ `/:id`, `/:id/status`) | Manage: admin / view: clinical roles | Wards with live bed summaries |
| `*` | `/api/inpatient/beds` (+ `/:id`, `/:id/status`) | Manage: admin / status ops: + receptionist | Beds (unique per ward; occupation only via workflow) |
| `GET/POST` | `/api/inpatient/admissions` (+ `/:id`) | Ops: admin, receptionist / view: role-scoped | Admissions (atomic bed claims, one active per patient) |
| `GET/POST` | `/api/inpatient/transfers` | Admin, receptionist | Bed/ward transfers with full history |
| `POST` | `/api/inpatient/discharges` | Admin, receptionist (cancel: admin) | Discharge — releases the bed, keeps the record |
| `GET` | `/api/inpatient/stats` | Admin, receptionist, nurse | Inpatient dashboard statistics |
| `GET` | `/api/analytics/overview` | Admin | Hospital KPIs + time series for one date range |
| `GET` | `/api/reports/appointments` | Admin, receptionist, doctor (own only) | Appointment report (+ `?format=csv`) |
| `GET` | `/api/reports/patients` | Admin, receptionist | Aggregate patient demographics (no personal data) |
| `GET` | `/api/reports/clinical` | Admin, doctor (own only) | Consultations + recorded-diagnosis frequency |
| `GET` | `/api/reports/pharmacy` | Admin, pharmacist | Dispensing, low stock, expired batches |
| `GET` | `/api/reports/laboratory` | Admin, lab technician | Order throughput and test demand |
| `GET` | `/api/reports/billing` | Admin, receptionist | Revenue, invoice status, payments by method |
| `GET` | `/api/reports/inpatient` | Admin, receptionist, nurse | Admission flow and bed occupancy |
| `GET/PATCH` | `/api/notifications` (+ `/unread-count`, `/:id/read`, `/read-all`) | Any authenticated user (own inbox only) | In-app notification centre |
| `GET` | `/api/admin/audit-logs` | Admin | Audit trail (`search`, `action`, `resourceType`, `actorRole`, `actorId`, `resourceId`, `from`, `to`, `sort`, `order`, pagination). Read-only — no create/update/delete route exists |
| `GET` | `/api/admin/audit-logs/vocabulary` | Admin | Valid actions, resource types, and roles for the filter UI |
| `GET` | `/api/admin/settings` | Authenticated | System settings (hospital name, currency, slot length…) |
| `PATCH` | `/api/admin/settings` | Admin | Update settings (audited; unknown keys rejected) |
| `GET` | `/api/admin/system-health` | Admin | API/database/application state and traffic counters — never secrets |
| `POST` | `/api/patients/:id/portal-account` | Admin, receptionist | Issue a portal login for a patient (one per patient, audited) |
| `GET` | `/api/patient/dashboard` | Patient (own data) | Portal landing: upcoming/recent appointments, active prescriptions, verified results, open invoices, payments, current admission, unread count |
| `GET/PATCH` | `/api/patient/profile` | Patient | View profile; edit contact/social fields only (clinical and identity fields are rejected) |
| `GET/POST` | `/api/patient/appointments` (+ `/:id`, `/:id/cancel`) | Patient | Own appointments: list, detail, book (same double-booking-proof service as staff), cancel scheduled/confirmed |
| `GET` | `/api/patient/booking/departments`, `/doctors`, `/slots` | Patient | Booking support — free slots are computed server-side so other patients' bookings never leave the API |
| `GET` | `/api/patient/medical-records` (+ `/:id`) | Patient | Own consultations, read-only, without doctors' internal working notes |
| `GET` | `/api/patient/prescriptions` | Patient | Own prescription lines with pharmacy dispense status |
| `GET` | `/api/patient/laboratory` | Patient | Own lab orders + VERIFIED results only (no technician notes) |
| `GET` | `/api/patient/medications` | Patient | Fulfillment progress + dispensing history (no batch/stock internals) |
| `GET` | `/api/patient/billing` (+ `/:id`) | Patient | Own issued invoices + payment history (drafts hidden) |
| `GET` | `/api/patient/admission` | Patient | Current admission + history |
| `GET` | `/api/health` | Public | Health check |

Every report accepts `range=today\|week\|month\|year\|custom` (with `from`/`to`
for custom) and `format=csv` to download the same filtered result as a
spreadsheet-ready file.

Error responses use proper status codes: `400` validation, `401`
unauthenticated, `403` forbidden, `404` not found, `409` duplicate email.

## Security notes

**Credentials and secrets**

- Passwords are hashed with bcrypt (12 rounds) and never returned by the API.
  No endpoint exposes a password or hash — not even to an administrator.
- JWTs are signed with a secret from `.env`; `.env` is git-ignored. In
  production the server refuses to start if `JWT_SECRET` is shorter than 32
  characters or `CLIENT_URL` is unset.
- Request logs use allow-list serializers, so `Authorization` and `Cookie`
  headers are never written to the log stream; the logger also redacts
  password/token fields as a second layer.
- `/api/admin/system-health` reports the database *name* only — never the
  host, user, or connection string.

**Login protection**

- Failed logins are rate-limited per IP (default 10 per 15 minutes) and per
  account (temporary lock after 10 failures, released automatically after 15
  minutes — accounts are never locked permanently).
- Credentials are verified *before* account state is revealed, and unknown
  emails still pay the bcrypt cost, so responses leak neither which emails
  exist nor which accounts are locked or suspended. Every failure returns the
  same `Invalid credentials` body.
- Accounts have three states — `active`, `inactive`, `suspended`. Non-active
  accounts are refused at login and on every authenticated request, so
  suspending a user revokes their live tokens immediately.

**Authorization**

- Roles are enforced server-side on every route (`authenticate` +
  `authorize`), with per-record scoping in controllers (a doctor sees only
  their own consultations, a user only their own notifications). Frontend
  route guards are convenience only.
- Admins cannot change their own role or their own account status, and no
  role-change endpoint accepts a self-elevation.

**Audit trail**

- `AuditLog` is append-only: every field is immutable, and the API exposes no
  route that creates, edits, or deletes an entry.
- Logins (success, failure, blocked), user/role/status changes, settings
  changes, and clinical, pharmacy, laboratory, billing, and inpatient actions
  are all recorded with actor, IP, user agent, and request ID.
- Metadata is sanitised before storage: passwords, hashes, tokens, card
  details, and clinical free text (diagnoses, result values, notes) are never
  written to the trail — only identifiers, counts, and status transitions.
- Audit writes can never fail a business operation; failures are logged and
  swallowed.

**Other**

- Helmet sets security headers; CORS is restricted to `CLIENT_URL`; JSON
  bodies are capped at 10 kb.
- Every request gets an `X-Request-Id` that correlates the structured log
  line with the audit entry.
- Errors return safe messages — no stack traces, no internal details.
