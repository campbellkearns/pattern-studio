/**
 * URL-encoded share links (F7 + states table Share mode) — no backend.
 *
 * A project rides in the URL hash as base64url(JSON), so a shared link
 * works from a cold start: the app reads the hash before touching storage.
 * When the link would exceed MAX_SHARE_URL_LENGTH the Share mode's failure
 * state kicks in — clipboard-JSON fallback — because link shorteners, chat
 * apps, and bidi tools truncate long URLs into broken ones.
 *
 * Pure module: no DOM. Callers hand in the base URL they want to share.
 */
import type { Project } from '../model';
import { parseProject, serializeProject } from './projectIo';
import type { ParseResult } from './projectIo';

/** Hash query parameter carrying the encoded project. */
export const SHARE_PARAM = 'p';

/**
 * Practical share-link ceiling in characters, counting the whole URL.
 * Browsers accept far more, but intermediaries truncate around 8,000
 * characters — past this, a shared link arrives broken and the honest
 * path is the clipboard-JSON fallback.
 */
export const MAX_SHARE_URL_LENGTH = 8000;

export type SharePlan =
  | { readonly kind: 'url'; readonly url: string; readonly urlLength: number }
  | {
      readonly kind: 'clipboard';
      /** Project JSON to copy instead of a link. */
      readonly json: string;
      /** How long the rejected link would have been. */
      readonly urlLength: number;
    };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Compact base64url token — whitespace would inflate the URL for nothing. */
export function encodeProjectToken(project: Project): string {
  return toBase64Url(
    new TextEncoder().encode(serializeProject(project, 'compact')),
  );
}

/**
 * Decode a share token back into a validated project. Malformed tokens are
 * an `invalid` result, never a thrown error — shared links are untrusted
 * input typed by hand and passed around the internet.
 */
export function decodeProjectToken(token: string): ParseResult {
  if (token.length === 0) {
    return { status: 'invalid', reason: 'share token is empty' };
  }
  let json: string;
  try {
    json = new TextDecoder().decode(fromBase64Url(token));
  } catch (error) {
    return {
      status: 'invalid',
      reason: `share token is not decodable (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
  return parseProject(json);
}

export function buildShareUrl(project: Project, baseUrl: string): string {
  const base = baseUrl.endsWith('#') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}#${SHARE_PARAM}=${encodeProjectToken(project)}`;
}

/** Read the share token from a location hash (`#p=…`); null when absent. */
export function readShareToken(hash: string): string | null {
  const params = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : hash,
  );
  const token = params.get(SHARE_PARAM);
  return token !== null && token.length > 0 ? token : null;
}

/**
 * The Share-mode plan: a URL when it fits the length budget, otherwise the
 * clipboard-JSON fallback carrying the same project.
 */
export function planShare(project: Project, baseUrl: string): SharePlan {
  const url = buildShareUrl(project, baseUrl);
  return url.length <= MAX_SHARE_URL_LENGTH
    ? { kind: 'url', url, urlLength: url.length }
    : {
        kind: 'clipboard',
        json: serializeProject(project),
        urlLength: url.length,
      };
}
