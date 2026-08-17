import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = [
  'admin',
  'doctor',
  'receptionist',
  'nurse',
  'pharmacist',
  'lab_technician',
  'patient',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles that staff-account management may create or assign. `patient`
 * accounts exist only through the portal-account flow, which links the
 * User to a Patient record — an unlinked patient login would be useless
 * and an admin must not be able to turn a staff member into a patient.
 */
export const STAFF_ROLES = [
  'admin',
  'doctor',
  'receptionist',
  'nurse',
  'pharmacist',
  'lab_technician',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  /**
   * The wards a nurse is responsible for.
   *
   * Nothing linked a nurse to anywhere in the hospital, so every list they
   * opened was hospital-wide and "my patients" could not be expressed. An
   * empty array keeps exactly that behaviour — an unassigned nurse still sees
   * everything, so assigning wards is an opt-in narrowing rather than a
   * migration that hides records from people who had them yesterday.
   *
   * Only meaningful for nurses; other roles are scoped by their own rules.
   */
  assignedWards: Types.ObjectId[];
  /**
   * Account state. `isActive` is kept in sync with it (see the pre-save
   * hook) so all pre-existing code and APIs keep working; only `active`
   * accounts may authenticate.
   */
  status: UserStatus;
  isActive: boolean;
  /** Consecutive failed logins; cleared on a successful login. */
  failedLoginAttempts: number;
  /** Set when the failure threshold is hit; a short, temporary lock. */
  lockedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  /** Requires the document to have been queried with .select('+password'). */
  comparePassword(candidate: string): Promise<boolean>;
}

export interface IUserVirtuals {
  fullName: string;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods & IUserVirtuals>;

type UserModel = Model<IUser, Record<string, never>, IUserMethods, IUserVirtuals>;

const userSchema = new Schema<IUser, UserModel, IUserMethods, Record<string, never>, IUserVirtuals>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ROLES as unknown as string[],
        message: `Role must be one of: ${ROLES.join(', ')}`,
      },
    },
    assignedWards: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Ward' }],
      default: [],
    },
    status: {
      type: String,
      default: 'active',
      enum: {
        values: USER_STATUSES as unknown as string[],
        message: `Status must be one of: ${USER_STATUSES.join(', ')}`,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        // Credentials and security counters never leave the server.
        delete ret.password;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Admin user listings filter by role and status.
userSchema.index({ role: 1, status: 1 });

userSchema.virtual('fullName').get(function (this: UserDocument) {
  return `${this.firstName} ${this.lastName}`;
});

// 12 rounds in production; tests lower this via env to keep the suite fast.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '', 10) || 12;

/**
 * Keeps `status` and the original `isActive` flag consistent in both
 * directions, so code written against either field behaves identically.
 */
userSchema.pre('save', function () {
  if (this.isModified('status')) {
    this.isActive = this.status === 'active';
  } else if (this.isModified('isActive')) {
    this.status = this.isActive ? 'active' : 'inactive';
  }
});

// Hash the password whenever it is created or changed.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (this: UserDocument, candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model<IUser, UserModel>('User', userSchema);

export default User;
