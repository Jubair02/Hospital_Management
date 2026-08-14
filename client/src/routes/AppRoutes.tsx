import { Navigate, Route, Routes } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { DASHBOARD_PATHS, ROLES } from '../utils/constants';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import DashboardLayout from '../layouts/DashboardLayout';
import FullPageSpinner from '../components/ui/FullPageSpinner';

import LoginPage from '../pages/LoginPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import UsersPage from '../pages/admin/UsersPage';
import AdminPanelPage from '../pages/admin/AdminPanelPage';
import AuditLogsPage from '../pages/admin/AuditLogsPage';
import SystemSettingsPage from '../pages/admin/SystemSettingsPage';
import SystemHealthPage from '../pages/admin/SystemHealthPage';
import DoctorDashboard from '../pages/doctor/DoctorDashboard';
import ReceptionistDashboard from '../pages/receptionist/ReceptionistDashboard';
import NurseDashboard from '../pages/nurse/NurseDashboard';
import PatientsListPage from '../pages/patients/PatientsListPage';
import PatientCreatePage from '../pages/patients/PatientCreatePage';
import PatientProfilePage from '../pages/patients/PatientProfilePage';
import PatientEditPage from '../pages/patients/PatientEditPage';
import DoctorsListPage from '../pages/doctors/DoctorsListPage';
import DoctorCreatePage from '../pages/doctors/DoctorCreatePage';
import DoctorProfilePage from '../pages/doctors/DoctorProfilePage';
import DoctorEditPage from '../pages/doctors/DoctorEditPage';
import DepartmentsPage from '../pages/admin/DepartmentsPage';
import DoctorAvailabilityPage from '../pages/doctor/DoctorAvailabilityPage';
import AppointmentsListPage from '../pages/appointments/AppointmentsListPage';
import AppointmentCreatePage from '../pages/appointments/AppointmentCreatePage';
import AppointmentDetailsPage from '../pages/appointments/AppointmentDetailsPage';
import ConsultationWorkbenchPage from '../pages/consultations/ConsultationWorkbenchPage';
import DoctorConsultationsPage from '../pages/consultations/DoctorConsultationsPage';
import ConsultationDetailsPage from '../pages/consultations/ConsultationDetailsPage';
import PharmacistDashboard from '../pages/pharmacy/PharmacistDashboard';
import MedicinesPage from '../pages/pharmacy/MedicinesPage';
import CategoriesPage from '../pages/pharmacy/CategoriesPage';
import InventoryPage from '../pages/pharmacy/InventoryPage';
import TransactionsPage from '../pages/pharmacy/TransactionsPage';
import PharmacyPrescriptionsPage from '../pages/pharmacy/PharmacyPrescriptionsPage';
import PharmacyPrescriptionDetailPage from '../pages/pharmacy/PharmacyPrescriptionDetailPage';
import DispensingHistoryPage from '../pages/pharmacy/DispensingHistoryPage';
import LaboratoryDashboardPage from '../pages/laboratory/LaboratoryDashboardPage';
import LabTestsPage from '../pages/laboratory/LabTestsPage';
import LabOrdersPage from '../pages/laboratory/LabOrdersPage';
import LabOrderDetailsPage from '../pages/laboratory/LabOrderDetailsPage';
import LabSamplesPage from '../pages/laboratory/LabSamplesPage';
import LabResultsPage from '../pages/laboratory/LabResultsPage';
import BillingDashboardPage from '../pages/billing/BillingDashboardPage';
import InvoicesPage from '../pages/billing/InvoicesPage';
import InvoiceCreatePage from '../pages/billing/InvoiceCreatePage';
import InvoiceDetailsPage from '../pages/billing/InvoiceDetailsPage';
import PaymentsPage from '../pages/billing/PaymentsPage';
import InpatientDashboardPage from '../pages/inpatient/InpatientDashboardPage';
import WardsPage from '../pages/inpatient/WardsPage';
import WardDetailsPage from '../pages/inpatient/WardDetailsPage';
import BedsPage from '../pages/inpatient/BedsPage';
import AdmissionsPage from '../pages/inpatient/AdmissionsPage';
import AdmissionCreatePage from '../pages/inpatient/AdmissionCreatePage';
import AdmissionDetailsPage from '../pages/inpatient/AdmissionDetailsPage';
import AnalyticsDashboardPage from '../pages/analytics/AnalyticsDashboardPage';
import AppointmentsReportPage from '../pages/reports/AppointmentsReportPage';
import PatientsReportPage from '../pages/reports/PatientsReportPage';
import ClinicalReportPage from '../pages/reports/ClinicalReportPage';
import PharmacyReportPage from '../pages/reports/PharmacyReportPage';
import LaboratoryReportPage from '../pages/reports/LaboratoryReportPage';
import BillingReportPage from '../pages/reports/BillingReportPage';
import InpatientReportPage from '../pages/reports/InpatientReportPage';
import NotificationsPage from '../pages/notifications/NotificationsPage';
import PortalDashboardPage from '../pages/portal/PortalDashboardPage';
import PortalProfilePage from '../pages/portal/PortalProfilePage';
import PortalAppointmentsPage from '../pages/portal/PortalAppointmentsPage';
import PortalBookAppointmentPage from '../pages/portal/PortalBookAppointmentPage';
import PortalAppointmentDetailsPage from '../pages/portal/PortalAppointmentDetailsPage';
import PortalMedicalRecordsPage from '../pages/portal/PortalMedicalRecordsPage';
import PortalPrescriptionsPage from '../pages/portal/PortalPrescriptionsPage';
import PortalLaboratoryPage from '../pages/portal/PortalLaboratoryPage';
import PortalMedicationsPage from '../pages/portal/PortalMedicationsPage';
import PortalBillingPage from '../pages/portal/PortalBillingPage';
import PortalInvoiceDetailsPage from '../pages/portal/PortalInvoiceDetailsPage';
import PortalAdmissionPage from '../pages/portal/PortalAdmissionPage';
import UnauthorizedPage from '../pages/UnauthorizedPage';
import NotFoundPage from '../pages/NotFoundPage';

/** Sends "/" to the right place for the current session. */
function HomeRedirect() {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Loading" />;
  if (!isAuthenticated || !role) return <Navigate to="/login" replace />;

  return <Navigate to={DASHBOARD_PATHS[role]} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Everything below requires authentication */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* Admin */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN]} />}>
            <Route path="/admin" element={<AdminPanelPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="/admin/settings" element={<SystemSettingsPage />} />
            <Route path="/admin/system-health" element={<SystemHealthPage />} />
            <Route path="/admin/patients" element={<PatientsListPage />} />
            <Route path="/admin/patients/new" element={<PatientCreatePage />} />
            <Route path="/admin/doctors" element={<DoctorsListPage />} />
            <Route path="/admin/doctors/new" element={<DoctorCreatePage />} />
            <Route path="/admin/doctors/:id" element={<DoctorProfilePage />} />
            <Route path="/admin/doctors/:id/edit" element={<DoctorEditPage />} />
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/appointments" element={<AppointmentsListPage />} />
            <Route path="/admin/appointments/new" element={<AppointmentCreatePage />} />
          </Route>

          {/* Doctor */}
          <Route element={<RoleRoute allow={[ROLES.DOCTOR]} />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
            <Route path="/doctor/patients" element={<PatientsListPage />} />
            <Route path="/doctor/appointments" element={<AppointmentsListPage />} />
            <Route path="/doctor/availability" element={<DoctorAvailabilityPage />} />
            <Route
              path="/doctor/appointments/:appointmentId/consultation"
              element={<ConsultationWorkbenchPage />}
            />
            <Route path="/doctor/consultations" element={<DoctorConsultationsPage />} />
          </Route>

          {/* Receptionist */}
          <Route element={<RoleRoute allow={[ROLES.RECEPTIONIST]} />}>
            <Route path="/receptionist/dashboard" element={<ReceptionistDashboard />} />
            <Route path="/receptionist/patients" element={<PatientsListPage />} />
            <Route path="/receptionist/patients/new" element={<PatientCreatePage />} />
            <Route path="/receptionist/doctors" element={<DoctorsListPage />} />
            <Route path="/receptionist/appointments" element={<AppointmentsListPage />} />
            <Route path="/receptionist/appointments/new" element={<AppointmentCreatePage />} />
          </Route>

          {/* Nurse */}
          <Route element={<RoleRoute allow={[ROLES.NURSE]} />}>
            <Route path="/nurse/dashboard" element={<NurseDashboard />} />
            <Route path="/nurse/patients" element={<PatientsListPage />} />
            <Route path="/nurse/appointments" element={<AppointmentsListPage />} />
          </Route>

          {/* Appointment details — all staff roles (doctor scoping is server-side) */}
          <Route
            element={
              <RoleRoute
                allow={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.NURSE]}
              />
            }
          >
            <Route path="/appointments/:id" element={<AppointmentDetailsPage />} />
          </Route>

          {/* Clinical records — receptionists have no clinical access */}
          <Route
            element={<RoleRoute allow={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE]} />}
          >
            <Route path="/consultations/:id" element={<ConsultationDetailsPage />} />
          </Route>

          {/* Pharmacist dashboard */}
          <Route element={<RoleRoute allow={[ROLES.PHARMACIST]} />}>
            <Route path="/pharmacist/dashboard" element={<PharmacistDashboard />} />
          </Route>

          {/* Pharmacy module — admin + pharmacist */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.PHARMACIST]} />}>
            <Route path="/pharmacy/medicines" element={<MedicinesPage />} />
            <Route path="/pharmacy/categories" element={<CategoriesPage />} />
            <Route path="/pharmacy/inventory" element={<InventoryPage />} />
            <Route path="/pharmacy/transactions" element={<TransactionsPage />} />
            <Route path="/pharmacy/prescriptions" element={<PharmacyPrescriptionsPage />} />
            <Route path="/pharmacy/prescriptions/:id" element={<PharmacyPrescriptionDetailPage />} />
            <Route path="/pharmacy/dispensing" element={<DispensingHistoryPage />} />
          </Route>

          {/* Laboratory module — admin + lab technician */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.LAB_TECHNICIAN]} />}>
            <Route path="/laboratory" element={<LaboratoryDashboardPage />} />
            <Route path="/laboratory/samples" element={<LabSamplesPage />} />
          </Route>

          {/* Lab catalog — doctors may browse it too */}
          <Route
            element={<RoleRoute allow={[ROLES.ADMIN, ROLES.LAB_TECHNICIAN, ROLES.DOCTOR]} />}
          >
            <Route path="/laboratory/tests" element={<LabTestsPage />} />
          </Route>

          {/* Lab orders & results — clinical visibility (server scopes further) */}
          <Route
            element={
              <RoleRoute
                allow={[ROLES.ADMIN, ROLES.LAB_TECHNICIAN, ROLES.DOCTOR, ROLES.NURSE]}
              />
            }
          >
            <Route path="/laboratory/orders" element={<LabOrdersPage />} />
            <Route path="/laboratory/orders/:id" element={<LabOrderDetailsPage />} />
            <Route path="/laboratory/results" element={<LabResultsPage />} />
          </Route>

          {/* Billing — admin + receptionist manage; invoice detail also
              readable by doctor/nurse (server enforces read-only) */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST]} />}>
            <Route path="/billing" element={<BillingDashboardPage />} />
            <Route path="/billing/invoices" element={<InvoicesPage />} />
            <Route path="/billing/invoices/new" element={<InvoiceCreatePage />} />
            <Route path="/billing/payments" element={<PaymentsPage />} />
          </Route>
          <Route
            element={
              <RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.DOCTOR, ROLES.NURSE]} />
            }
          >
            <Route path="/billing/invoices/:id" element={<InvoiceDetailsPage />} />
          </Route>

          {/* Inpatient — admissions ops for admin/receptionist; viewing for
              clinical roles (doctors are scoped server-side) */}
          <Route
            element={
              <RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE]} />
            }
          >
            <Route path="/inpatient" element={<InpatientDashboardPage />} />
          </Route>
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST]} />}>
            <Route path="/inpatient/admissions/new" element={<AdmissionCreatePage />} />
          </Route>
          <Route
            element={
              <RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.DOCTOR, ROLES.NURSE]} />
            }
          >
            <Route path="/inpatient/wards" element={<WardsPage />} />
            <Route path="/inpatient/wards/:id" element={<WardDetailsPage />} />
            <Route path="/inpatient/beds" element={<BedsPage />} />
            <Route path="/inpatient/admissions" element={<AdmissionsPage />} />
            <Route path="/inpatient/admissions/:id" element={<AdmissionDetailsPage />} />
          </Route>

          {/* Notifications — every authenticated user has an inbox */}
          <Route path="/notifications" element={<NotificationsPage />} />

          {/* Patient portal — self-service pages, patient role only */}
          <Route element={<RoleRoute allow={[ROLES.PATIENT]} />}>
            <Route path="/patient" element={<PortalDashboardPage />} />
            <Route path="/patient/profile" element={<PortalProfilePage />} />
            <Route path="/patient/appointments" element={<PortalAppointmentsPage />} />
            <Route path="/patient/appointments/new" element={<PortalBookAppointmentPage />} />
            <Route path="/patient/appointments/:id" element={<PortalAppointmentDetailsPage />} />
            <Route path="/patient/medical-records" element={<PortalMedicalRecordsPage />} />
            <Route path="/patient/prescriptions" element={<PortalPrescriptionsPage />} />
            <Route path="/patient/laboratory" element={<PortalLaboratoryPage />} />
            <Route path="/patient/medications" element={<PortalMedicationsPage />} />
            <Route path="/patient/billing" element={<PortalBillingPage />} />
            <Route path="/patient/billing/:id" element={<PortalInvoiceDetailsPage />} />
            <Route path="/patient/admission" element={<PortalAdmissionPage />} />
            <Route path="/patient/notifications" element={<NotificationsPage />} />
          </Route>

          {/* Analytics & reports — each report mirrors its module's roles */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN]} />}>
            <Route path="/analytics" element={<AnalyticsDashboardPage />} />
          </Route>
          <Route
            element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.DOCTOR]} />}
          >
            <Route path="/reports/appointments" element={<AppointmentsReportPage />} />
          </Route>
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST]} />}>
            <Route path="/reports/patients" element={<PatientsReportPage />} />
            <Route path="/reports/billing" element={<BillingReportPage />} />
          </Route>
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.DOCTOR]} />}>
            <Route path="/reports/clinical" element={<ClinicalReportPage />} />
          </Route>
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.PHARMACIST]} />}>
            <Route path="/reports/pharmacy" element={<PharmacyReportPage />} />
          </Route>
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.LAB_TECHNICIAN]} />}>
            <Route path="/reports/laboratory" element={<LaboratoryReportPage />} />
          </Route>
          <Route
            element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.NURSE]} />}
          >
            <Route path="/reports/inpatient" element={<InpatientReportPage />} />
          </Route>

          {/* Patient profile — all staff roles */}
          <Route
            element={
              <RoleRoute
                allow={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.NURSE]}
              />
            }
          >
            <Route path="/patients/:id" element={<PatientProfilePage />} />
          </Route>

          {/* Patient edit — admin + receptionist only */}
          <Route element={<RoleRoute allow={[ROLES.ADMIN, ROLES.RECEPTIONIST]} />}>
            <Route path="/patients/:id/edit" element={<PatientEditPage />} />
          </Route>

          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
