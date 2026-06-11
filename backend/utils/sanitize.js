/**
 * Input sanitizers for the upload pipeline.
 *
 * TUS ids are joined into filesystem paths (path.join(tusUploadDir, id)),
 * so anything outside a strict charset is a path-traversal attempt.
 */
const path = require('path');

const SAFE_TUS_ID = /^[A-Za-z0-9_-]+$/;

function isSafeTusId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && SAFE_TUS_ID.test(id);
}

/** Strip any directory components and control chars from a client filename. */
function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file'));
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\x00-\x1f]/g, '').trim();
  return clean.length > 0 ? clean.slice(0, 255) : 'file';
}

module.exports = { isSafeTusId, sanitizeFilename };
