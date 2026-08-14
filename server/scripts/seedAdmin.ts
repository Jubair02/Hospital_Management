import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import LabCategory from '../models/LabCategory.js';
import User from '../models/User.js';
import { nextLabCategoryId } from '../services/laboratoryService.js';

/**
 * Reference data every laboratory needs before its catalog can be built.
 *
 * A lab test cannot be created without a category, so an install with none
 * leaves the "Add test" form with an empty required dropdown and no way
 * forward from that screen. These are the standard bench divisions; an
 * administrator can rename, extend, or retire them afterwards.
 */
const LAB_CATEGORIES: { name: string; description: string }[] = [
  { name: 'Hematology', description: 'Blood counts, coagulation, and cell morphology.' },
  {
    name: 'Clinical chemistry',
    description: 'Metabolic panels, enzymes, lipids, and electrolytes.',
  },
  {
    name: 'Microbiology',
    description: 'Cultures, sensitivities, and organism identification.',
  },
  {
    name: 'Immunology and serology',
    description: 'Antibody, antigen, and infectious disease screens.',
  },
  { name: 'Urinalysis', description: 'Routine and microscopic examination of urine.' },
  { name: 'Histopathology', description: 'Tissue specimens and cytology.' },
];

/**
 * Seeds a category only when nothing of that name is already on file, so the
 * script stays safe to re-run and never overwrites an edited description.
 */
const seedLabCategories = async (): Promise<void> => {
  const created: string[] = [];

  for (const { name, description } of LAB_CATEGORIES) {
    const exists = await LabCategory.findOne({ name });
    if (exists) continue;

    await LabCategory.create({ categoryId: await nextLabCategoryId(), name, description });
    created.push(name);
  }

  if (created.length === 0) {
    console.log('Lab categories already present — nothing to do.');
  } else {
    console.log(`Lab categories created: ${created.join(', ')}`);
  }
};

/**
 * Bootstraps a fresh installation: the first admin account from environment
 * variables, plus the reference data the app cannot function without.
 *
 * Usage:
 *   npm run seed:admin             — create what is missing (idempotent)
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

    await seedLabCategories();
  } catch (err) {
    console.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seedAdmin();
