import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  getDepartmentById,
  updateDepartment,
  updateDepartmentStatus,
} from '../controllers/departmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateDepartment,
  validateDepartmentStatus,
} from '../middleware/validatePhase3.js';

const router = Router();

router.use(authenticate);

// All roles may LIST departments (non-admins are limited to active ones
// inside the controller); everything else is admin only.
router
  .route('/')
  .get(authorize('admin', 'doctor', 'receptionist', 'nurse'), getDepartments)
  .post(authorize('admin'), validateDepartment(false), createDepartment);

router
  .route('/:id')
  .get(authorize('admin'), getDepartmentById)
  .patch(authorize('admin'), validateDepartment(true), updateDepartment);

router.patch('/:id/status', authorize('admin'), validateDepartmentStatus, updateDepartmentStatus);

export default router;
