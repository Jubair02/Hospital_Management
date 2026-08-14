import { Router } from 'express';
import { login, getMe, logout, changePassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validateLogin, validateChangePassword } from '../middleware/validate.js';

const router = Router();

router.post('/login', validateLogin, login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
// Own password only; proving the current password is part of the handler.
router.post('/change-password', authenticate, validateChangePassword, changePassword);

export default router;
