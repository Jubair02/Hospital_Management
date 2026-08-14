# Hospital Management System

A staff portal and patient portal for running a hospital: patient records,
appointments, consultations, pharmacy, laboratory, billing, inpatient beds,
reporting, and system administration. TypeScript end to end, on the MERN stack.

Public registration is closed by design. Staff accounts are created by an
administrator, and patients receive portal access from their own record.

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict), client and server |
| Frontend | React 18, Vite 6, React Router 6, Tailwind CSS 4, Axios |
| Backend | Node.js, Express 4, Mongoose 8, JWT, bcrypt, Helmet |
| Database | MongoDB (Atlas or local) |
| Tests | Vitest + Supertest against an in-memory MongoDB |

## Getting started

Requires Node.js 18+ and a MongoDB database.

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Configure — fill in MONGODB_URI, JWT_SECRET, and the admin credentials
cd ../server && cp .env.example .env

# 3. Create the first administrator (idempotent)
npm run seed:admin
```

Every variable is documented in [`server/.env.example`](server/.env.example).
A strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then run both halves in separate terminals:

```bash
cd server && npm run dev     # API on http://localhost:5000
cd client && npm run dev     # UI  on http://localhost:5173
```

Sign in with the seeded administrator, change the password, then add staff
under **Users**. The client needs no configuration in development — Vite
proxies `/api` to the server. For production builds set `VITE_API_URL`.

```bash
cd server && npm test        # full API suite, isolated in-memory database
cd server && npm run build   # compile to dist/, then npm start
cd client && npm run build
```

## Roles

| Role | Sees |
|------|------|
| `admin` | Everything: users, audit logs, settings, system health, analytics |
| `doctor` | Own appointments, consultations, lab orders, clinical reports |
| `receptionist` | Registration, appointments, billing, admissions |
| `nurse` | Inpatient wards, beds, and patient records |
| `pharmacist` | Medicine catalog, inventory, dispensing |
| `lab_technician` | Samples, results, and verification |
| `patient` | Own records only, through the portal — never a staff endpoint |

Authorization is enforced on the server for every route, with per-record
scoping in the controllers: a doctor reaches only their own consultations, a
patient only their own data. The frontend route guards are convenience, not
security.

## API

All responses share one envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

| Group | Covers |
|-------|--------|
| `/api/auth` | Login, current user, logout, password change |
| `/api/users` | Staff account management (admin) |
| `/api/patients` | Patient register, profiles, portal access |
| `/api/departments`, `/api/doctors` | Directory, profiles, weekly availability |
| `/api/appointments` | Booking, rescheduling, status lifecycle |
| `/api/consultations` | Clinical records and diagnoses |
| `/api/pharmacy` | Catalog, batches, stock ledger, dispensing |
| `/api/laboratory` | Test catalog, orders, samples, results |
| `/api/billing` | Invoices, payments, refunds |
| `/api/inpatient` | Wards, beds, admissions, transfers, discharges |
| `/api/analytics`, `/api/reports` | Dashboards and per-module reports (`?format=csv`) |
| `/api/notifications` | In-app inbox |
| `/api/admin` | Audit logs, system settings, system health |
| `/api/patient` | Patient self-service portal |

Status codes are meaningful: `400` validation, `401` unauthenticated, `403`
forbidden, `404` missing, `409` conflict.

## Security

- Passwords are bcrypt-hashed and never returned by any endpoint, not even to
  an administrator. In production the server refuses to start with a weak
  `JWT_SECRET`.
- Failed logins are rate-limited per IP and lock an account temporarily —
  never permanently. Every failure returns the same response, so nothing
  reveals which emails exist or which accounts are locked.
- Accounts are `active`, `inactive`, or `suspended`. A non-active account is
  refused on every authenticated request, so revoking access takes effect
  immediately rather than when the token expires.
- The audit trail is append-only, with no route that edits or deletes an
  entry. Logins, permission changes, and clinical, pharmacy, laboratory,
  billing, and inpatient actions are recorded with actor, IP, and request ID.
  Metadata is sanitised first — no passwords, tokens, card details, or
  clinical free text is ever written to it.
- Records are retired by status rather than deleted. Deletion, where it
  exists, is refused when it would leave clinical or financial history
  without an author.

## Layout

```text
client/src/
├── components/   UI primitives, charts, per-module widgets
├── context/      Session and system settings
├── layouts/      Sidebar + header shell
├── pages/        One folder per module
├── routes/       Route table and role guards
└── services/     One typed API client per module

server/
├── controllers/  One per module
├── middleware/   Auth, validation, audit, error handling
├── models/       Mongoose schemas
├── routes/       Route definitions
├── services/     Business logic (sequences, billing, audit, settings)
└── tests/        Vitest + Supertest suites
```
