import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import generateToken from '../utils/generateToken.js';
import {
  clearFailedAttempts,
  equalizeLoginWork,
  isLocked,
  registerFailedAttempt,
} from '../services/authSecurityService.js';

interface LoginBody {
  email: string;
  password: string;
}

/** Identical wording to the IP rate limiter, so a locked account is
 * indistinguishable from a throttled client and cannot be used to probe
 * which email addresses exist. */
const THROTTLED_MESSAGE = 'Too many failed login attempts. Please try again in a few minutes.';

/**
 * POST /api/auth/login
 * Public. Returns a JWT and the authenticated user.
 *
 * Order matters: credentials are verified first, so account state (and
 * therefore account existence) is only ever revealed to someone who
 * already supplied the correct password.
 */
export const login = asyncHandler(async (req, res) => {
  // Shape guaranteed by validateLogin middleware.
  const { email, password } = req.body as LoginBody;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+password +failedLoginAttempts +lockedUntil'
  );

  if (!user) {
    // Spend the same time as a real password check (no timing oracle).
    await equalizeLoginWork(password);
    await req.audit({
      action: 'login_failed',
      resourceType: 'auth',
      description: 'Login failed: no account for the supplied email.',
      metadata: { email: normalizedEmail, reason: 'unknown_account' },
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  // Authentication runs before the authenticate middleware, so the actor
  // is supplied explicitly for these entries.
  const actor = { actorId: user._id, actorRole: user.role, actorLabel: user.email };

  if (isLocked(user)) {
    await req.audit(
      {
        action: 'login_blocked',
        resourceType: 'auth',
        resourceId: user._id,
        description: 'Login blocked: account temporarily locked after repeated failures.',
        metadata: { email: normalizedEmail, reason: 'locked' },
      },
      actor
    );
    throw new ApiError(429, THROTTLED_MESSAGE);
  }

  if (!(await user.comparePassword(password))) {
    const locked = await registerFailedAttempt(user);
    await req.audit(
      {
        action: 'login_failed',
        resourceType: 'auth',
        resourceId: user._id,
        description: locked
          ? 'Login failed: wrong password; account temporarily locked.'
          : 'Login failed: wrong password.',
        metadata: { email: normalizedEmail, reason: 'bad_password', locked },
      },
      actor
    );
    // Same message whether or not the password was close, and whether or
    // not this attempt triggered the lock.
    throw new ApiError(401, 'Invalid credentials');
  }

  if (user.status !== 'active') {
    await req.audit(
      {
        action: 'login_blocked',
        resourceType: 'auth',
        resourceId: user._id,
        description: `Login blocked: account is ${user.status}.`,
        metadata: { email: normalizedEmail, status: user.status },
      },
      actor
    );
    throw new ApiError(
      403,
      user.status === 'suspended'
        ? 'This account is suspended. Contact an administrator.'
        : 'This account has been deactivated. Contact an administrator.'
    );
  }

  await clearFailedAttempts(user);

  const token = generateToken(user);

  await req.audit(
    {
      action: 'login',
      resourceType: 'auth',
      resourceId: user._id,
      description: `${user.role} signed in.`,
      metadata: { email: user.email, role: user.role },
    },
    actor
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: { token, user },
  });
});

/**
 * GET /api/auth/me
 * Private. Returns the current authenticated user.
 */
export const getMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Current user fetched',
    data: { user: req.user },
  });
});

/**
 * PATCH /api/auth/me
 * Private. Lets a signed-in staff member correct their own name and phone
 * without going through an administrator.
 *
 * Patients are refused: their name and phone belong to the Patient record
 * their login is attached to, not to the login, and the portal edits them
 * there. Accepting them here would leave the two disagreeing about the same
 * person — the same rule `updateUser` enforces from the admin side.
 */
export const updateOwnProfile = asyncHandler(async (req, res) => {
  // Shape and field allow-list guaranteed by validateUpdateOwnProfile.
  const body = req.body as { firstName?: string; lastName?: string; phone?: string };

  const user = await User.findById(req.user!._id);
  if (!user) {
    throw new ApiError(401, 'The account for this session no longer exists.');
  }

  if (user.role === 'patient') {
    throw new ApiError(
      400,
      'Update your details on your profile page — a portal login only holds your sign-in details.'
    );
  }

  const changed: string[] = [];
  for (const field of ['firstName', 'lastName', 'phone'] as const) {
    const value = body[field];
    if (value === undefined) continue;

    const next = value.trim();
    if (next === (user.get(field) ?? '')) continue;

    user.set(field, next);
    changed.push(field);
  }

  if (changed.length > 0) {
    await user.save();

    await req.audit({
      action: 'user_updated',
      resourceType: 'user',
      resourceId: user._id,
      description: `${user.role} updated their own ${changed.join(', ')}.`,
      metadata: { fields: changed, self: true },
    });
  }

  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/**
 * POST /api/auth/change-password
 * Private — any authenticated user (staff or patient) may change their
 * OWN password after proving they know the current one. There is no
 * admin variant: nobody, including administrators, can view or set
 * another user's password through the API.
 *
 * Returns 400 (not 401) on a wrong current password: the session itself
 * is still valid, and the client treats 401 as "token dead → log out".
 */
export const changePassword = asyncHandler(async (req, res) => {
  // Shape guaranteed by validateChangePassword middleware.
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  // req.user was loaded without the password hash; re-fetch with it.
  const user = await User.findById(req.user!._id).select('+password');
  if (!user) {
    throw new ApiError(401, 'The account for this session no longer exists.');
  }

  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(400, 'The current password you entered is incorrect.');
  }

  if (await user.comparePassword(newPassword)) {
    throw new ApiError(400, 'The new password must be different from the current one.');
  }

  user.password = newPassword; // hashed by the pre-save hook
  await user.save();

  // The audit entry records THAT the password changed — never the value.
  await req.audit({
    action: 'password_changed',
    resourceType: 'auth',
    resourceId: user._id,
    description: `${user.role} changed their own password.`,
  });

  res.json({ success: true, message: 'Password changed successfully', data: null });
});

/**
 * POST /api/auth/logout
 * Private. JWTs are stateless, so the client discards the token; this
 * endpoint exists so the client has an explicit call to confirm logout
 * (and so the event lands in the audit trail).
 */
export const logout = asyncHandler(async (req, res) => {
  await req.audit({
    action: 'logout',
    resourceType: 'auth',
    resourceId: req.user!._id,
    description: `${req.user!.role} signed out.`,
  });

  res.json({ success: true, message: 'Logged out successfully', data: null });
});
