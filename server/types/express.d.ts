import type { UserDocument } from '../models/User.js';
import type { PatientDocument } from '../models/Patient.js';
import type { AuditActor, AuditEntry } from '../services/auditService.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware after verifying the JWT. */
      user?: UserDocument;
      /**
       * Set by loadPatientProfile on portal routes: the Patient record
       * owned by the authenticated user. Portal handlers must scope
       * every query to req.patient._id.
       */
      patient?: PatientDocument;
      /**
       * Records an audit entry for this request (actor, IP, user agent,
       * and request id are filled in automatically). Never throws.
       * Pass `actorOverride` for authentication events, where the acting
       * user is known before `req.user` exists.
       */
      audit: (entry: AuditEntry, actorOverride?: Partial<AuditActor>) => Promise<void>;
    }
  }
}

export {};
