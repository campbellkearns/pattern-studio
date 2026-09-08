/**
 * Small validation helpers shared by the domain factories. All throw on
 * violation — invalid data never becomes a domain object.
 */

export function requireNonEmptyString(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return trimmed;
}

export function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${value}`);
  }
  return value;
}

export function requirePositive(value: number, label: string): number {
  requireFinite(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be > 0, got ${value}`);
  }
  return value;
}

export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer >= 1, got ${value}`);
  }
  return value;
}

export function requireNonNegativeInteger(
  value: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be an integer >= 0, got ${value}`);
  }
  return value;
}
