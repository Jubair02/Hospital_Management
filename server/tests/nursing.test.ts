import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Observation from '../models/Observation.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import { createDepartment, createActivePatient, createDoctorViaApi } from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let receptionistToken: string;
let nurseToken: string;
let nurseId: string;
let doctorMongoId: string;
let patientId: string;
let wardId: string;
let otherWardId: string;
let bedA: string;
let otherBed: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const createWard = async (name: string): Promise<string> => {
  const res = await request(app)
    .post('/api/inpatient/wards')
    .set(auth(adminToken))
    .send({ name, type: 'general', floor: '2' })
    .expect(201);
  return res.body.data.ward._id as string;
};

const createBed = async (ward: string, bedNumber: string): Promise<string> => {
  const res = await request(app)
    .post('/api/inpatient/beds')
    .set(auth(adminToken))
    .send({ wardId: ward, bedNumber, bedType: 'standard' })
    .expect(201);
  return res.body.data.bed._id as string;
};

const admit = (bedId: string, ward: string, patient: string) =>
  request(app)
    .post('/api/inpatient/admissions')
    .set(auth(receptionistToken))
    .send({
      patientId: patient,
      doctorId: doctorMongoId,
      wardId: ward,
      bedId,
      reason: 'Observation after fall',
      admissionType: 'emergency',
    })
    .expect(201);

/** Puts the nurse on a set of wards through the admin API, as an admin would. */
const assignWards = (wards: string[]) =>
  request(app)
    .patch(`/api/users/${nurseId}`)
    .set(auth(adminToken))
    .send({ assignedWards: wards });

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  receptionistToken = await loginAs(app, await createStaff('receptionist'));

  const nurseCreds = await createStaff('nurse');
  nurseToken = await loginAs(app, nurseCreds);
  nurseId = String((await User.findOne({ email: nurseCreds.email }))!._id);

  const departmentId = String((await createDepartment('Cardiology'))._id);
  doctorMongoId = (await createDoctorViaApi(app, adminToken, departmentId))._id;
  patientId = String((await createActivePatient())._id);

  wardId = await createWard('General Ward A');
  otherWardId = await createWard('General Ward B');
  bedA = await createBed(wardId, 'A-101');
  otherBed = await createBed(otherWardId, 'B-101');
});

describe('ward assignment', () => {
  it('assigns wards to a nurse and refuses them for other roles', async () => {
    const res = await assignWards([wardId]).expect(200);
    expect(res.body.data.user.assignedWards).toHaveLength(1);

    const doctorUser = await User.findOne({ role: 'doctor' });
    await request(app)
      .patch(`/api/users/${doctorUser!._id}`)
      .set(auth(adminToken))
      .send({ assignedWards: [wardId] })
      .expect(400);
  });

  it('rejects wards that do not exist', async () => {
    await assignWards([String(patientId)]).expect(400);
  });

  it('reaches the client through /auth/me', async () => {
    // The nurse dashboard scopes itself from this field. If it stopped being
    // serialized the board would silently widen to the whole hospital rather
    // than fail, so the contract is asserted rather than assumed.
    await assignWards([wardId]).expect(200);

    const me = await request(app).get('/api/auth/me').set(auth(nurseToken)).expect(200);
    expect(me.body.data.user.assignedWards).toEqual([wardId]);
  });

  it('is admin-only', async () => {
    await request(app)
      .patch(`/api/users/${nurseId}`)
      .set(auth(nurseToken))
      .send({ assignedWards: [wardId] })
      .expect(403);
  });
});

describe('observations', () => {
  it('records a reading, attaches the current admission, and lists it back', async () => {
    await admit(bedA, wardId, patientId);

    const created = await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { temperature: 38.4, heartRate: 96 }, notes: 'Warm to touch' })
      .expect(201);

    const observation = created.body.data.observation;
    expect(observation.observationId).toMatch(/^OBS-\d{6}$/);
    expect(observation.vitalSigns.temperature).toBe(38.4);
    // Resolved from the patient's current stay rather than supplied.
    expect(observation.admissionId).toBeTruthy();
    expect(observation.recordedBy.role).toBe('nurse');

    const list = await request(app)
      .get(`/api/observations?patientId=${patientId}`)
      .set(auth(nurseToken))
      .expect(200);
    expect(list.body.data.observations).toHaveLength(1);
  });

  it('records an outpatient reading with no admission', async () => {
    const res = await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(201);
    expect(res.body.data.observation.admissionId).toBeFalsy();
  });

  it('refuses an empty reading, bad numbers, and a future timestamp', async () => {
    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: {} })
      .expect(400);

    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { oxygenSaturation: 140 } })
      .expect(400);

    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({
        patientId,
        vitalSigns: { heartRate: 70 },
        recordedAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(400);
  });

  it('keeps receptionists out and unauthenticated callers at 401', async () => {
    await request(app)
      .post('/api/observations')
      .set(auth(receptionistToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(403);
    await request(app).get('/api/observations').expect(401);
  });

  it('is append-only — there is no route to change a reading', async () => {
    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(201);

    const stored = await Observation.findOne({ patientId });
    await request(app)
      .patch(`/api/observations/${stored!._id}`)
      .set(auth(nurseToken))
      .send({ vitalSigns: { heartRate: 200 } })
      .expect(404);
  });
});

describe('ward scoping', () => {
  it('an assigned nurse may only write for patients on their wards', async () => {
    await admit(otherBed, otherWardId, patientId);
    await assignWards([wardId]).expect(200);

    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(403);

    // Assigning the ward the patient is actually on opens it up.
    await assignWards([wardId, otherWardId]).expect(200);
    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(201);
  });

  it('an unassigned nurse keeps the hospital-wide access they had before', async () => {
    await admit(otherBed, otherWardId, patientId);

    await request(app)
      .post('/api/observations')
      .set(auth(nurseToken))
      .send({ patientId, vitalSigns: { heartRate: 70 } })
      .expect(201);
  });
});

describe('medication administration', () => {
  it('records a dose given', async () => {
    await admit(bedA, wardId, patientId);

    const res = await request(app)
      .post('/api/nursing/administrations')
      .set(auth(nurseToken))
      .send({ patientId, medicineName: 'Paracetamol', dosage: '500 mg', route: 'Oral' })
      .expect(201);

    expect(res.body.data.administration.administrationId).toMatch(/^MAR-\d{6}$/);
    expect(res.body.data.administration.status).toBe('given');

    const list = await request(app)
      .get(`/api/nursing/administrations?patientId=${patientId}`)
      .set(auth(nurseToken))
      .expect(200);
    expect(list.body.data.administrations).toHaveLength(1);
  });

  it('requires a reason when a dose is refused or held', async () => {
    for (const status of ['refused', 'held']) {
      await request(app)
        .post('/api/nursing/administrations')
        .set(auth(nurseToken))
        .send({ patientId, medicineName: 'Paracetamol', dosage: '500 mg', status })
        .expect(400);

      await request(app)
        .post('/api/nursing/administrations')
        .set(auth(nurseToken))
        .send({
          patientId,
          medicineName: 'Paracetamol',
          dosage: '500 mg',
          status,
          notes: 'Patient nil by mouth',
        })
        .expect(201);
    }
  });

  it('requires a medicine and dose, and rejects an unknown status', async () => {
    await request(app)
      .post('/api/nursing/administrations')
      .set(auth(nurseToken))
      .send({ patientId, dosage: '500 mg' })
      .expect(400);

    await request(app)
      .post('/api/nursing/administrations')
      .set(auth(nurseToken))
      .send({ patientId, medicineName: 'Paracetamol', dosage: '500 mg', status: 'maybe' })
      .expect(400);
  });
});

describe('nursing notes', () => {
  it('adds progress and handover notes and filters by category', async () => {
    await admit(bedA, wardId, patientId);

    await request(app)
      .post('/api/nursing/notes')
      .set(auth(nurseToken))
      .send({ patientId, body: 'Ate a full meal, mobilised to the chair.' })
      .expect(201);

    const handover = await request(app)
      .post('/api/nursing/notes')
      .set(auth(nurseToken))
      .send({ patientId, category: 'handover', shift: 'night', body: 'Watch the cannula site.' })
      .expect(201);
    expect(handover.body.data.note.noteId).toMatch(/^NNO-\d{6}$/);

    const onlyHandover = await request(app)
      .get(`/api/nursing/notes?patientId=${patientId}&category=handover`)
      .set(auth(nurseToken))
      .expect(200);
    expect(onlyHandover.body.data.notes).toHaveLength(1);
    expect(onlyHandover.body.data.notes[0].shift).toBe('night');
  });

  it('refuses an empty note and an unknown shift', async () => {
    await request(app)
      .post('/api/nursing/notes')
      .set(auth(nurseToken))
      .send({ patientId, body: '   ' })
      .expect(400);

    await request(app)
      .post('/api/nursing/notes')
      .set(auth(nurseToken))
      .send({ patientId, body: 'Fine', shift: 'graveyard' })
      .expect(400);
  });
});

describe('bed status and sample collection', () => {
  it('lets a nurse change a bed status', async () => {
    await request(app)
      .patch(`/api/inpatient/beds/${bedA}/status`)
      .set(auth(nurseToken))
      .send({ status: 'maintenance' })
      .expect(200);
  });

  it('still refuses admission and discharge to nurses', async () => {
    await request(app)
      .post('/api/inpatient/admissions')
      .set(auth(nurseToken))
      .send({ patientId, doctorId: doctorMongoId, wardId, bedId: bedA, reason: 'x' })
      .expect(403);

    await request(app)
      .post('/api/inpatient/discharges')
      .set(auth(nurseToken))
      .send({})
      .expect(403);
  });

  it('lets a nurse see the sample queue', async () => {
    await request(app).get('/api/laboratory/samples').set(auth(nurseToken)).expect(200);
  });
});

describe('ward notifications', () => {
  it('alerts the nurses covering a ward when a patient is admitted there', async () => {
    await assignWards([wardId]).expect(200);
    await admit(bedA, wardId, patientId);

    const inbox = await Notification.find({ recipientId: nurseId });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title).toMatch(/arriving on your ward/i);
  });

  it('does not alert a nurse assigned elsewhere', async () => {
    await assignWards([otherWardId]).expect(200);
    await admit(bedA, wardId, patientId);

    expect(await Notification.countDocuments({ recipientId: nurseId })).toBe(0);
  });

  it('does not flood an unassigned nurse with every ward in the hospital', async () => {
    await admit(bedA, wardId, patientId);

    expect(await Notification.countDocuments({ recipientId: nurseId })).toBe(0);
  });
});
