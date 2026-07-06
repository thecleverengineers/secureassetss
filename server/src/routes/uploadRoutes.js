import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { uploadDocument } from '../controllers/uploadController.js';

fs.mkdirSync(env.VAULT_TEMP_DIR, { recursive: true, mode: 0o700 });
const allowedExtensions = new Set(env.VAULT_ALLOWED_EXTENSIONS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.VAULT_TEMP_DIR),
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: env.VAULT_MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => allowedExtensions.has(path.extname(file.originalname).toLowerCase())
    ? callback(null, true) : callback(new Error('Unsupported file type')),
});
const router = Router();
router.post('/document', authenticate, upload.single('file'), uploadDocument);
export default router;
