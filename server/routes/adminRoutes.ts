import { Router } from 'express';
import {
  getAuditLogs,
  getAuditVocabulary,
  getSystemSettings,
  patchSystemSettings,
  getSystemHealth,
} from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateSettings } from '../middleware/validateAdmin.js';

const router = Router();

router.use(authenticate);

// Settings are READ by every signed-in user (the app renders the hospital
// name, currency, and appointment slot length from them) but only an
// administrator may change them.
router.get('/settings', getSystemSettings);
router.patch('/settings', authorize('admin'), validateSettings, patchSystemSettings);

// Everything else in the administration area is admin-only. The audit
// trail is read-only: no route creates, edits, or deletes entries.
router.get('/audit-logs', authorize('admin'), getAuditLogs);
router.get('/audit-logs/vocabulary', authorize('admin'), getAuditVocabulary);
router.get('/system-health', authorize('admin'), getSystemHealth);

export default router;
