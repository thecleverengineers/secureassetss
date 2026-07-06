import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileTypeFromFile } from 'file-type';
import { Document, DriveFile, DriveFileVersion } from '../models/index.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  assertStorageAvailable, categoryFromMime, changeUsage, fileExtension, getDrivePolicy, logDriveActivity,
} from '../services/driveService.js';
import { buildStorageKey, saveFile } from '../services/storage.js';

const execFileAsync = promisify(execFile);

async function removeQuietly(filePath) { try { await fsp.unlink(filePath); } catch {} }
async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
function safeName(value = '') { return String(value).replace(/[\\/:*?"<>|\0]/g, '_').trim().slice(0, 255) || 'Untitled'; }

async function scanUpload(file) {
  const extension = fileExtension(file.originalname);
  const policy = await getDrivePolicy();
  const allowed = new Set((policy.allowedExtensions?.length ? policy.allowedExtensions : env.VAULT_ALLOWED_EXTENSIONS.split(','))
    .map((value) => String(value).trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(extension)) throw new ApiError(415, `Files with ${extension || 'no extension'} are not allowed`);
  const maxBytes = Number(policy.maxFileMb || env.VAULT_MAX_FILE_MB) * 1024 ** 2;
  if (Number(file.size) > maxBytes) throw new ApiError(413, `File exceeds the ${policy.maxFileMb || env.VAULT_MAX_FILE_MB} MB platform limit`);
  const handle = await fsp.open(file.path, 'r');
  const head = Buffer.alloc(Math.min(Number(file.size), 8192));
  await handle.read(head, 0, head.length, 0); await handle.close();
  const text = head.toString('utf8');
  if (text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) throw new ApiError(422, 'Malware test signature detected');
  if (head[0] === 0x4d && head[1] === 0x5a) throw new ApiError(422, 'Executable content is not allowed');
  const detected = await fileTypeFromFile(file.path).catch(() => null);
  if (detected?.ext && extension && detected.ext !== extension.slice(1) && !(['jpg', 'jpeg'].includes(detected.ext) && ['.jpg', '.jpeg'].includes(extension))) {
    const office = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.rtf']);
    if (!office.has(extension)) throw new ApiError(422, 'File content does not match its extension');
  }
  if (env.CLAMAV_ENABLED || policy.malwareScanRequired) {
    try { await execFileAsync(env.CLAMAV_COMMAND, ['--no-summary', file.path], { timeout: 120000 }); }
    catch (error) {
      if (Number(error?.code) === 1) throw new ApiError(422, 'Malware detected. The upload was rejected.');
      throw new ApiError(503, 'Malware scanning is temporarily unavailable. Please try again later.');
    }
  }
  return detected?.mime || file.mimetype || 'application/octet-stream';
}

// Backward-compatible endpoint. All bytes are persisted through the encrypted Vault/S3 layer;
// the legacy Document record only provides relational compatibility for older survey/property forms.
export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Choose a file to upload');
  try {
    const mimeType = await scanUpload(req.file);
    await assertStorageAvailable(req.user._id, req.file.size);
    const checksum = await hashFile(req.file.path);
    const extension = fileExtension(req.file.originalname);
    const category = req.body.category || categoryFromMime(mimeType, extension);
    const owner = req.user.role === 'admin' && req.body.owner ? req.body.owner : req.user._id;
    const storageKey = buildStorageKey(owner, req.file.originalname, 'legacy-documents');
    const stored = await saveFile(req.file.path, storageKey, mimeType);
    const confidentiality = category === 'legal' ? 'legal_record' : 'private';
    const driveFile = await DriveFile.create({
      owner, folder: req.body.folder || null, name: safeName(req.body.name || req.file.originalname), originalName: req.file.originalname,
      description: req.body.description || '', extension, mimeType, category, storageDriver: stored.driver, storageKey: stored.key,
      sizeBytes: req.file.size, checksum, visibility: req.body.visibility === 'public' ? 'public' : 'private', confidentiality,
      relations: { property: req.body.property || undefined, surveyProject: req.body.surveyProject || undefined },
      preview: { status: ['image', 'video', 'audio', 'document'].includes(category) ? 'ready' : 'unsupported' },
      createdBy: req.user._id,
    });
    await DriveFileVersion.create({
      file: driveFile._id, owner, version: 1, storageDriver: stored.driver, storageKey: stored.key,
      sizeBytes: req.file.size, checksum, mimeType, uploadedBy: req.user._id,
    });
    const secureUrl = `/api/v1/drive/files/${driveFile._id}/content`;
    const document = await Document.create({
      name: driveFile.name, type: req.body.type || 'other', url: secureUrl, driveFile: driveFile._id,
      mimeType, sizeBytes: req.file.size, owner, property: req.body.property || undefined,
      visibility: req.body.visibility === 'public' ? 'public' : req.body.visibility === 'property' ? 'property' : 'private',
      checksum, uploadedBy: req.user._id,
    });
    await changeUsage(owner, req.file.size, category);
    await logDriveActivity(req, driveFile, 'file_uploaded', { compatibilityDocument: document._id, sizeBytes: req.file.size });
    res.status(201).json({ success: true, data: { ...document.toObject(), driveFile: driveFile._id, url: secureUrl } });
  } catch (error) {
    if (req.file?.path) await removeQuietly(req.file.path);
    throw error;
  }
});
