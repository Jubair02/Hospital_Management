import { Router } from 'express';
import { login, getMe, logout, changePassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { createPasswordChangeLimiter } from '../middleware/rateLimiter.js';
import { validateLogin, validateChangePassword } from '../middleware/validate.js';

const router = Router();

router.post('/login', validateLogin, login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
// Own password only; proving the current password is part of the handler.
// The limiter sits after `authenticate` on purpose: it keys on the signed-in
// user, so one person fumbling their old password cannot lock out everyone
// else sharing the hospital's outbound address.
router.post(
  '/change-password',
  authenticate,
  createPasswordChangeLimiter(),
  validateChangePassword,
  changePassword
);

export default router;
