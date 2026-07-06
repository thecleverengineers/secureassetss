import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { overview } from '../controllers/dashboardController.js';
const router = Router();
router.get('/overview', authenticate, overview);
export default router;
