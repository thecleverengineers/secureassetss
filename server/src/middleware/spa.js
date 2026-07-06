import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const RESERVED_PREFIXES = ['/api', '/socket.io', '/site-assets', '/uploads'];
const FILE_EXTENSION = /\.[a-z0-9]{1,12}$/i;

export function isSpaNavigationRequest(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const requestPath = req.path || '/';
  if (RESERVED_PREFIXES.some((prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`))) return false;
  if (FILE_EXTENSION.test(requestPath.split('/').pop() || '')) return false;
  return Boolean(req.accepts('html'));
}

export function mountProductionSpa(app, distDirectory) {
  const indexFile = path.join(distDirectory, 'index.html');
  if (!fs.existsSync(indexFile)) return false;

  app.use(express.static(distDirectory, {
    index: false,
    etag: true,
    fallthrough: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  app.get('/{*splat}', (req, res, next) => {
    if (!isSpaNavigationRequest(req)) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(indexFile);
  });
  return true;
}
