import { describe, expect, it } from 'vitest';
import { createSeamStep, type SeamStep } from '../model/seam';
import {
  createSeamDesignPanel,
  type SeamDesignCallbacks,
} from './seamDesignPanel';

function sampleStep(overrides: Partial<SeamStep> = {}): SeamStep {
  return createSeamStep({
    pieces: ['top', 'lining'],
    edges: [
      { pieceId: 'top', startVertex: 0, edgeCount: 1 },
      { pieceId: 'lining', startVertex: 0, edgeCount: 1 },
    ],
    order: 1,
    note: 'Join the top edge.',
    ...overrides,
  });
}

function setup(step = sampleStep()) {
  const container = document.createElement('div');
  const changes: SeamStep[] = [];
  const callbacks: SeamDesignCallbacks = {
    onSeamDesignChange: (next) => changes.push(next),
  };
  const handle = createSeamDesignPanel(container, 0, step, callbacks);
  const button = (label: string): HTMLButtonElement => {
    const buttons = [...container.querySelectorAll('button')];
    const found = buttons.find((b) => b.textContent === label);
    if (!found) throw new Error(`no button labelled "${label}"`);
    return found;
  };
  return { container, changes, handle, button };
}

describe('createSeamDesignPanel', () => {
  it('renders the stitch group and thread-colour input', () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll('.fabric-label')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Stitch', 'Thread colour']);
    expect(container.querySelector('input[type="color"]')).not.toBeNull();
    const stitchButtons = [...container.querySelectorAll('button')].map(
      (b) => b.textContent,
    );
    expect(stitchButtons).toEqual(['Straight', 'Zigzag', 'Backstitch']);
  });

  it('marks the seam’s current stitch (absent design = Straight)', () => {
    const { button } = setup();
    expect(button('Straight').getAttribute('aria-pressed')).toBe('true');
    expect(button('Zigzag').getAttribute('aria-pressed')).toBe('false');
    expect(button('Backstitch').getAttribute('aria-pressed')).toBe('false');
  });

  it('emits a frozen, revalidated step when the stitch changes', () => {
    const { changes, button } = setup();
    button('Zigzag').click();
    expect(changes).toHaveLength(1);
    expect(changes[0].stitch).toBe('zigzag');
    expect(changes[0].pieces).toEqual(['top', 'lining']);
    expect(changes[0].note).toBe('Join the top edge.');
    expect(Object.isFrozen(changes[0])).toBe(true);
  });

  it('keeps the picked stitch when the thread colour changes later', () => {
    const { container, handle, changes, button } = setup();
    button('Backstitch').click();
    handle.setStep(0, changes[changes.length - 1]!);
    const color = container.querySelector('input') as HTMLInputElement;
    color.value = '#a4161a';
    color.dispatchEvent(new Event('input'));
    const latest = changes[changes.length - 1]!;
    expect(latest.stitch).toBe('backstitch');
    expect(latest.threadColor).toBe('#a4161a');
    expect(Object.isFrozen(latest)).toBe(true);
  });

  it('retargets to another seam without emitting', () => {
    const designed = sampleStep({ stitch: 'zigzag', threadColor: '#2a9d8f' });
    const { container, handle, changes, button } = setup();
    handle.setStep(1, designed);
    expect(handle.stepIndex).toBe(1);
    expect(changes).toHaveLength(0);
    expect(button('Zigzag').getAttribute('aria-pressed')).toBe('true');
    const color = container.querySelector('input') as HTMLInputElement;
    expect(color.value).toBe('#2a9d8f');
  });

  it('shows the colour input’s neutral black for an undesigned seam', () => {
    const { container } = setup(sampleStep());
    const color = container.querySelector('input') as HTMLInputElement;
    expect(color.value).toBe('#000000');
  });

  it('dispose empties the panel — its controls are gone', () => {
    const { container, handle } = setup();
    handle.dispose();
    expect(container.innerHTML).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
