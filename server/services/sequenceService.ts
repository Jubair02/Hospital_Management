import Counter from '../models/Counter.js';

/**
 * Returns the next value of a named sequence formatted as a
 * human-readable ID (e.g. PAT-000001, DOC-0001, APT-000001).
 *
 * The sequence increments with a single atomic findOneAndUpdate, so
 * concurrent callers can never receive the same number. The only race
 * is two upserts creating the counter document simultaneously on first
 * use — that surfaces as a duplicate-key error and is retried.
 */
export const nextSequenceId = async (
  sequence: string,
  prefix: string,
  width: number
): Promise<string> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: sequence },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      return `${prefix}-${String(counter.seq).padStart(width, '0')}`;
    } catch (err) {
      const isDuplicateUpsert = (err as { code?: number }).code === 11000;
      if (!isDuplicateUpsert || attempt >= 2) throw err;
    }
  }
};
