import { describe, expect, it } from 'vitest';
import { createFabricSpec, type FabricSpec } from '../model';
import { createFabricPanel, type FabricPanelCallbacks } from './fabricPanel';

function starterFabric(): FabricSpec {
  return createFabricSpec({
    weave: 'plain',
    weaveScale: 0.12,
    color: '#5b7553',
    weight: 340,
  });
}

function setup(fabric = starterFabric()) {
  const container = document.createElement('div');
  const changes: FabricSpec[] = [];
  const callbacks: FabricPanelCallbacks = {
    onFabricChange: (spec) => changes.push(spec),
  };
  const handle = createFabricPanel(container, fabric, callbacks);
  const button = (label: string): HTMLButtonElement => {
    const buttons = [...container.querySelectorAll('button')];
    const found = buttons.find((b) => b.textContent === label);
    if (!found) throw new Error(`no button labelled "${label}"`);
    return found;
  };
  return { container, changes, handle, button };
}

describe('createFabricPanel', () => {
  it('renders weave, scale, and stripe groups plus a colour input', () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll('.fabric-label')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual([
      'Weave',
      'Weave scale',
      'Stripe (runs with the grain)',
      'Colour',
    ]);
    expect(container.querySelector('input[type="color"]')).not.toBeNull();
  });

  it('marks the current selection and reflects a 3-digit starter color', () => {
    const { container, button } = setup();
    expect(button('Plain').getAttribute('aria-pressed')).toBe('true');
    expect(button('Twill').getAttribute('aria-pressed')).toBe('false');
    expect(button('Medium').getAttribute('aria-pressed')).toBe('true');
    expect(button('Solid').getAttribute('aria-pressed')).toBe('true');
    const color = container.querySelector('input') as HTMLInputElement;
    expect(color.value).toBe('#5b7553');
  });

  it('emits a revalidated spec when the weave changes', () => {
    const { changes, button } = setup();
    button('Twill').click();
    expect(changes).toHaveLength(1);
    expect(changes[0].weave).toBe('twill');
    expect(Object.isFrozen(changes[0])).toBe(true);
    // Selection state followed the click.
    expect(button('Twill').getAttribute('aria-pressed')).toBe('true');
    expect(button('Plain').getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the coarse scale on click', () => {
    const { changes, button } = setup();
    button('Coarse').click();
    expect(changes[0].weaveScale).toBe(0.24);
  });

  it('adds a stripe width and clears it back to solid', () => {
    const { changes, button } = setup();
    button('0.8 cm').click();
    expect(changes[0].stripeCm).toBe(0.8);
    expect(button('0.8 cm').getAttribute('aria-pressed')).toBe('true');
    expect(button('Solid').getAttribute('aria-pressed')).toBe('false');
    button('Solid').click();
    expect(changes[1].stripeCm).toBeUndefined();
  });

  it('emits a new colour from the color input', () => {
    const { container, changes } = setup();
    const color = container.querySelector('input') as HTMLInputElement;
    color.value = '#b04fe0';
    color.dispatchEvent(new Event('input'));
    expect(changes).toHaveLength(1);
    expect(changes[0].color).toBe('#b04fe0');
  });

  it('keeps every fabric change valid through createFabricSpec', () => {
    const { changes, button } = setup();
    button('Satin').click();
    button('Fine').click();
    button('0.4 cm').click();
    for (const spec of changes) {
      // Throws unless the merged spec satisfies the model's invariants.
      expect(() => createFabricSpec(spec)).not.toThrow();
    }
  });

  it('dispose clears the container', () => {
    const { container, handle } = setup();
    handle.dispose();
    expect(container.innerHTML).toBe('');
  });
});
