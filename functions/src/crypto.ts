import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Stateless token sealing for the OAuth flow.
 *
 * We don't run a token database. Instead every OAuth artifact (client_id,
 * authorization code, access token, refresh token) is an AES-256-GCM-encrypted
 * JSON blob, signed+encrypted with a server-side secret. "Validating" a token
 * means decrypting it; tampering or using the wrong secret fails the GCM auth
 * tag. Expiry is encoded in the payload and checked on open().
 *
 * This keeps the Cloud Function horizontally scalable (no shared state between
 * instances) while still being secure: the blobs are opaque to clients and the
 * secret never leaves the server.
 */

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function keyFromSecret(secret: string): Buffer {
  // Derive a stable 32-byte key from the configured secret.
  return createHash('sha256').update(secret).digest();
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Encrypt a JSON-serializable payload into an opaque base64url token. */
export function seal(secret: string, payload: Record<string, unknown>): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: iv | tag | ciphertext
  return b64urlEncode(Buffer.concat([iv, tag, ciphertext]));
}

/**
 * Decrypt a token produced by seal(). Throws if the token is tampered, was
 * sealed with a different secret, is malformed, or (when the payload carries an
 * `exp` field) has expired.
 */
export function open<T extends Record<string, unknown>>(secret: string, token: string): T {
  const key = keyFromSecret(secret);
  const raw = b64urlDecode(token);
  if (raw.length < IV_LEN + TAG_LEN) throw new Error('token too short');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(plaintext.toString('utf8')) as T & { exp?: number };
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new Error('token expired');
  }
  return payload;
}
