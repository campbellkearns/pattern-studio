import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * jsdom may lack PointerEvent (long-standing jsdom gap). The recovery module
 * needs the constructor for its synthetic `pointerup`s, so polyfill a minimal
 * Event-based version when missing.
 */
class PointerEventPolyfill extends Event {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly clientX: number;
  readonly clientY: number;

  constructor(
    type: string,
    init: {
      pointerId?: number;
      pointerType?: string;
      clientX?: number;
      clientY?: number;
      bubbles?: boolean;
    } = {},
  ) {
    super(type, { bubbles: init.bubbles ?? false });
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

beforeEach(() => {
  if (typeof globalThis.PointerEvent !== 'function') {
    (globalThis as { PointerEvent?: unknown }).PointerEvent =
      PointerEventPolyfill;
  }
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

async function importModule() {
  return import('./pointerGestures');
}

function pointer(
  canvas: HTMLElement,
  type: string,
  pointerId: number,
  clientX = 10,
  clientY = 20,
): void {
  canvas.dispatchEvent(
    new PointerEventPolyfill(type, {
      pointerId,
      pointerType: 'touch',
      clientX,
      clientY,
      bubbles: true,
    }),
  );
}

describe('watchPointerRecovery', () => {
  it('re-issues pointerup for pointers with no terminal event on hide', async () => {
    const { watchPointerRecovery } = await importModule();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const watcher = watchPointerRecovery(canvas);

    pointer(canvas, 'pointerdown', 7);
    const onUp = vi.fn();
    canvas.addEventListener('pointerup', onUp);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onUp).toHaveBeenCalledTimes(1);
    const event = onUp.mock.calls[0][0] as PointerEvent;
    expect(event.pointerId).toBe(7);
    expect(event.clientX).toBe(10);
    expect(event.clientY).toBe(20);
    // Recovery clears its own tracking; a second recover finds nothing.
    expect(watcher.recover()).toBe(0);

    watcher.dispose();
    canvas.remove();
  });

  it('does not re-issue events for pointers that ended normally', async () => {
    const { watchPointerRecovery } = await importModule();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const watcher = watchPointerRecovery(canvas);

    pointer(canvas, 'pointerdown', 3);
    pointer(canvas, 'pointerup', 3);
    expect(watcher.recover()).toBe(0);

    pointer(canvas, 'pointerdown', 4);
    pointer(canvas, 'pointercancel', 4);
    expect(watcher.recover()).toBe(0);

    watcher.dispose();
    canvas.remove();
  });

  it('stops listening after dispose', async () => {
    const { watchPointerRecovery } = await importModule();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const watcher = watchPointerRecovery(canvas);
    watcher.dispose();

    pointer(canvas, 'pointerdown', 9);
    expect(watcher.recover()).toBe(0);

    canvas.remove();
  });
});
