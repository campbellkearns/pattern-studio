/**
 * Fabric panel: weave / scale / colour / stripe pickers that re-skin every
 * piece live through the viewport's applyFabric. Every control is a tap
 * equivalent (no hover-only affordances) and carries the 44 px touch
 * target the blueprint's HIG baseline requires. Each change revalidates
 * the merged spec through createFabricSpec, so the panel can never emit
 * an invalid fabric.
 */
import { createFabricSpec, type FabricSpec, type WeaveType } from '../model';

export interface FabricPanelCallbacks {
  onFabricChange(spec: FabricSpec): void;
}

export interface FabricPanelHandle {
  dispose(): void;
}

const WEAVES: ReadonlyArray<{ value: WeaveType; label: string }> = [
  { value: 'plain', label: 'Plain' },
  { value: 'twill', label: 'Twill' },
  { value: 'satin', label: 'Satin' },
];

/** Discrete cm-per-weave-repeat choices, inside the model's valid range. */
const SCALES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.06, label: 'Fine' },
  { value: 0.12, label: 'Medium' },
  { value: 0.24, label: 'Coarse' },
];

/** Colored-warp stripe widths; 0 means solid colour (no stripe). */
const STRIPES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Solid' },
  { value: 0.4, label: '0.4 cm' },
  { value: 0.8, label: '0.8 cm' },
];

/** The color input needs the full 6-digit form. */
function expandHex(color: string): string {
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return color;
}

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

export function createFabricPanel(
  container: HTMLElement,
  fabric: FabricSpec,
  callbacks: FabricPanelCallbacks,
): FabricPanelHandle {
  container.innerHTML = '';
  let current = fabric;
  const renderers: (() => void)[] = [];

  const heading = document.createElement('h2');
  heading.textContent = 'Fabric';
  container.appendChild(heading);

  /** A labelled group of toggle buttons sharing one selection. */
  function segmented(
    label: string,
    options: ReadonlyArray<{ value: number | WeaveType; label: string }>,
    isSelected: (value: number | WeaveType) => boolean,
    onSelect: (value: number | WeaveType) => void,
  ): void {
    const group = document.createElement('div');
    group.className = 'fabric-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);

    const caption = document.createElement('span');
    caption.className = 'fabric-label';
    caption.textContent = label;
    group.appendChild(caption);

    const row = document.createElement('div');
    row.className = 'fabric-options';
    const buttons: { button: HTMLButtonElement; value: number | WeaveType }[] =
      [];
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fabric-btn';
      button.textContent = option.label;
      const onClick = (): void => onSelect(option.value);
      button.addEventListener('click', onClick);
      row.appendChild(button);
      buttons.push({ button, value: option.value });
    }
    group.appendChild(row);
    container.appendChild(group);

    renderers.push(() => {
      for (const { button, value } of buttons) {
        const selected = isSelected(value);
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    });
  }

  function emit(next: FabricSpec): void {
    current = createFabricSpec(next); // revalidates; frozen
    renderAll();
    callbacks.onFabricChange(current);
  }

  function renderAll(): void {
    for (const render of renderers) render();
    colorInput.value = expandHex(current.color);
  }

  segmented(
    'Weave',
    WEAVES,
    (value) => current.weave === value,
    (value) => emit({ ...current, weave: value as WeaveType }),
  );

  segmented(
    'Weave scale',
    SCALES,
    (value) => same(current.weaveScale, value as number),
    (value) => emit({ ...current, weaveScale: value as number }),
  );

  segmented(
    'Stripe (runs with the grain)',
    STRIPES,
    (value) => same(current.stripeCm ?? 0, value as number),
    (value) =>
      emit({
        ...current,
        ...(same(value as number, 0)
          ? { stripeCm: undefined }
          : { stripeCm: value as number }),
      }),
  );

  const colorGroup = document.createElement('div');
  colorGroup.className = 'fabric-group';
  colorGroup.setAttribute('role', 'group');
  colorGroup.setAttribute('aria-label', 'Fabric colour');
  const colorCaption = document.createElement('span');
  colorCaption.className = 'fabric-label';
  colorCaption.textContent = 'Colour';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'fabric-color';
  colorInput.setAttribute('aria-label', 'Fabric colour');
  const onColor = (): void => emit({ ...current, color: colorInput.value });
  colorInput.addEventListener('input', onColor);
  colorGroup.append(colorCaption, colorInput);
  container.appendChild(colorGroup);

  renderAll();

  return {
    dispose(): void {
      colorInput.removeEventListener('input', onColor);
      container.innerHTML = '';
    },
  };
}
