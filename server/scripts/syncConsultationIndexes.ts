import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Consultation from '../models/Consultation.js';

/**
 * Replaces the consultation uniqueness index in place.
 *
 * `appointmentId` was unique outright, which made cancelling a consultation
 * permanent: the cancelled record kept its claim, so starting again returned
 * 409 forever and the appointment could be neither consulted nor closed. The
 * model now declares the same index restricted to live records.
 *
 * Mongoose cannot perform this swap on its own. Both indexes are named
 * `appointmentId_1`, and MongoDB refuses to redefine an existing index whose
 * options differ — it raises IndexOptionsConflict rather than updating it — so
 * an existing installation keeps the old behaviour until this runs.
 * `syncIndexes` drops what the schema no longer declares and builds what it
 * does, which is exactly the swap.
 *
 *   npm run sync:indexes
 *
 * Reads nothing and writes no documents; it only touches index metadata, and
 * is safe to run more than once.
 */
const run = async (): Promise<void> => {
  await connectDB();

  const before = await Consultation.collection.indexes();
  const previous = before.find((index) => index.name === 'appointmentId_1');
  console.log(
    'Existing appointmentId index:',
    previous ? JSON.stringify({ unique: previous.unique, partial: previous.partialFilterExpression }) : 'none'
  );

  const dropped = await Consultation.syncIndexes();
  console.log(dropped.length ? `Dropped: ${dropped.join(', ')}` : 'Nothing needed dropping.');

  const after = await Consultation.collection.indexes();
  const current = after.find((index) => index.name === 'appointmentId_1');
  console.log(
    'Now:',
    current ? JSON.stringify({ unique: current.unique, partial: current.partialFilterExpression }) : 'missing'
  );

  if (!current?.partialFilterExpression) {
    throw new Error(
      'The partial index was not created. Check for duplicate live consultations on one appointment.'
    );
  }
  console.log('Consultation indexes are in sync.');
};

run()
  .catch((error: unknown) => {
    console.error('Index sync failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
