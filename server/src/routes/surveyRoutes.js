import { Router } from 'express';
import { authenticate, authorizeSurveyorMode } from '../middleware/auth.js';
import { syncSurveys } from '../controllers/surveySyncController.js';
const router = Router();
router.post('/sync', authenticate, authorizeSurveyorMode, syncSurveys);
export default router;
