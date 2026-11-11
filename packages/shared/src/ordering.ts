/**
 * Fractional indexing for card and list positions.
 * Positions are base62 strings, compared lexicographically. A position can
 * always be generated strictly between two neighbours, so moving an element
 * never requires renumbering (except pathological keys longer than the limit).
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MIDDLE = 31;
export const POSITION_MAX_LENGTH = 64;

function between(a: string | null, b: string | null): string {
  const lower = a ?? '';
  if (lower !== '' && b !== null && lower >= b) {
    throw new Error('positions are out of order');
  }
  if (b === null) {
    return lower === '' ? (DIGITS[MIDDLE] as string) : lower + DIGITS[MIDDLE];
  }
  if (lower === '') {
    if (b.length === 0) throw new Error('no room below the first position');
    const upperDigit = DIGITS.indexOf(b.charAt(0));
    if (upperDigit < 0) throw new Error('invalid position');
    if (upperDigit > 0) return DIGITS[Math.floor(upperDigit / 2)] ?? DIGITS.charAt(0);
    if (b.length === 1) throw new Error('no room below the first position');
    return b.charAt(0) + between('', b.slice(1));
  }
  if (lower.charAt(0) === b.charAt(0)) {
    return lower.charAt(0) + between(lower.slice(1), b.slice(1));
  }
  const lowerDigit = DIGITS.indexOf(lower.charAt(0));
  const upperDigit = DIGITS.indexOf(b.charAt(0));
  if (upperDigit - lowerDigit > 1) {
    return DIGITS[Math.floor((lowerDigit + upperDigit) / 2)] ?? DIGITS.charAt(0);
  }
  return lower.charAt(0) + between(lower.slice(1), null);
}

/** Return a position strictly between `a` and `b` (either may be null). */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new Error('positions are out of order');
  const key = between(a, b);
  if (key.length > POSITION_MAX_LENGTH) {
    throw new Error('position is too long, rebalance required');
  }
  return key;
}

/** Generate `count` evenly distributed positions strictly between `a` and `b`. */
export function generateNKeysBetween(a: string | null, b: string | null, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [keyBetween(a, b)];
  const middle = Math.floor(count / 2);
  const pivot = keyBetween(a, b);
  return [
    ...generateNKeysBetween(a, pivot, middle),
    pivot,
    ...generateNKeysBetween(pivot, b, count - middle - 1),
  ];
}

/** Rebalanced positions for `count` elements, 1024-step plan from the spec. */
export function rebalancedPositions(count: number): string[] {
  if (count <= 0) return [];
  // Fixed-width keys starting at 62^4 leave the whole lower part of the
  // alphabet free for insert-before operations.
  const base = 62 ** 4;
  return Array.from({ length: count }, (_, index) => encodeBase62(base + index, 5));
}

function encodeBase62(value: number, width: number): string {
  let result = '';
  let current = value;
  for (let index = 0; index < width; index++) {
    result = DIGITS[current % 62] + result;
    current = Math.floor(current / 62);
  }
  return result;
}
