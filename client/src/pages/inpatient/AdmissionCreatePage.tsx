import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import Icon from '../../components/ui/icons';
import { formatDate, localDay } from '../../utils/date';

const ADMISSION_TYPES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'transfer', label: 'Transfer' },
] as const;

export default function AdmissionCreatePage() {
  const navigate = useNavigate();

  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  /**
   * Kept apart from the search results: typing again re-runs the search, and
   * a chosen patient who falls out of the new page left the dropdown showing
   * its placeholder while the id underneath stayed selected.
   */
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
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

  const today = localDay();

  // The chosen patient stays selectable even after a later search drops them.
  const patientOptions = (() => {
    const label = (p: Patient) => `${p.firstName} ${p.lastName} (${p.patientId})`;
    const options = patients.map((p) => ({ value: p._id, label: label(p) }));

    if (selectedPatient && !patients.some((p) => p._id === selectedPatient._id)) {
      options.unshift({ value: selectedPatient._id, label: label(selectedPatient) });
    }
    return options;
  })();

  const selectedDoctor = doctors.find((d) => d._id === form.doctorId);
  const selectedWard = wards.find((w) => w._id === form.wardId);
  const selectedBed = availableBeds.find((b) => b._id === form.bedId);

  /** The first thing still missing, phrased as the next thing to do. */
  const nextStep = !form.patientId
    ? 'Choose the patient being admitted.'
    : !form.doctorId
      ? 'Choose the attending doctor.'
      : !form.bedId
        ? 'Choose a ward and an available bed.'
        : !form.reason.trim()
          ? 'Add a reason for the admission.'
          : null;

  return (
    // Steps on the left, what is about to happen on the right. The summary
    // sticks, so the button that claims a bed stays in view instead of sitting
    // below three cards of form.
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Grouped with the heading, matching the other create screens. Cancel
          in the summary panel goes to the same place, but that is a decision
          about the form; this is just the way out. */}
      <div className="space-y-3">
        <Link
          to="/inpatient/admissions"
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
          Admissions
        </Link>

        <PageHeader
          eyebrow="Inpatient"
          title="Admit patient"
          subtitle="The bed is claimed atomically — if someone takes it first, you'll be asked to pick another."
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card
            title="1 · Patient and doctor"
            icon="patients"
            actions={form.patientId && form.doctorId && <StepDone />}
          >
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
                onChange={(e) => {
                  setField('patientId')(e);
                  setSelectedPatient(patients.find((p) => p._id === e.target.value) ?? null);
                }}
                options={patientOptions}
                placeholder={
                  patientOptions.length ? 'Select a patient' : 'No matching active patients'
                }
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

          <Card title="2 · Ward and bed" icon="bed" actions={form.bedId && <StepDone />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Ward"
                value={form.wardId}
                onChange={setField('wardId')}
                options={wards.map((w) => ({
                  value: w._id,
                  label: `${w.name} — ${w.bedSummary?.available ?? 0} free`,
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

            {form.wardId && availableBeds.length === 0 && (
              <Alert tone="warning" className="mt-4">
                Every bed in {selectedWard?.name ?? 'this ward'} is taken. Pick another ward, or
                free a bed first.
              </Alert>
            )}
          </Card>

          <Card
            title="3 · Admission details"
            icon="clipboard"
            actions={form.reason.trim() && <StepDone />}
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Admission type</legend>
              {/* Three options shown at once rather than hidden in a dropdown:
                  this is the field that changes how the ward reads the
                  admission, and an emergency should be visible from across the
                  desk rather than one line of a closed select. */}
              <div className="flex flex-wrap gap-2">
                {ADMISSION_TYPES.map((type) => {
                  const active = form.admissionType === type.value;
                  const urgent = type.value === 'emergency';

                  return (
                    <button
                      key={type.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setForm((f) => ({ ...f, admissionType: type.value }))}
                      className={`min-h-10 rounded-xl border px-4 text-sm font-medium transition duration-200 active:scale-[0.98]
                        ${
                          active
                            ? urgent
                              ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                              : 'border-accent-600 bg-accent-600 text-white shadow-sm'
                            : 'border-line-strong bg-white text-slate-700 hover:border-accent-400 hover:bg-accent-50/60 hover:text-accent-800'
                        }`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-5 space-y-4">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Expected discharge"
                  type="date"
                  min={today}
                  value={form.expectedDischargeDate}
                  onChange={setField('expectedDischargeDate')}
                  hint="Optional"
                />
              </div>
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={setField('notes')}
                rows={2}
                hint="Optional"
              />
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          <Card title="Admission summary" icon="check">
            <dl className="space-y-3">
              <SummaryRow
                label="Patient"
                value={
                  selectedPatient &&
                  `${selectedPatient.firstName} ${selectedPatient.lastName} · ${selectedPatient.patientId}`
                }
              />
              <SummaryRow
                label="Doctor"
                value={
                  selectedDoctor && `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`
                }
              />
              <SummaryRow
                label="Bed"
                value={
                  selectedWard && selectedBed && `${selectedWard.name} · ${selectedBed.bedNumber}`
                }
              />
              <SummaryRow
                label="Type"
                value={ADMISSION_TYPES.find((t) => t.value === form.admissionType)?.label}
              />
              <SummaryRow
                label="Expected discharge"
                value={form.expectedDischargeDate && formatDate(form.expectedDischargeDate)}
              />
            </dl>

            {nextStep && (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-line">
                {nextStep}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row-reverse lg:flex-col-reverse">
              <Button
                variant="primary"
                className="w-full"
                loading={saving}
                disabled={Boolean(nextStep)}
                onClick={handleSubmit}
              >
                {saving ? 'Admitting…' : 'Admit patient'}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/inpatient/admissions')}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Quiet tick beside a step's title once it has what it needs. */
function StepDone() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700">
      <Icon name="check" className="h-3.5 w-3.5" strokeWidth="2.5" />
      Done
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null | false }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd
        className={`min-w-0 text-right text-sm ${
          value ? 'font-medium text-slate-900' : 'text-slate-400'
        }`}
      >
        {value || 'Not chosen'}
      </dd>
    </div>
  );
}
