import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { ROLES, type Role } from './User.js';

export const AUDIT_ACTIONS = [
  // Authentication
  'login',
  'logout',
  'login_failed',
  'login_blocked',
  'password_changed',
  // Users & permissions
  'user_created',
  'user_updated',
  'user_role_changed',
  'user_status_changed',
  'user_deleted',
  // Clinical & operational
  'patient_created',
  'patient_updated',
  'patient_status_changed',
  'appointment_created',
  'appointment_updated',
  'appointment_status_changed',
  'consultation_started',
  'consultation_updated',
  'consultation_completed',
  'prescription_created',
  'medicine_dispensed',
  'stock_received',
  'stock_adjusted',
  'lab_order_created',
  'lab_sample_collected',
  'lab_sample_rejected',
  'lab_result_entered',
  'lab_result_verified',
  // Financial
  'invoice_created',
  'invoice_issued',
  'invoice_cancelled',
  'payment_recorded',
  'refund_recorded',
  // Inpatient
  'patient_admitted',
  'bed_transferred',
  'patient_discharged',
  // Administration
  'settings_updated',
  'department_created',
  'department_updated',
  'doctor_created',
  'doctor_updated',
  // Patient portal
  'portal_account_created',
  'portal_profile_updated',
  'portal_appointment_booked',
  'portal_appointment_cancelled',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_RESOURCE_TYPES = [
  'auth',
  'user',
  'patient',
  'appointment',
  'consultation',
  'prescription',
  'medicine',
  'inventory',
  'lab_order',
  'lab_sample',
  'lab_result',
  'invoice',
  'payment',
  'admission',
  'settings',
  'department',
  'doctor',
] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

/**
 * Append-only trail of security- and business-significant actions.
 *
 * Deliberately excluded from metadata: passwords, password hashes,
 * tokens, payment credentials, and clinical free text. Entries record
 * WHO did WHAT to WHICH record — not the contents of the record.
 */
export interface IAuditLog {
  auditId: string;
  /** Absent for pre-authentication events such as a failed login. */
  actorId?: Types.ObjectId;
  actorRole?: Role;
  /** Email attempted at login, kept for investigating failures. */
  actorLabel?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: Types.ObjectId;
  /** Human-readable summary shown in the audit dashboard. */
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog>(
  {
    auditId: { type: String, required: true, unique: true, immutable: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    actorRole: {
      type: String,
      immutable: true,
      enum: {
        values: ROLES as unknown as string[],
        message: `Actor role must be one of: ${ROLES.join(', ')}`,
      },
    },
    actorLabel: { type: String, trim: true, maxlength: 200, immutable: true },
    action: {
      type: String,
      required: true,
      immutable: true,
      enum: {
        values: AUDIT_ACTIONS as unknown as string[],
        message: 'Unknown audit action',
      },
    },
    resourceType: {
      type: String,
      required: true,
      immutable: true,
      enum: {
        values: AUDIT_RESOURCE_TYPES as unknown as string[],
        message: 'Unknown audit resource type',
      },
    },
    resourceId: { type: Schema.Types.ObjectId, immutable: true },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      immutable: true,
    },
    metadata: { type: Schema.Types.Mixed, immutable: true },
    ipAddress: { type: String, trim: true, maxlength: 64, immutable: true },
    userAgent: { type: String, trim: true, maxlength: 300, immutable: true },
    requestId: { type: String, trim: true, maxlength: 64, immutable: true },
  },
  {
    timestamps: true,
    // Entries are never edited or deleted through the application.
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// The dashboard reads newest-first, filtered by actor, action, or resource.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

const AuditLog: Model<IAuditLog> = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
