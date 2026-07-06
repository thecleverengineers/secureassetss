import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  register, verifyRegistration, resendRegistrationOtp, login, completeTwoFactorLogin, refresh, logout, me, updateMe, changePassword,
  sendOtp, verifyOtp, forgotPassword, resetPassword, getSecurityOverview, beginTwoFactorSetup,
  enableTwoFactor, disableTwoFactor, regenerateBackupCodes, revokeSession, revokeOtherSessions,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadProfileAvatar } from '../controllers/siteAssetController.js';

const router = Router();
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const standardLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
const otpRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });

router.post('/register', otpRequestLimiter, register);
router.post('/register/verify', otpVerifyLimiter, verifyRegistration);
router.post('/register/resend-otp', otpRequestLimiter, resendRegistrationOtp);
router.post('/login', credentialLimiter, login);
router.post('/two-factor/challenge', otpVerifyLimiter, completeTwoFactorLogin);
router.post('/refresh', credentialLimiter, refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);
router.patch('/me', authenticate, standardLimiter, updateMe);
router.post('/me/avatar', authenticate, standardLimiter, avatarUpload.single('file'), uploadProfileAvatar);
router.post('/change-password', authenticate, credentialLimiter, changePassword);
router.post('/send-otp', otpRequestLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/forgot-password', otpRequestLimiter, forgotPassword);
router.post('/reset-password', credentialLimiter, resetPassword);
router.get('/security', authenticate, getSecurityOverview);
router.post('/two-factor/setup', authenticate, credentialLimiter, beginTwoFactorSetup);
router.post('/two-factor/enable', authenticate, credentialLimiter, enableTwoFactor);
router.post('/two-factor/disable', authenticate, credentialLimiter, disableTwoFactor);
router.post('/two-factor/backup-codes', authenticate, credentialLimiter, regenerateBackupCodes);
router.delete('/sessions/:sessionId', authenticate, standardLimiter, revokeSession);
router.post('/sessions/revoke-others', authenticate, credentialLimiter, revokeOtherSessions);
export default router;
