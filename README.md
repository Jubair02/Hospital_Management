# Clinexa

A hospital management system with a staff portal and a patient portal — patient
records, appointments, consultations, pharmacy, laboratory, billing, inpatient
beds, nursing records, reporting, and administration. TypeScript end to end on
the MERN stack.

Public registration is closed by design: staff accounts are created by an
administrator, and patients receive portal access from their own record.

## Key features

- **Appointments** — booking against per-doctor weekly availability, with a
  status lifecycle driven by the consultation rather than by hand.
- **Consultations** — clinical records, vitals, diagnoses, prescriptions, and
  lab orders, editable only by the assigned doctor.
- **Pharmacy** — medicine catalogue, stock batches, dispensing against
  prescriptions (earliest expiry first), and an immutable stock ledger.
- **Laboratory** — test catalogue, orders, sample collection, results, and
  verification.
- **Inpatient** — wards, beds, admissions, transfers, and discharges.
- **Nursing** — bedside observations, medication administration, and shift
  handover notes, scoped to a nurse's assigned wards.
- **Billing** — invoices, payments, and refunds.
- **Analytics and reports** — dashboards plus per-module reports, CSV export.
- **Administration** — user management, system settings, health, and an
  append-only audit trail.
- **Patient portal** — self-service access to a patient's own records only.

## User roles

| Role | Access |
|------|--------|
| `admin` | Everything: users, audit logs, settings, system health, analytics |
| `doctor` | Own appointments and consultations, lab orders, clinical reports |
| `receptionist` | Registration, appointments, billing, admissions |
| `nurse` | Ward patients: observations, medications, notes, bed status, sample collection |
| `pharmacist` | Medicine catalogue, inventory, dispensing |
| `lab_technician` | Samples, results, verification |
| `patient` | Own records only, through the portal |

Authorization is enforced server-side on every route, with per-record scoping
in the controllers. Frontend route guards are convenience, not security.

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.7 (strict), client and server |
| Frontend | React 18, Vite 6, React Router 6, Tailwind CSS 4, Axios |
| Backend | Node.js 20+, Express 4, Mongoose 8, JWT, bcrypt, Helmet |
| Database | MongoDB (Atlas or local) |
| Tests | Vitest + Supertest against an in-memory MongoDB (336 tests) |

## Core workflow

```
Appointment booked  →  Doctor starts consultation  →  Doctor completes it
   (scheduled)            (appointment → confirmed)   (appointment → completed)
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                   ▼
                   Prescription                          Lab order
                          │                                   │
                   Pharmacy dispenses                  Sample → result
                   (batch, earliest expiry first)      → verified
                          │                                   │
                          └──────────────► Invoice ◄──────────┘
                                              │
                                           Payment
```

Inpatients follow their own path: admission to a ward and bed, nursing
observations and medication records during the stay, then discharge.

## Installation

Requires **Node.js 20+** and a MongoDB database.

```bash
git clone https://github.com/Jubair02/Hospital_Management.git
cd Hospital_Management

# Install
cd server && npm install
cd ../client && npm install

# Configure
cd ../server && cp .env.example .env    # then fill in the values below

# Create the first administrator (idempotent)
npm run seed:admin
```

Run both halves in separate terminals:

```bash
cd server && npm run dev     # API on http://localhost:5000
cd client && npm run dev     # UI  on http://localhost:5173
```

Sign in as the seeded administrator, change the password, then add staff under
**Users**. The client needs no configuration in development — Vite proxies
`/api` to the server.

**Other scripts**

```bash
cd server && npm test          # full API suite, isolated in-memory database
cd server && npm run build     # compile to dist/, then npm start
cd client && npm run build     # production bundle
```

Deployment (Render + Vercel + Atlas) is covered in [DEPLOYMENT.md](DEPLOYMENT.md).

## Environment variables

Set in `server/.env` — see [`server/.env.example`](server/.env.example) for the
full annotated list. Never commit real values.

| Variable | Purpose |
|----------|---------|
| `PORT` | Port the API listens on |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Token signing secret — long and random; the server refuses to start in production with a weak one |
| `JWT_EXPIRES_IN` | Token lifetime |
| `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First administrator, used by `npm run seed:admin` |
| `CLIENT_URL` | Frontend origin allowed by CORS (exact, no trailing slash) |
| `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX` | Failed-login throttling per IP |
| `PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS`, `PASSWORD_CHANGE_RATE_LIMIT_MAX` | Failed password-change throttling per user |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `TRUST_PROXY` | Set when behind a reverse proxy so rate limiting sees the real client IP |

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Client (`client/.env`) takes one variable, needed only for production builds:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL of the API, including the `/api` suffix |

## Author

**Jubair** — [github.com/Jubair02](https://github.com/Jubair02)
