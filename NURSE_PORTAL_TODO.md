# Nurse Portal — build plan

Every nurse-permitted route in the API was a `GET`. This turns the portal from
a viewer into somewhere work gets recorded.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

## Backend

- [x] **3. Nurse-to-ward assignment** — the enabler
  - [x] `assignedWards` on the user, admin-settable via `PATCH /api/users/:id`
  - [x] `services/nurseScope.ts` — scoping + "may this nurse act on this patient"
  - [x] admin UI to assign (ward checkboxes in User Management)
- [x] **1. Vitals / observations recording**
  - [x] `models/vitalSigns.ts` — schema shared with Consultation
  - [x] `middleware/vitalsRules.ts` — validation shared with Consultation
  - [x] `Observation` model, controller, `POST/GET /api/observations`
  - [x] record + history UI (Nursing record card)
- [x] **2. Nurse dashboard** — replaced the placeholder
- [x] **4. Medication administration**
  - [x] `MedicationAdministration` model, `POST/GET /api/nursing/administrations`
  - [x] nurses can read the medicine catalogue (read-only exception)
  - [x] chart UI (Medications panel + dose modal)
- [x] **5. Nursing notes and shift handover**
  - [x] `NursingNote` model, `POST/GET /api/nursing/notes`
  - [x] notes UI (Notes panel + handover)
- [x] **6. Bed status control for nurses** — `BED_STATUS_ROLES` + ward page UI
- [x] **7. Lab sample collection by nurses** — queue + collect + Collect button and nav
- [x] **8. Nurse notifications** — `notifyWardNurses`, wired to admission + transfer

## Client — done

- [x] Ward assignment control in User Management
- [x] Observations: record form + history
- [x] Medication administration chart
- [x] Nursing notes + handover
- [x] Nurse dashboard built from the above

All eight items are complete.

## Ground rules

- Existing RBAC, audit logging, and backend behaviour stay intact.
- Every new endpoint gets tests in the existing vitest suite.
- No new dependencies.

## Progress log

- Backend for all 8 items landed. Server suite **331 passing** (was 305):
  21 new nursing tests, plus updates to the pharmacy and security role
  matrices recording the two deliberate new grants.
- Two shared extractions along the way, both behaviour-neutral: the vitals
  **schema** and the vitals **validation rules** now have one definition each,
  used by consultations and observations alike.
- `setupTestDB` now clears the three new collections. Without it, IDs restarted
  at `OBS-000001` while the previous document survived, so every write after
  the first in a file failed on the unique index.
- Client: `NursingRecordCard` (three feeds, three record modals) placed on the
  admission page and as a Nursing tab on the patient profile; ward assignment
  in the user form; the nurse dashboard rebuilt on real data.
- No new nav entries: the record lives on the pages the patient is already on,
  so nothing is reachable two ways.

### Follow-up audit

Three "backend done, UI unreachable" gaps found and closed:

- Bed status buttons were hardcoded to admin/receptionist; now use
  `canSetBedStatus`.
- The Collect button was gated by `canProcessLab` (bench roles). Split out
  `canCollectSample` so nurses can record a draw while rejecting a specimen
  stays with the laboratory.
- Nurses had no **Lab orders** nav entry despite the route allowing them.

Also: removed two speculative helpers from `nurseScope.ts` that nothing called,
and added a test asserting `assignedWards` survives `/auth/me` — the nurse
dashboard scopes itself from that field, and its absence would silently widen
the board rather than fail.

## UI follow-ups — done

- [x] **403 page** brought to parity with the 404 — and made useful: it now
  names the refused address and the role it was refused for, which is what a
  user needs to report. `RoleRoute` passes the path in redirect state.
- [x] **Latest nurse observation in the consultation workbench**, with an
  explicit "copy into this consultation" rather than a silent prefill — the
  doctor signs for what ends up in their own record.
- [x] **Vital trends** — sparklines with a normal band, drawn from the readings
  already loaded. Nothing is drawn from a single reading.
- [x] **Record from the nurse dashboard** — the "not observed" queue can now
  answer its own question in place, and the row leaves the queue on save.
- [x] **Medicine catalogue + prescription shortcuts** wired into the dose
  modal. The modal fetches the patient's prescriptions itself; the prop it used
  to expect was never filled by any caller, so the shortcuts were dead.

Also renamed `vitalsFromConsultation` → `vitalsToFormState`: the same eight
numbers now arrive from an observation too, so the name described the wrong
thing.
