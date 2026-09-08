import { describe, expect, it } from 'vitest';
import { createPiece, type Piece } from '../model/piece';
import { closePath, cubicTo, lineTo, moveTo } from '../model/path';
import { createProject, type Project } from '../model/project';
import { vec2 } from '../model/vec2';
import { serializeProject } from './projectIo';
import {
  MAX_SHARE_URL_LENGTH,
  buildShareUrl,
  decodeProjectToken,
  encodeProjectToken,
  planShare,
  readShareToken,
} from './shareLink';

function samplePiece(id: string): Piece {
  return createPiece({
    id,
    name: `${id} piece`,
    outline: [
      moveTo(vec2(0, 0)),
      cubicTo(vec2(3, -1), vec2(7, 3), vec2(10, 0)),
      lineTo(vec2(10, 6)),
      lineTo(vec2(0, 6)),
      closePath(),
    ],
    internal: [],
    grainline: { angle: 0, placement: vec2(5, 3) },
    seamAllowance: 1,
    cutCount: 1,
  });
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return createProject({
    id: 'proj-share',
    name: 'Tote bag',
    measurements: { width: 38 },
    fabric: {
      weave: 'plain',
      weaveScale: 0.12,
      color: '#5b7553',
      weight: 340,
    },
    pieces: [samplePiece('body')],
    assembly: [],
    ...overrides,
  });
}

describe('share tokens', () => {
  it('round-trips a project through encode → decode', () => {
    const original = sampleProject({ basedOn: 'starter-tote' });
    const parsed = decodeProjectToken(encodeProjectToken(original));
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.project).toEqual(original);
  });

  it('round-trips unicode names through UTF-8 base64url', () => {
    const original = sampleProject({ name: 'Sac “cousu main” — ✂️' });
    const parsed = decodeProjectToken(encodeProjectToken(original));
    if (parsed.status !== 'ok') throw new Error('expected a valid decode');
    expect(parsed.project.name).toBe(original.name);
  });

  it('emits URL-safe tokens without padding', () => {
    expect(encodeProjectToken(sampleProject())).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('share URLs', () => {
  it('carries the token in the #p= hash', () => {
    const url = buildShareUrl(sampleProject(), 'https://pattern.studio/app');
    expect(url.startsWith('https://pattern.studio/app#p=')).toBe(true);
  });

  it('tolerates a base URL that already ends in #', () => {
    const url = buildShareUrl(sampleProject(), 'https://pattern.studio/#');
    expect(url).not.toContain('##');
  });
});

describe('readShareToken', () => {
  it('reads the token from a hash with the leading #', () => {
    expect(readShareToken('#p=abc123')).toBe('abc123');
  });

  it('reads the token from a bare query string', () => {
    expect(readShareToken('p=abc123')).toBe('abc123');
  });

  it('returns null when the hash holds no token', () => {
    expect(readShareToken('')).toBeNull();
    expect(readShareToken('#')).toBeNull();
    expect(readShareToken('#p=')).toBeNull();
    expect(readShareToken('#other=1')).toBeNull();
  });
});

describe('cold start from a shared link', () => {
  it('survives the full journey: build → URL → hash → decode', () => {
    const original = sampleProject({ basedOn: 'starter-tote' });
    const shareUrl = buildShareUrl(original, 'https://pattern.studio/');

    // A browser hands the app the hash of the URL it was opened with.
    const hash = new URL(shareUrl).hash;
    const token = readShareToken(hash);
    expect(token).not.toBeNull();

    const parsed = decodeProjectToken(token ?? '');
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.project).toEqual(original);
  });

  it('reports invalid for garbage and empty tokens instead of throwing', () => {
    expect(decodeProjectToken('').status).toBe('invalid');
    const garbage = decodeProjectToken('!!!not-base64!!!');
    expect(garbage.status).toBe('invalid');
    if (garbage.status !== 'invalid') return;
    expect(garbage.reason).toMatch(/decodable|JSON|object/i);
  });
});

describe('planShare and the length-limit fallback', () => {
  const SHORT_BASE = 'https://pattern.studio/';

  it('returns a URL plan when the link fits the budget', () => {
    const plan = planShare(sampleProject(), SHORT_BASE);
    expect(plan.kind).toBe('url');
    if (plan.kind !== 'url') return;
    expect(plan.urlLength).toBe(plan.url.length);
    expect(plan.urlLength).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);
  });

  it('falls back to clipboard JSON when the link exceeds the budget', () => {
    // Same project, but a base URL long enough to push any link over the
    // limit — isolates planShare's comparison from fixture size.
    const longBase = `https://pattern.studio/${'a'.repeat(MAX_SHARE_URL_LENGTH)}`;
    const plan = planShare(sampleProject(), longBase);
    expect(plan.kind).toBe('clipboard');
    if (plan.kind !== 'clipboard') return;
    expect(plan.urlLength).toBeGreaterThan(MAX_SHARE_URL_LENGTH);
    // The fallback payload is the same project, importable as-is.
    const parsed = JSON.parse(plan.json) as Record<string, unknown>;
    expect(parsed.id).toBe('proj-share');
  });

  it('fallback JSON is exactly the serialized project', () => {
    const longBase = `https://pattern.studio/${'a'.repeat(MAX_SHARE_URL_LENGTH)}`;
    const original = sampleProject({ basedOn: 'starter-tote' });
    const plan = planShare(original, longBase);
    if (plan.kind !== 'clipboard') throw new Error('expected clipboard plan');
    expect(plan.json).toBe(serializeProject(original));
  });
});
