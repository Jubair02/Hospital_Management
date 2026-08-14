import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  patchMarkRead,
  patchMarkAllRead,
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Every authenticated user has an inbox; ownership is enforced inside
// the controller by always filtering on the calling user's id, so no
// role gate is needed (and none would help).
router.use(authenticate);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', patchMarkAllRead);
router.patch('/:id/read', patchMarkRead);

export default router;
