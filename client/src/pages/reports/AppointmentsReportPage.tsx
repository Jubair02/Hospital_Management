import { useCallback, useEffect, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import { getAppointmentReport } from '../../services/analyticsService';
import { getDepartments } from '../../services/departmentService';
import { getDoctors } from '../../services/doctorService';
import type { AppointmentReport, Department, Doctor, ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import BarList from '../../components/charts/BarList';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

export default function AppointmentsReportPage() {
  const { role } = useAuth();
  const isDoctor = role === 'doctor';

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
    if (!isDoctor) {
      getDoctors({ limit: 100 })
        .then((data) => setDoctors(data.doctors))
        .catch(() => {});
    }
  }, [isDoctor]);

  const load = useCallback(
    (filters: ReportFilters) =>
      getAppointmentReport({
        ...filters,
        doctorId: doctorId || undefined,
        departmentId: departmentId || undefined,
        status: status || undefined,
      }),
    [doctorId, departmentId, status]
  );

  return (
    <ReportShell<AppointmentReport>
      title="Appointment report"
      description={
        isDoctor
          ? 'Your appointment activity. Totals are calculated on the server.'
          : 'Appointment volume by status, doctor, and department.'
      }
      report="appointments"
      load={load}
      exportParams={{ doctorId, departmentId, status }}
      controls={
        <>
          {!isDoctor && (
            <Select
              aria-label="Filter by doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              options={doctors.map((d) => ({
                value: d._id,
                label: `Dr. ${d.firstName} ${d.lastName}`,
              }))}
              placeholder="All doctors"
            />
          )}
          <Select
            aria-label="Filter by department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            options={departments.map((d) => ({ value: d._id, label: d.name }))}
            placeholder="All departments"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </>
      }
    >
      {(report) => (
        <div className="space-y-6">
          <StatGrid
            columns={3}
            stats={[
              { label: 'Total', value: report.summary.total, hint: 'Booked in this period' },
              { label: 'Completed', value: report.summary.completed, hint: 'Visits finished' },
              { label: 'Scheduled', value: report.summary.scheduled, hint: 'Awaiting confirmation' },
              { label: 'Confirmed', value: report.summary.confirmed, hint: 'Confirmed upcoming' },
              { label: 'Cancelled', value: report.summary.cancelled, hint: 'Cancelled', alert: true },
              { label: 'No show', value: report.summary.noShow, hint: 'Patient did not attend', alert: true },
            ]}
          />

          <Card title="Appointments over time" subtitle="Bookings per bucket">
            <TimeSeriesChart
              series={[{ name: 'Appointments', points: report.series }]}
              ariaLabel="Appointments booked over the selected period"
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="By doctor" subtitle="Appointment count">
              <BarList items={report.byDoctor} ariaLabel="Appointments per doctor" />
            </Card>
            <Card title="By department" subtitle="Appointment count">
              <BarList items={report.byDepartment} ariaLabel="Appointments per department" />
            </Card>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
