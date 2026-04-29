import { ulid } from 'ulid';

export { ulid };

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isValidUlid(id: unknown): id is string {
  return typeof id === 'string' && ULID_RE.test(id);
}

/**
 * Throws if the id isn't a Crockford-base32 ULID. Use at IPC boundaries before
 * joining the id into a filesystem path to prevent path traversal.
 */
export function assertUlid(id: unknown, label = 'id'): string {
  if (!isValidUlid(id)) {
    throw new Error(`Invalid ${label}: must be a 26-character ULID`);
  }
  return id;
}
