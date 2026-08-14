import { Router } from 'express';
import {
  getUsers,
  createUser,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
} from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateCreateUser,
  validateUpdateUser,
  validateStatusUpdate,
} from '../middleware/validate.js';

const router = Router();

// All user-management routes are admin only.
router.use(authenticate, authorize('admin'));

router.route('/').get(getUsers).post(validateCreateUser, createUser);
router.route('/:id').get(getUserById).patch(validateUpdateUser, updateUser).delete(deleteUser);
router.patch('/:id/status', validateStatusUpdate, updateUserStatus);

export default router;
