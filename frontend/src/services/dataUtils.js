export function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function getNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

export function getText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }

  return '';
}

export function getNested(source, path) {
  return path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
}

export function firstValue(source, paths) {
  for (const path of paths) {
    const value = Array.isArray(path) ? getNested(source, path) : source?.[path];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return undefined;
}

export function objectEntries(value, limit = 8) {
  if (!isObject(value)) return [];

  return Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
    .slice(0, limit);
}
