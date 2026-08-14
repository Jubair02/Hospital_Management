import { Router } from 'express';
import { getOverview } from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// The hospital-wide operational view is an administrator tool; each role
// gets its own domain report instead (see reportsRoutes).
router.get('/overview', authorize('admin'), getOverview);

export default router;
