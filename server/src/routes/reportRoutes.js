import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { exportCsv, exportPdf, exportXlsx, reportCatalog } from '../controllers/reportController.js';
const router = Router();
router.get('/catalog', authenticate, reportCatalog);
router.get('/:resource.csv', authenticate, exportCsv);
router.get('/:resource.xlsx', authenticate, exportXlsx);
router.get('/:resource.pdf', authenticate, exportPdf);
export default router;
