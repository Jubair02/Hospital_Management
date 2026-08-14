import type { FilterQuery } from 'mongoose';
import User, { type IUser, type Role, type UserStatus } from '../models/User.js';
// Collections consulted before a delete, to prove the account has never
// authored anything. Imported for their reference fields only.
import Admission from '../models/Admission.js';
import Appointment from '../models/Appointment.js';
import BedTransfer from '../models/BedTransfer.js';
import DispensingRecord from '../models/DispensingRecord.js';
import Doctor from '../models/Doctor.js';
import Invoice from '../models/Invoice.js';
import LabResult from '../models/LabResult.js';
import LabSample from '../models/LabSample.js';
import Notification from '../models/Notification.js';
import Patient from '../models/Patient.js';
import Payment from '../models/Payment.js';
import StockTransaction from '../models/StockTransaction.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/escapeRegex.js';

interface CreateUserBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
}

type UpdateUserBody = Partial<CreateUserBody>;

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * GET /api/users?search=&role=&status=&page=&limit=
 * Admin only. Paginated list of users.
 */
export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(queryString(req.query.page) ?? '', 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(queryString(req.query.limit) ?? '', 10) || 10, 1),
    100
  );

  const filter: FilterQuery<IUser> = {};

  // The management screen lists STAFF. Patient portal logins live under
  // the patient record; they only appear here when explicitly filtered.
  const role = queryString(req.query.role);
  if (role) filter.role = role as Role;
  else filter.role = { $ne: 'patient' };

  // Accounts predating the three-state `status` field have only `isActive`,
  // so "active"/"inactive" still filter on it and suspension is checked
  // separately rather than assuming every document has been migrated.
  const status = queryString(req.query.status);
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') {
    filter.isActive = false;
    filter.status = { $ne: 'suspended' };
  }
  if (status === 'suspended') filter.status = 'suspended';

  const search = queryString(req.query.search);
  if (search) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  // The reference runs one way — a Patient points at its login, never the
  // reverse — so a list of portal accounts has no route back to the people
  // they belong to. Resolve it here for the rows that need it: one extra
  // query, only when patient rows are actually on the page, and nothing added
  // to the User document itself.
  const portalLogins = users.filter((u) => u.role === 'patient');
  const linkByUserId = new Map<string, { id: string; patientId: string }>();

  if (portalLogins.length > 0) {
    const linked = await Patient.find({ userId: { $in: portalLogins.map((u) => u._id) } })
      .select('_id patientId userId')
      .lean();

    for (const record of linked) {
      linkByUserId.set(String(record.userId), {
        id: String(record._id),
        patientId: record.patientId,
      });
    }
  }

  res.json({
    success: true,
    message: 'Users fetched',
    data: {
      users: users.map((user) => {
        const patient = linkByUserId.get(String(user._id));
        return patient ? { ...user.toJSON(), patient } : user.toJSON();
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

/**
 * POST /api/users
 * Admin only. Creates a staff account.
 */
export const createUser = asyncHandler(async (req, res) => {
  // Shape guaranteed by validateCreateUser middleware.
  const { firstName, lastName, email, password, phone, role } = req.body as CreateUserBody;

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    phone,
    role,
  });

  await req.audit({
    action: 'user_created',
    resourceType: 'user',
    resourceId: user._id,
    description: `Created ${user.role} account for ${user.email}.`,
    metadata: { role: user.role, email: user.email },
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { user },
  });
});

/**
 * GET /api/users/:id
 * Admin only.
 */
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.json({ success: true, message: 'User fetched', data: { user } });
});

/**
 * PATCH /api/users/:id
 * Admin only. Updates profile fields; password is optional and re-hashed
 * by the model's pre-save hook when provided.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const body = req.body as UpdateUserBody;
  const currentUser = req.user!; // guaranteed by authenticate middleware

  // No user may change their OWN role — this is the self-privilege-
  // escalation guard as well as protection against locking the system out
  // of its last administrator. (The route itself is admin-only, so this
  // specifically stops an admin from re-roling themselves, and would stop
  // any future role that gains user-write access from self-elevating.)
  if (user._id.equals(currentUser._id) && body.role && body.role !== user.role) {
    throw new ApiError(400, 'You cannot change your own role.');
  }

  // A portal login and its Patient record are a matched pair, so the
  // `patient` role is not a destination or an exit:
  //   staff → patient  would leave a login with no linked record (403 on
  //                    every portal page), and
  //   patient → staff  would grant staff access to an account a Patient
  //                    document still points at.
  // Either direction is done by issuing or retiring the portal account on
  // the patient record instead.
  if (body.role && body.role !== user.role && (body.role === 'patient' || user.role === 'patient')) {
    throw new ApiError(
      400,
      'A patient portal login cannot be converted to or from a staff role. Manage portal access from the patient record.'
    );
  }

  // The Patient record owns a patient's name and phone — the portal reads
  // them from there, so accepting them here would silently create two
  // different versions of the same person. Credentials (email, password)
  // and status remain editable, since those belong to the login.
  if (user.role === 'patient') {
    const demographic = (['firstName', 'lastName', 'phone'] as const).filter(
      (field) => body[field] !== undefined && body[field] !== user.get(field)
    );
    if (demographic.length > 0) {
      throw new ApiError(
        400,
        `Update ${demographic.join(', ')} on the patient's record — a portal login only holds their sign-in details.`
      );
    }
  }

  const allowed = ['firstName', 'lastName', 'email', 'phone', 'role', 'password'] as const;
  const roleChangedTo =
    body.role && body.role !== user.role ? body.role : undefined;
  const passwordChanged = body.password !== undefined;

  for (const field of allowed) {
    if (body[field] !== undefined) {
      user.set(field, body[field]);
    }
  }

  await user.save();

  // A role change is a permission change: audit it distinctly.
  if (roleChangedTo) {
    await req.audit({
      action: 'user_role_changed',
      resourceType: 'user',
      resourceId: user._id,
      description: `Role changed to ${roleChangedTo} for ${user.email}.`,
      metadata: { newRole: roleChangedTo, email: user.email },
    });
  }

  await req.audit({
    action: 'user_updated',
    resourceType: 'user',
    resourceId: user._id,
    // The new values are not recorded; only which fields changed.
    description: `Updated account ${user.email}.`,
    metadata: {
      fields: allowed.filter((field) => body[field] !== undefined).join(', '),
      passwordReset: passwordChanged,
    },
  });

  res.json({ success: true, message: 'User updated successfully', data: { user } });
});

/**
 * PATCH /api/users/:id/status
 * Admin only. Activates or deactivates an account.
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const currentUser = req.user!; // guaranteed by authenticate middleware

  if (user._id.equals(currentUser._id)) {
    throw new ApiError(400, 'You cannot change your own account status.');
  }

  // Shape guaranteed by validateStatusUpdate middleware: either the
  // original { isActive } or the richer { status }. The model keeps the
  // two representations in sync.
  const body = req.body as { isActive?: boolean; status?: UserStatus };
  if (body.status !== undefined) {
    user.status = body.status;
  } else if (body.isActive !== undefined) {
    user.isActive = body.isActive;
  }
  await user.save();

  await req.audit({
    action: 'user_status_changed',
    resourceType: 'user',
    resourceId: user._id,
    description: `Account ${user.email} set to ${user.status}.`,
    metadata: { status: user.status, email: user.email },
  });

  res.json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { user },
  });
});

/** "a doctor profile, issued invoices and recorded payments" */
const listPhrase = (items: string[]): string =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * DELETE /api/users/:id
 * Admin only. Removes a staff login outright.
 *
 * The delete is real, not a soft flag — but it is guarded. Fourteen
 * collections carry `ref: 'User'`, so erasing an account that has already
 * acted in the system would leave appointments, invoices, and lab results
 * pointing at an author who no longer exists. The checks below refuse those
 * accounts and name what blocks them, pointing the administrator at
 * deactivation instead: same loss of access, no damage to the record. What
 * stays deletable is the case this endpoint exists for — an account created
 * by mistake, or a colleague who never used the system.
 *
 * Audit entries deliberately do not block. `AuditLog` keeps an immutable
 * `actorLabel` beside its actor reference, so the trail still reads
 * correctly once the account behind it is gone.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const currentUser = req.user!; // guaranteed by authenticate middleware

  if (user._id.equals(currentUser._id)) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }

  // A portal login is one half of a matched pair with its Patient record,
  // which would be left pointing at nothing. Retiring it there keeps both
  // sides consistent — the same reasoning that blocks role changes above.
  if (user.role === 'patient') {
    throw new ApiError(
      400,
      'A patient portal login is retired from the patient record, not from this screen.'
    );
  }

  // No separate "last administrator" guard is needed: the actor is always an
  // authenticated, active admin who is not the target, so at least one
  // administrator always survives the delete above.

  const id = user._id;
  const [
    doctorProfile,
    appointments,
    patients,
    invoices,
    payments,
    labResults,
    labSamples,
    dispensing,
    stockMovements,
    admissions,
    transfers,
  ] = await Promise.all([
    Doctor.exists({ userId: id }),
    Appointment.exists({ createdBy: id }),
    Patient.exists({ createdBy: id }),
    Invoice.exists({ createdBy: id }),
    Payment.exists({ receivedBy: id }),
    LabResult.exists({ $or: [{ performedBy: id }, { verifiedBy: id }] }),
    LabSample.exists({ collectedBy: id }),
    DispensingRecord.exists({ dispensedBy: id }),
    StockTransaction.exists({ performedBy: id }),
    Admission.exists({ admittedBy: id }),
    BedTransfer.exists({ transferredBy: id }),
  ]);

  const checks: Array<[unknown, string]> = [
    [doctorProfile, 'a doctor profile'],
    [appointments, 'booked appointments'],
    [patients, 'registered patients'],
    [invoices, 'issued invoices'],
    [payments, 'recorded payments'],
    [labResults, 'laboratory results'],
    [labSamples, 'collected samples'],
    [dispensing, 'dispensing records'],
    [stockMovements, 'stock movements'],
    [admissions, 'admissions'],
    [transfers, 'bed transfers'],
  ];
  const blockers = checks.filter(([hit]) => Boolean(hit)).map(([, label]) => label);

  if (blockers.length > 0) {
    throw new ApiError(
      409,
      `${user.firstName} ${user.lastName} has ${listPhrase(blockers)} attached to this account, ` +
        'so deleting it would leave those records without an author. Deactivate the account ' +
        'instead — that revokes access immediately and keeps the history intact.'
    );
  }

  // Notifications are addressed to this person and mean nothing without
  // them, so they go with the account rather than standing in its way.
  await Notification.deleteMany({ recipientId: id });
  await user.deleteOne();

  await req.audit({
    action: 'user_deleted',
    resourceType: 'user',
    resourceId: id,
    description: `Deleted account ${user.email}.`,
    metadata: { email: user.email, role: user.role },
  });

  res.json({
    success: true,
    message: 'User deleted successfully',
    data: { id: id.toString() },
  });
});
