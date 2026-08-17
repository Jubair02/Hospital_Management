import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * `progress` is what happened; `handover` is what the next shift needs to
 * know. Separating them means the person coming on duty can read the handover
 * alone without scrolling a day of routine entries.
 */
export const NOTE_CATEGORIES = ['progress', 'handover'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const NURSING_SHIFTS = ['day', 'evening', 'night'] as const;
export type NursingShift = (typeof NURSING_SHIFTS)[number];

/**
 * A nurse's written record of a patient's stay.
 *
 * `Admission.notes` was a single string set once at admission, and
 * consultations are doctor-write-only, so continuity between shifts had
 * nowhere to live in the system and happened on paper or not at all.
 *
 * Append-only, like observations: a note is an account of a moment, and the
 * sequence is what makes a stay readable. Corrections are new notes.
 */
export interface INursingNote {
  noteId: string;
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId;
  authorId: Types.ObjectId;
  category: NoteCategory;
  shift?: NursingShift;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NursingNoteDocument = HydratedDocument<INursingNote>;

const nursingNoteSchema = new Schema<INursingNote>(
  {
    noteId: { type: String, required: true, unique: true, immutable: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient is required'],
      immutable: true,
      index: true,
    },
    admissionId: {
      type: Schema.Types.ObjectId,
      ref: 'Admission',
      immutable: true,
      index: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    category: {
      type: String,
      required: true,
      default: 'progress',
      enum: {
        values: NOTE_CATEGORIES as unknown as string[],
        message: `Category must be one of: ${NOTE_CATEGORIES.join(', ')}`,
      },
      index: true,
    },
    shift: {
      type: String,
      enum: {
        values: NURSING_SHIFTS as unknown as string[],
        message: `Shift must be one of: ${NURSING_SHIFTS.join(', ')}`,
      },
    },
    body: {
      type: String,
      required: [true, 'The note cannot be empty'],
      trim: true,
      maxlength: [5000, 'A note cannot exceed 5000 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** The stay as a narrative: one patient, newest first. */
nursingNoteSchema.index({ patientId: 1, createdAt: -1 });

const NursingNote: Model<INursingNote> = mongoose.model<INursingNote>(
  'NursingNote',
  nursingNoteSchema
);

export default NursingNote;
