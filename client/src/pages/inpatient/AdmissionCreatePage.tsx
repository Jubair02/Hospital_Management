import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients } from '../../services/patientService';
import { getDoctors } from '../../services/doctorService';
import {
  admitPatient,
  getBeds,
  getWards,
} from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { Doctor, HospitalBed, Patient, Ward } from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import PageHeader from '../../components/ui/PageHeader';

export default function AdmissionCreatePage() {
  const navigate = useNavigate();

  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [availableBeds, setAvailableBeds] = useState<HospitalBed[]>([]);

  const [form, setForm] = useState({
    patientId: '',
    doctorId: '',
    wardId: '',
    bedId: '',
    reason: '',
    admissionType: 'scheduled',
    expectedDischargeDate: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoctors({ status: 'active', limit: 100 })
      .then((data) => setDoctors(data.doctors))
      .catch(() => {});
    getWards({ status: 'active', limit: 100 })
      .then((data) => setWards(data.wards.filter((w) => w.status === 'active')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      getPatients({ search: patientSearch.trim() || undefined, status: 'active', limit: 20 })
        .then((data) => setPatients(data.patients))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // Available beds for the chosen ward.
  useEffect(() => {
    setForm((f) => ({ ...f, bedId: '' }));
    if (!form.wardId) {
      setAvailableBeds([]);
      return;
    }
    getBeds({ wardId: form.wardId, status: 'available', limit: 100 })
      .then((data) => setAvailableBeds(data.beds))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.wardId]);

  const setField =
    (name: keyof typeof form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [name]: e.target.value }));
    };

  const handleSubmit = async () => {
    setError('');
    if (!form.patientId || !form.doctorId || !form.wardId || !form.bedId || !form.reason.trim()) {
      setError('Patient, doctor, ward, bed, and reason are required.');
      return;
    }
    setSaving(true);
    try {
      const admission = await admitPatient({
        patientId: form.patientId,
        doctorId: form.doctorId,
        wardId: form.wardId,
        bedId: form.bedId,
        reason: form.reason.trim(),
        admissionType: form.admissionType as 'emergency' | 'scheduled' | 'transfer',
        expectedDischargeDate: form.expectedDischargeDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      navigate(`/inpatient/admissions/${admission._id}`, {
        state: { flash: `${admission.admissionId} — patient admitted.` },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to admit the patient.'));
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Admit patient"
        subtitle="The bed is claimed atomically — if someone takes it first, you'll be asked to pick another."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card title="1 · Patient & doctor">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Find patient"
            placeholder="Search by name, ID, or phone"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
          />
          <Select
            label="Patient"
            value={form.patientId}
            onChange={setField('patientId')}
            options={patients.map((p) => ({
              value: p._id,
              label: `${p.firstName} ${p.lastName} (${p.patientId})`,
            }))}
            placeholder={patients.length ? 'Select a patient' : 'No matching active patients'}
          />
          <Select
            label="Attending doctor"
            value={form.doctorId}
            onChange={setField('doctorId')}
            options={doctors.map((d) => ({
              value: d._id,
              label: `Dr. ${d.firstName} ${d.lastName} — ${d.specialization}`,
            }))}
            placeholder="Select a doctor"
            className="sm:col-span-2"
          />
        </div>
      </Card>

      <Card title="2 · Ward & bed">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Ward"
            value={form.wardId}
            onChange={setField('wardId')}
            options={wards.map((w) => ({
              value: w._id,
              label: `${w.name} (${(w.bedSummary?.available ?? 0)} free)`,
            }))}
            placeholder="Select a ward"
          />
          <Select
            label="Bed"
            value={form.bedId}
            onChange={setField('bedId')}
            options={availableBeds.map((b) => ({
              value: b._id,
              label: `${b.bedNumber}${b.bedType ? ` (${b.bedType})` : ''}`,
            }))}
            placeholder={
              !form.wardId
                ? 'Choose a ward first'
                : availableBeds.length
                  ? 'Select an available bed'
                  : 'No available beds in this ward'
            }
            disabled={!form.wardId}
          />
        </div>
      </Card>

      <Card title="3 · Admission details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Admission type"
            value={form.admissionType}
            onChange={setField('admissionType')}
            options={[
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'emergency', label: 'Emergency' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
          <Input
            label="Expected discharge"
            type="date"
            min={today}
            value={form.expectedDischargeDate}
            onChange={setField('expectedDischargeDate')}
            hint="Optional"
          />
        </div>
        <div className="mt-4 space-y-4">
          <Textarea
            label={
              <>
                Reason<span aria-hidden="true" className="text-rose-500"> *</span>
              </>
            }
            value={form.reason}
            onChange={setField('reason')}
            rows={2}
            placeholder="Observation after fall"
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={setField('notes')}
            rows={2}
            hint="Optional"
          />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/inpatient/admissions')} disabled={saving}>
          Cancel
        </Button>
        <Button loading={saving} onClick={handleSubmit}>
          {saving ? 'Admitting…' : 'Admit patient'}
        </Button>
      </div>
    </div>
  );
}
