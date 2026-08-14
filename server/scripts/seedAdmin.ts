import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

/**
 * Creates the first admin account from environment variables.
 * Usage:
 *   npm run seed:admin             — create if missing (idempotent)
 *   npm run seed:admin -- --reset  — also reset the password of an
 *                                    existing admin to ADMIN_PASSWORD
 *
 * Required env vars: ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL,
 * ADMIN_PASSWORD (min 8 chars).
 */
const seedAdmin = async (): Promise<void> => {
  const {
    ADMIN_FIRST_NAME: firstName,
    ADMIN_LAST_NAME: lastName,
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD: password,
  } = process.env;

  const missing = [
    ['ADMIN_FIRST_NAME', firstName],
    ['ADMIN_LAST_NAME', lastName],
    ['ADMIN_EMAIL', email],
    ['ADMIN_PASSWORD', password],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    console.error('Add them to server/.env and run "npm run seed:admin" again.');
    process.exit(1);
  }

  if (password!.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  try {
    await connectDB();

    const reset = process.argv.includes('--reset');
    const existing = await User.findOne({ email: email!.toLowerCase() });

    if (existing && reset) {
      existing.password = password!; // re-hashed by the pre-save hook
      existing.isActive = true;
      await existing.save();
      console.log(`Admin password reset from .env: ${existing.email}`);
    } else if (existing) {
      console.log(
        `Admin account already exists: ${existing.email} — nothing to do. ` +
          '(Use "npm run seed:admin -- --reset" to reset its password from .env)'
      );
    } else {
      const admin = await User.create({
        firstName: firstName!,
        lastName: lastName!,
        email: email!,
        password: password!, // hashed by the User model's pre-save hook
        role: 'admin',
      });
      console.log(`Admin account created: ${admin.email}`);
    }
  } catch (err) {
    console.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seedAdmin();
