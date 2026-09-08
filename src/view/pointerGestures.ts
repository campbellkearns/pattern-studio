/**
 * WebKit stale-pointer recovery — the blueprint's second Safari defense
 * from M1. iOS Safari sometimes drops the final `pointerup` (e.g. when the
 * tab is backgrounded mid-gesture), leaving OrbitControls holding a ghost
 * touch: the next one-finger drag then orbits from a phantom anchor.
 *
 * We track pointers that went down on the canvas and never saw a terminal
 * event (`pointerup`/`pointercancel`). When the page is hidden, we re-issue
 * a synthetic `pointerup` for each stale pointer so OrbitControls' own
 * `pointercancel`-wired handler releases them. Synthetic events only target
 * pointers we still track — re-sending for an already-terminated pointer
 * would corrupt OrbitControls' internal pointer list.
 */
export interface PointerRecovery {
  /** Re-issue terminal events for all stale pointers; returns the count. */
  recover(): number;
  /** Remove all listeners. */
  dispose(): void;
}

export function watchPointerRecovery(
  canvas: HTMLElement,
  doc: Document = canvas.ownerDocument,
): PointerRecovery {
  /** Last known position/type per pointer id, for faithful synthetic events. */
  const active = new Map<
    number,
    { clientX: number; clientY: number; pointerType: string }
  >();

  const onDown = (event: PointerEvent): void => {
    active.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    });
  };
  const onEnd = (event: PointerEvent): void => {
    active.delete(event.pointerId);
  };

  const recover = (): number => {
    let released = 0;
    for (const [pointerId, pos] of active) {
      if (typeof PointerEvent !== 'function') break;
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId,
          clientX: pos.clientX,
          clientY: pos.clientY,
          pointerType: pos.pointerType,
          bubbles: true,
        }),
      );
      released += 1;
    }
    active.clear();
    return released;
  };

  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') recover();
  };

  canvas.addEventListener('pointerdown', onDown);
  // Capture so a dropped-or-swallowed bubble phase cannot fool the tracker.
  canvas.addEventListener('pointerup', onEnd, true);
  canvas.addEventListener('pointercancel', onEnd, true);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    recover,
    dispose(): void {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onEnd, true);
      canvas.removeEventListener('pointercancel', onEnd, true);
      doc.removeEventListener('visibilitychange', onVisibility);
      active.clear();
    },
  };
}
