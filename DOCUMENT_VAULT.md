# Universal Document Vault, Media Drive and Legal Records

The Document Vault is available to every registered account and is integrated with Tenant, Landlord and Surveyor modes. Every account receives an isolated personal drive. Files are private by default and are never served from a guessable public upload directory.

## Implemented capabilities

- My Drive, Recent, Starred, Shared With Me, Legal, Property, Survey, Images, Videos, Audio, Agreements, Reports, Receipts, Archive and Trash sections
- Unlimited nested folders subject to the account storage quota
- Grid/list layouts, breadcrumbs, search, tags, bulk operations and drag-and-drop uploads
- Mobile camera upload and multi-page JPG/PNG-to-PDF scanning
- Documents, media, compressed, CAD/GIS and survey-file storage with configurable extension and size policies
- Private, selected-user, team, restricted-link and public visibility
- Viewer, commenter, downloader, uploader, editor, manager and co-owner permissions
- Password, activation/expiry dates, email/domain/country restrictions, download controls, view/download limits and revocable public links
- Folder visibility modes: folder only, include existing, inherit and manual
- Legal templates for Tenant, Landlord, Surveyor and Property Sale records
- Legal metadata, confidentiality classifications, approval states, expiry/reminders and immutable final versions
- File versions, comments, approvals, activity/access logs, duplicate checks and SHA-256 checksums
- Property, survey-project, user, agreement, dispute and legal-matter relations
- Storage quotas derived from account and subscription capabilities
- 75%, 90% and 100% quota indicators and upload blocking at quota
- Trash recovery, configurable retention and a PM2 retention worker
- Public file/folder preview pages and public-content reporting
- Admin storage usage, policies, content reports and quarantine/restriction controls
- Local encrypted storage or S3-compatible object storage
- Optional ClamAV scanning
- Resumable chunk uploads and secure folder ZIP export
- Internal generated-document endpoint for agreements, receipts, reports and Legal Toolkit output

## Security design

Local production storage uses AES-256-GCM. S3-compatible storage can use provider-side encryption. File content is streamed only after ownership/share/public-link checks. Sensitive files require explicit confirmation before public sharing. Final legal records are immutable and cannot be removed through ordinary user deletion.

MongoDB TTL deletion is intentionally not used for vault files. TTL would delete database rows without removing encrypted or S3 objects and could bypass legal retention. `scripts/purge-drive-trash.js` performs controlled retention cleanup and writes audit records.

## Storage backends

### Encrypted local disk

Recommended for one persistent VPS:

```env
STORAGE_DRIVER=local
VAULT_STORAGE_DIR=/var/lib/secureasset/vault
VAULT_TEMP_DIR=/var/lib/secureasset/tmp
VAULT_ENCRYPTION_KEY=<64-character-random-secret>
```

Back up the storage directory and MongoDB together. Keep the encryption key in a secret manager and outside the repository.

### S3-compatible storage

Recommended for multiple application instances:

```env
STORAGE_DRIVER=s3
S3_REGION=ap-south-1
S3_BUCKET=secureasset-production
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_SSE=AES256
```

`S3_ENDPOINT` may be set for compatible providers such as MinIO, Cloudflare R2 or DigitalOcean Spaces.

## Important API groups

- `GET /api/v1/drive/bootstrap`
- `GET /api/v1/drive/items`
- `POST /api/v1/drive/folders`
- `POST /api/v1/drive/files`
- `POST /api/v1/drive/scan-to-pdf`
- `POST /api/v1/drive/generated-documents`
- `POST /api/v1/drive/files/:id/versions`
- `POST /api/v1/drive/:type/:id/shares`
- `POST /api/v1/drive/:type/:id/public-link`
- `POST /api/v1/drive/uploads/initiate`
- `GET /api/v1/public-drive/:type/:token`
- `GET /api/v1/drive/admin/overview`
- `PATCH /api/v1/drive/admin/policy`

## Preview boundaries

The built-in browser preview supports PDF, images, video, audio and text. Office, CAD/GIS and other specialist formats are stored securely and can be downloaded. Rich native rendering, OCR, HEIC conversion, redaction and CAD conversion are provider integration points and should be connected to approved conversion services before enabling them for untrusted production documents.
