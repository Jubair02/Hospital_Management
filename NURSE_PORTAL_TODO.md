# Nurse Portal — build plan

Every nurse-permitted route in the API is currently a `GET`. This turns the
portal from a viewer into somewhere work gets recorded.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

## Order of work

Item 3 comes first: without it "my ward" cannot mean anything, and items 1 and 2
are hospital-wide instead of scoped.

- [ ] **3. Nurse-to-ward assignment** — the enabler
  - [ ] `assignedWards` on the user, admin-settable
  - [ ] scoping helper so nurse queries mean "my wards"
  - [ ] admin UI to assign
- [ ] **1. Vitals / observations recording**
  - [ ] shared `vitalSignsSchema` extracted from Consultation
  - [ ] `Observation` model + service + routes (nurse-writable)
  - [ ] record + history UI on the patient and admission
- [ ] **2. Nurse dashboard** — replace the placeholder
- [ ] **4. Medication administration**
  - [ ] `MedicationAdministration` model + routes
  - [ ] nurses can read the medicine catalogue
  - [ ] due/administered UI from consultation prescriptions
- [ ] **5. Nursing notes and shift handover**
- [ ] **6. Bed status control for nurses**
- [ ] **7. Lab sample collection by nurses**
- [ ] **8. Nurse notifications** (`notifyNurse` + wiring)

## Ground rules

- Existing RBAC, audit logging, and backend behaviour stay intact.
- Every new endpoint gets tests in the existing vitest suite.
- No new dependencies.

## Progress log

_(appended as items land)_
