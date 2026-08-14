import mongoose, { Schema } from 'mongoose';

/**
 * Named atomic sequences (e.g. the patient ID counter). One document
 * per sequence; increments happen in a single findOneAndUpdate so
 * concurrent creations can never observe the same value.
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model<ICounter>('Counter', counterSchema);

export default Counter;
