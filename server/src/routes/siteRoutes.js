import { Router } from 'express';
import multer from 'multer';
import { getPublicSite, getAppConfiguration, submitSiteEnquiry, getPublicPropertyStructure } from '../controllers/siteController.js';
import { uploadSiteAsset, uploadUserImage } from '../controllers/siteAssetController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
router.get('/config', getPublicSite);
router.get('/app-config', authenticate, getAppConfiguration);
router.post('/enquiries', submitSiteEnquiry);
router.get('/properties/:id/structure', getPublicPropertyStructure);
router.post('/admin-assets', authenticate, imageUpload.single('file'), uploadSiteAsset);
router.post('/user-assets', authenticate, imageUpload.single('file'), uploadUserImage);
export default router;
