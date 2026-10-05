type SensitiveKind = 'phone' | 'email' | 'address' | 'bankAccount';
type PlainObject = Record<string, unknown>;

const FIELD_PATTERNS: ReadonlyArray<[SensitiveKind, RegExp]> = [
  ['phone', /(phone|mobile|telephone|tel)/],
  ['email', /(email|mail)/],
  ['address', /address/],
  ['bankAccount', /(bankaccount|bankcard|cardnumber|accountnumber)/],
];

function normalizeFieldName(fieldName: string): string {
  return fieldName.replace(/[_\s-]/g, '').toLowerCase();
}

function kindForField(fieldName: string): SensitiveKind | undefined {
  const normalized = normalizeFieldName(fieldName);
  return FIELD_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0];
}

function maskString(kind: SensitiveKind, value: string): string {
  switch (kind) {
    case 'phone':
      return value.length <= 7 ? '*'.repeat(value.length) : `${value.slice(0, 3)}****${value.slice(-4)}`;
    case 'email': {
      const at = value.lastIndexOf('@');
      if (at <= 0 || at === value.length - 1) return '*'.repeat(value.length);
      return `${value[0]}***${value.slice(at)}`;
    }
    case 'address': {
      const characters = Array.from(value);
      return characters.length <= 6 ? value : `${characters.slice(0, 6).join('')}***`;
    }
    case 'bankAccount':
      return value.length <= 4 ? '*'.repeat(value.length) : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
  }
}

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function maskObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskObject);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => {
      const kind = kindForField(key);
      if (kind && typeof fieldValue === 'string') {
        return [key, maskString(kind, fieldValue)];
      }
      return [key, maskObject(fieldValue)];
    }),
  );
}

/** Masks a sensitive field by name, or recursively masks matching fields in an object. */
export function maskSensitive<T>(value: T, fieldName?: string): T {
  if (fieldName) {
    const kind = kindForField(fieldName);
    return (kind && typeof value === 'string' ? maskString(kind, value) : value) as T;
  }
  return maskObject(value) as T;
}
