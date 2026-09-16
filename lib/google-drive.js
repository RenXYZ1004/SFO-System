import { getAccessToken, oauthConfigured } from './google-auth.js';

/** Google Drive storage for private proof-of-payment files. */

export function driveConfigured() {
  return Boolean(oauthConfigured() && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

function requireDriveConfig() {
  if (!oauthConfigured()) {
    throw new Error('Google OAuth is not configured.');
  }
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured.');
  }
}

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

function multipartBody(metadata, buffer, contentType) {
  const boundary = `----SFOReceipt${crypto.randomUUID().replaceAll('-', '')}`;
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
    'utf8'
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([prefix, buffer, suffix]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

export async function uploadReceipt(buffer, filename, contentType) {
  requireDriveConfig();

  const name = String(filename || 'receipt')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-80) || 'receipt';

  const { body, contentType: multipartType } = multipartBody(
    {
      name,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    buffer,
    contentType
  );

  const response = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',
    {
      method: 'POST',
      headers: { 'Content-Type': multipartType },
      body,
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) {
    throw new Error(data?.error?.message || `Google Drive upload failed (HTTP ${response.status}).`);
  }
  return data;
}

export async function getReceipt(fileId) {
  requireDriveConfig();
  const id = String(fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;

  const metaResponse = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size&supportsAllDrives=true`
  );
  if (metaResponse.status === 404) return null;
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) {
    throw new Error(meta?.error?.message || `Google Drive metadata failed (HTTP ${metaResponse.status}).`);
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`
  );
  if (response.status === 404) return null;
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Google Drive download failed (HTTP ${response.status}).`);
  }

  return { metadata: meta, stream: response.body };
}

export async function deleteReceipt(fileId) {
  requireDriveConfig();
  const id = String(fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return false;

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
    { method: 'DELETE' }
  );
  if (response.status === 404) return true;
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Google Drive delete failed (HTTP ${response.status}).`);
  }
  return true;
}
