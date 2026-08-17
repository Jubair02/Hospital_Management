import './env.js';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import createApp from '../app.js';
import InventoryBatch from '../models/InventoryBatch.js';
import StockTransaction from '../models/StockTransaction.js';
import { setupTestDB, createAdmin, createStaff, loginAs, ADMIN } from './helpers.js';
import {
  createDepartment,
  createActivePatient,
  createDoctorViaApi,
  setWeekdayAvailability,
  nextMonday,
} from './phase3Helpers.js';

const app = createApp();

setupTestDB();

let adminToken: string;
let pharmacistToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const futureDate = (daysAhead: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};

beforeEach(async () => {
  await createAdmin();
  adminToken = await loginAs(app, ADMIN);
  pharmacistToken = await loginAs(app, await createStaff('pharmacist'));
});

const createCategory = async (name = 'Analgesics'): Promise<string> => {
  const res = await request(app)
    .post('/api/pharmacy/categories')
    .set(auth(pharmacistToken))
    .send({ name })
    .expect(201);
  return res.body.data.category._id as string;
};

const createMedicine = async (
  overrides: Record<string, unknown> = {},
  categoryId?: string
): Promise<{ _id: string; medicineId: string }> => {
  const category = categoryId ?? (await createCategory(`Cat-${Math.random().toString(36).slice(2, 8)}`));
  const res = await request(app)
    .post('/api/pharmacy/medicines')
    .set(auth(pharmacistToken))
    .send({
      name: 'Paracetamol',
      genericName: 'Acetaminophen',
      brandName: 'Napa',
      category,
      dosageForm: 'tablet',
      strength: '500 mg',
      manufacturer: 'Acme Pharma',
      reorderLevel: 20,
      ...overrides,
    })
    .expect(201);
  return res.body.data.medicine;
};

const stockIn = (medicineId: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/pharmacy/inventory')
    .set(auth(pharmacistToken))
    .send({
      medicineId,
      batchNumber: `B-${Math.random().toString(36).slice(2, 10)}`,
      quantity: 100,
      unitCost: 1.5,
      sellingPrice: 2,
      expiryDate: futureDate(180),
      ...overrides,
    });

/** Full clinical pipeline: completed consultation with two Rx lines. */
const completedConsultationWithRx = async (): Promise<string> => {
  const departmentId = String((await createDepartment(`Dept-${Math.random().toString(36).slice(2, 8)}`))._id);
  const doctor = await createDoctorViaApi(app, adminToken, departmentId);
  await setWeekdayAvailability(app, adminToken, doctor._id);
  const doctorToken = await loginAs(app, { email: doctor.email, password: 'DoctorPass123!' });
  const patientId = String((await createActivePatient({ phone: `555-${Math.floor(Math.random() * 10000)}` }))._id);

  const apt = await request(app)
    .post('/api/appointments')
    .set(auth(adminToken))
    .send({
      patientId,
      doctorId: doctor._id,
      appointmentDate: nextMonday(),
      startTime: '10:00',
      endTime: '10:30',
      reason: 'Fever',
    })
    .expect(201);

  const started = await request(app)
    .post('/api/consultations')
    .set(auth(doctorToken))
    .send({ appointmentId: apt.body.data.appointment._id })
    .expect(201);
  const consultationMongoId = started.body.data.consultation._id as string;

  await request(app)
    .patch(`/api/consultations/${consultationMongoId}`)
    .set(auth(doctorToken))
    .send({
      chiefComplaint: 'Fever and headache',
      assessment: 'Viral fever',
      treatmentPlan: 'Rest, fluids, antipyretics',
      diagnoses: [{ diagnosis: 'Viral fever', type: 'primary' }],
      prescriptions: [
        { medicineName: 'Paracetamol', dosage: '500 mg', frequency: 'Twice daily', duration: '5 days', route: 'Oral' },
        { medicineName: 'Cetirizine', dosage: '10 mg', frequency: 'Once daily', duration: '3 days' },
      ],
    })
    .expect(200);

  await request(app)
    .patch(`/api/consultations/${consultationMongoId}/status`)
    .set(auth(doctorToken))
    .send({ status: 'completed' })
    .expect(200);

  return consultationMongoId;
};

describe('pharmacist role', () => {
  it('can log in and reach pharmacy APIs; other roles are blocked from pharmacy', async () => {
    await request(app).get('/api/pharmacy/stats').set(auth(pharmacistToken)).expect(200);
    await request(app).get('/api/pharmacy/stats').set(auth(adminToken)).expect(200);

    for (const role of ['doctor', 'receptionist'] as const) {
      const token = await loginAs(app, await createStaff(role));
      await request(app).get('/api/pharmacy/medicines').set(auth(token)).expect(403);
      await request(app).post('/api/pharmacy/dispensing').set(auth(token)).send({}).expect(403);
    }

    // Nurses read the catalogue so an administration is charted against a real
    // medicine instead of a typed drug name. Read-only: the rest of the module
    // is still closed to them.
    const nurseToken = await loginAs(app, await createStaff('nurse'));
    await request(app).get('/api/pharmacy/medicines').set(auth(nurseToken)).expect(200);
    await request(app).post('/api/pharmacy/dispensing').set(auth(nurseToken)).send({}).expect(403);
    await request(app)
      .post('/api/pharmacy/medicines')
      .set(auth(nurseToken))
      .send({})
      .expect(403);
    await request(app).get('/api/pharmacy/stats').set(auth(nurseToken)).expect(403);
    await request(app).get('/api/pharmacy/inventory').set(auth(nurseToken)).expect(403);

    await request(app).get('/api/pharmacy/medicines').expect(401);
  });

  it('cannot manage users or author clinical records', async () => {
    await request(app).get('/api/users').set(auth(pharmacistToken)).expect(403);
    await request(app)
      .post('/api/consultations')
      .set(auth(pharmacistToken))
      .send({ appointmentId: '64b000000000000000000000' })
      .expect(403);
  });
});

describe('categories & medicines', () => {
  it('creates categories with generated IDs and rejects duplicates', async () => {
    const res = await request(app)
      .post('/api/pharmacy/categories')
      .set(auth(pharmacistToken))
      .send({ name: 'Antibiotics' })
      .expect(201);
    expect(res.body.data.category.categoryId).toBe('CAT-001');

    await request(app)
      .post('/api/pharmacy/categories')
      .set(auth(pharmacistToken))
      .send({ name: 'Antibiotics' })
      .expect(409);
  });

  it('creates, updates, and deactivates medicines', async () => {
    const med = await createMedicine();
    expect(med.medicineId).toMatch(/^MED-\d{5}$/);

    const upd = await request(app)
      .patch(`/api/pharmacy/medicines/${med._id}`)
      .set(auth(pharmacistToken))
      .send({ strength: '650 mg', reorderLevel: 30 })
      .expect(200);
    expect(upd.body.data.medicine.strength).toBe('650 mg');

    await request(app)
      .patch(`/api/pharmacy/medicines/${med._id}/status`)
      .set(auth(pharmacistToken))
      .send({ status: 'inactive' })
      .expect(200);

    // Inactive medicines cannot receive stock.
    await stockIn(med._id).expect(400);
  });

  it('rejects invalid medicines and inactive categories', async () => {
    await request(app)
      .post('/api/pharmacy/medicines')
      .set(auth(pharmacistToken))
      .send({ name: 'X' })
      .expect(400);

    const catId = await createCategory('Old Category');
    await request(app)
      .patch(`/api/pharmacy/categories/${catId}/status`)
      .set(auth(pharmacistToken))
      .send({ status: 'inactive' })
      .expect(200);
    await request(app)
      .post('/api/pharmacy/medicines')
      .set(auth(pharmacistToken))
      .send({ name: 'Y', category: catId, dosageForm: 'tablet' })
      .expect(400);
  });

  it('searches and filters medicines, and computes stock + low-stock', async () => {
    const med = await createMedicine(); // reorderLevel 20
    await createMedicine({ name: 'Amoxicillin', genericName: 'Amoxicillin', brandName: 'Amoxil' });

    for (const term of ['parace', 'acetamin', 'napa', med.medicineId.toLowerCase()]) {
      const res = await request(app)
        .get('/api/pharmacy/medicines')
        .query({ search: term })
        .set(auth(pharmacistToken))
        .expect(200);
      expect(res.body.data.medicines).toHaveLength(1);
    }

    // No stock yet → totalStock 0 → low stock.
    const low = await request(app)
      .get('/api/pharmacy/medicines')
      .query({ stock: 'low' })
      .set(auth(pharmacistToken))
      .expect(200);
    expect(low.body.data.medicines).toHaveLength(2);

    // Stock 100 (> reorder 20) → no longer low.
    await stockIn(med._id).expect(201);
    const afterStock = await request(app)
      .get('/api/pharmacy/medicines')
      .query({ search: 'parace' })
      .set(auth(pharmacistToken))
      .expect(200);
    expect(afterStock.body.data.medicines[0].totalStock).toBe(100);
    expect(afterStock.body.data.medicines[0].lowStock).toBe(false);
  });
});

describe('inventory', () => {
  it('stock-in creates a batch and a ledger transaction', async () => {
    const med = await createMedicine();
    const res = await stockIn(med._id, { batchNumber: 'BN-1', quantity: 50 }).expect(201);

    const batch = res.body.data.batch;
    expect(batch.batchId).toMatch(/^BAT-\d{6}$/);
    expect(batch.quantity).toBe(50);

    const txns = await request(app)
      .get('/api/pharmacy/transactions')
      .set(auth(pharmacistToken))
      .expect(200);
    expect(txns.body.data.transactions).toHaveLength(1);
    expect(txns.body.data.transactions[0]).toMatchObject({
      type: 'stock_in',
      quantityChange: 50,
      balanceAfter: 50,
    });
  });

  it('rejects expired stock-in, bad quantities, and duplicate batch numbers', async () => {
    const med = await createMedicine();
    await stockIn(med._id, { expiryDate: '2020-01-01' }).expect(400);
    await stockIn(med._id, { quantity: 0 }).expect(400);
    await stockIn(med._id, { quantity: -5 }).expect(400);

    await stockIn(med._id, { batchNumber: 'DUP-1' }).expect(201);
    await stockIn(med._id, { batchNumber: 'DUP-1' }).expect(409);
  });

  it('adjusts stock up and down and never allows negative stock', async () => {
    const med = await createMedicine();
    const batch = (await stockIn(med._id, { quantity: 10 }).expect(201)).body.data.batch;

    await request(app)
      .patch(`/api/pharmacy/inventory/${batch._id}/adjust`)
      .set(auth(pharmacistToken))
      .send({ quantityChange: 5, notes: 'Found extra units' })
      .expect(200);

    const down = await request(app)
      .patch(`/api/pharmacy/inventory/${batch._id}/adjust`)
      .set(auth(pharmacistToken))
      .send({ quantityChange: -15, type: 'expiry', notes: 'Write-off' })
      .expect(200);
    expect(down.body.data.batch.quantity).toBe(0);

    // Below zero → rejected, quantity unchanged.
    await request(app)
      .patch(`/api/pharmacy/inventory/${batch._id}/adjust`)
      .set(auth(pharmacistToken))
      .send({ quantityChange: -1 })
      .expect(400);
    const fresh = await InventoryBatch.findById(batch._id);
    expect(fresh?.quantity).toBe(0);

    // Every movement hit the ledger.
    const txns = await request(app)
      .get('/api/pharmacy/transactions')
      .set(auth(pharmacistToken))
      .expect(200);
    expect(txns.body.data.transactions).toHaveLength(3); // in, +5 adj, -15 expiry
  });

  it('filters expired / expiring-soon / depleted views', async () => {
    const med = await createMedicine();
    const soonBatch = (await stockIn(med._id, { batchNumber: 'SOON', expiryDate: futureDate(10) }).expect(201)).body.data.batch;
    await stockIn(med._id, { batchNumber: 'FAR', expiryDate: futureDate(300) }).expect(201);

    // Manufacture an expired batch directly (stock-in rightly refuses them).
    await InventoryBatch.updateOne(
      { _id: soonBatch._id },
      { $set: { expiryDate: new Date(Date.now() - 86_400_000) } }
    );

    const expired = await request(app)
      .get('/api/pharmacy/inventory')
      .query({ view: 'expired' })
      .set(auth(pharmacistToken))
      .expect(200);
    expect(expired.body.data.batches).toHaveLength(1);
    expect(expired.body.data.batches[0].batchNumber).toBe('SOON');

    const inStock = await request(app)
      .get('/api/pharmacy/inventory')
      .query({ view: 'in_stock' })
      .set(auth(pharmacistToken))
      .expect(200);
    expect(inStock.body.data.batches).toHaveLength(1);
    expect(inStock.body.data.batches[0].batchNumber).toBe('FAR');
  });
});

describe('prescription integration & dispensing', () => {
  let consultationId: string;
  let medId: string;

  beforeEach(async () => {
    consultationId = await completedConsultationWithRx();
    medId = (await createMedicine())._id;
  });

  const dispense = (items: Array<Record<string, unknown>>, token = pharmacistToken) =>
    request(app)
      .post('/api/pharmacy/dispensing')
      .set(auth(token))
      .send({ consultationId, items });

  it('lists and shows prescriptions read-only; pharmacist cannot modify clinical data', async () => {
    const list = await request(app)
      .get('/api/pharmacy/prescriptions')
      .set(auth(pharmacistToken))
      .expect(200);
    expect(list.body.data.consultations).toHaveLength(1);
    expect(list.body.data.consultations[0].prescriptions).toHaveLength(2);

    const detail = await request(app)
      .get(`/api/pharmacy/prescriptions/${consultationId}`)
      .set(auth(pharmacistToken))
      .expect(200);
    expect(detail.body.data.consultation.prescriptions[0].medicineName).toBe('Paracetamol');

    // The clinical record itself is untouchable by pharmacy staff.
    await request(app)
      .patch(`/api/consultations/${consultationId}`)
      .set(auth(pharmacistToken))
      .send({ prescriptions: [] })
      .expect(403);
  });

  it('fully dispenses a line: stock down, ledger written, fulfillment dispensed', async () => {
    await stockIn(medId, { quantity: 50 }).expect(201);

    const res = await dispense([
      { prescriptionIndex: 0, medicineId: medId, quantity: 10, prescribedQuantity: 10 },
    ]).expect(201);

    const record = res.body.data.record;
    expect(record.dispensingId).toMatch(/^DSP-\d{6}$/);
    expect(record.items[0].quantity).toBe(10);

    const detail = await request(app)
      .get(`/api/pharmacy/prescriptions/${consultationId}`)
      .set(auth(pharmacistToken))
      .expect(200);
    expect(detail.body.data.fulfillments[0]).toMatchObject({
      dispensedQuantity: 10,
      remaining: 0,
      status: 'dispensed',
    });

    const batches = await InventoryBatch.find({ medicineId: medId });
    expect(batches[0]!.quantity).toBe(40);

    const dispenseTxns = await StockTransaction.find({ type: 'dispense' });
    expect(dispenseTxns).toHaveLength(1);
    expect(dispenseTxns[0]!.quantityChange).toBe(-10);
    expect(dispenseTxns[0]!.balanceAfter).toBe(40);
  });

  it('supports partial dispensing and blocks over-dispensing', async () => {
    await stockIn(medId, { quantity: 100 }).expect(201);

    await dispense([
      { prescriptionIndex: 0, medicineId: medId, quantity: 4, prescribedQuantity: 10 },
    ]).expect(201);

    let detail = await request(app)
      .get(`/api/pharmacy/prescriptions/${consultationId}`)
      .set(auth(pharmacistToken))
      .expect(200);
    expect(detail.body.data.fulfillments[0]).toMatchObject({
      dispensedQuantity: 4,
      remaining: 6,
      status: 'partial',
    });

    // Over-dispensing: 7 > 6 remaining → blocked, nothing changes.
    const over = await dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 7 }]).expect(400);
    expect(over.body.message).toMatch(/over-dispensing/i);
    expect((await InventoryBatch.findOne({ medicineId: medId }))?.quantity).toBe(96);

    // Completing the remainder works.
    await dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 6 }]).expect(201);
    detail = await request(app)
      .get(`/api/pharmacy/prescriptions/${consultationId}`)
      .set(auth(pharmacistToken))
      .expect(200);
    expect(detail.body.data.fulfillments[0].status).toBe('dispensed');
  });

  it('uses FEFO: earliest-expiring batch is drained first', async () => {
    await stockIn(medId, { batchNumber: 'LATE', quantity: 50, expiryDate: futureDate(365) }).expect(201);
    await stockIn(medId, { batchNumber: 'EARLY', quantity: 6, expiryDate: futureDate(30) }).expect(201);

    const res = await dispense([
      { prescriptionIndex: 0, medicineId: medId, quantity: 10, prescribedQuantity: 20 },
    ]).expect(201);

    const batchesUsed = res.body.data.record.items[0].batches;
    expect(batchesUsed).toHaveLength(2);
    expect(batchesUsed[0].batchNumber).toBe('EARLY');
    expect(batchesUsed[0].quantity).toBe(6);
    expect(batchesUsed[1].batchNumber).toBe('LATE');
    expect(batchesUsed[1].quantity).toBe(4);

    expect((await InventoryBatch.findOne({ batchNumber: 'EARLY' }))?.quantity).toBe(0);
    expect((await InventoryBatch.findOne({ batchNumber: 'LATE' }))?.quantity).toBe(46);
  });

  it('never dispenses expired stock', async () => {
    const batch = (await stockIn(medId, { quantity: 50 }).expect(201)).body.data.batch;
    await InventoryBatch.updateOne(
      { _id: batch._id },
      { $set: { expiryDate: new Date(Date.now() - 86_400_000) } }
    );

    const res = await dispense([
      { prescriptionIndex: 0, medicineId: medId, quantity: 5, prescribedQuantity: 10 },
    ]).expect(400);
    expect(res.body.message).toMatch(/non-expired/i);
    expect((await InventoryBatch.findById(batch._id))?.quantity).toBe(50);
  });

  it('rolls back the whole request when a later line fails', async () => {
    await stockIn(medId, { quantity: 50 }).expect(201);
    const med2 = (await createMedicine({ name: 'Cetirizine' }))._id;
    // med2 has NO stock — line 2 must fail and line 1 must be undone.

    await dispense([
      { prescriptionIndex: 0, medicineId: medId, quantity: 5, prescribedQuantity: 10 },
      { prescriptionIndex: 1, medicineId: med2, quantity: 3, prescribedQuantity: 3 },
    ]).expect(400);

    // Line 1's stock and fulfillment were fully compensated.
    expect((await InventoryBatch.findOne({ medicineId: medId }))?.quantity).toBe(50);
    const detail = await request(app)
      .get(`/api/pharmacy/prescriptions/${consultationId}`)
      .set(auth(pharmacistToken))
      .expect(200);
    const line0 = detail.body.data.fulfillments.find(
      (f: { prescriptionIndex: number }) => f.prescriptionIndex === 0
    );
    expect(line0?.dispensedQuantity ?? 0).toBe(0);
    // No ledger rows or dispensing records escaped the rollback.
    expect(await StockTransaction.countDocuments({ type: 'dispense' })).toBe(0);
    const history = await request(app)
      .get('/api/pharmacy/dispensing')
      .set(auth(pharmacistToken))
      .expect(200);
    expect(history.body.data.records).toHaveLength(0);
  });

  it('concurrent dispensing cannot oversell stock', async () => {
    await stockIn(medId, { quantity: 10 }).expect(201);

    // Two concurrent requests, each wanting all 10 units of the same line.
    const [a, b] = await Promise.all([
      dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 10, prescribedQuantity: 30 }]).then((r) => r.status),
      dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 10, prescribedQuantity: 30 }]).then((r) => r.status),
    ]);

    expect([a, b].filter((s) => s === 201)).toHaveLength(1);
    expect([a, b].filter((s) => s === 400)).toHaveLength(1);

    const batch = await InventoryBatch.findOne({ medicineId: medId });
    expect(batch?.quantity).toBe(0); // exactly one succeeded, never negative
  });

  it('rejects invalid dispensing requests', async () => {
    await stockIn(medId, { quantity: 50 }).expect(201);

    // Bad line index
    await dispense([{ prescriptionIndex: 9, medicineId: medId, quantity: 1, prescribedQuantity: 5 }]).expect(400);
    // Missing prescribedQuantity on first dispense
    await dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 1 }]).expect(400);
    // Zero/negative quantity
    await dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 0, prescribedQuantity: 5 }]).expect(400);
    // Unknown consultation
    await request(app)
      .post('/api/pharmacy/dispensing')
      .set(auth(pharmacistToken))
      .send({
        consultationId: '64b000000000000000000000',
        items: [{ prescriptionIndex: 0, medicineId: medId, quantity: 1, prescribedQuantity: 5 }],
      })
      .expect(404);
  });

  it('records dispensing history', async () => {
    await stockIn(medId, { quantity: 50 }).expect(201);
    await dispense([{ prescriptionIndex: 0, medicineId: medId, quantity: 5, prescribedQuantity: 10 }]).expect(201);

    const history = await request(app)
      .get('/api/pharmacy/dispensing')
      .query({ consultationId })
      .set(auth(pharmacistToken))
      .expect(200);
    expect(history.body.data.records).toHaveLength(1);
    expect(history.body.data.records[0].items[0].medicineName).toBe('Paracetamol');
  });
});

describe('GET /api/pharmacy/stats', () => {
  it('returns real counts', async () => {
    const consultationId = await completedConsultationWithRx();
    const med = await createMedicine();
    await stockIn(med._id, { quantity: 5 }).expect(201); // 5 < reorder 20 → low

    let stats = (await request(app).get('/api/pharmacy/stats').set(auth(pharmacistToken)).expect(200)).body.data;
    expect(stats).toMatchObject({
      totalMedicines: 1,
      activeMedicines: 1,
      lowStockCount: 1,
      expiredBatches: 0,
      pendingPrescriptions: 1,
      todaysDispensings: 0,
    });

    await request(app)
      .post('/api/pharmacy/dispensing')
      .set(auth(pharmacistToken))
      .send({
        consultationId,
        items: [{ prescriptionIndex: 0, medicineId: med._id, quantity: 5, prescribedQuantity: 10 }],
      })
      .expect(201);

    stats = (await request(app).get('/api/pharmacy/stats').set(auth(pharmacistToken)).expect(200)).body.data;
    expect(stats.pendingPrescriptions).toBe(0);
    expect(stats.todaysDispensings).toBe(1);
  });
});
