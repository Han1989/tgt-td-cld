// The nickname (`tdt.name`): the home card's field, and the name a posted Daily run shows on the board (daily/endCard.ts
// asks for it there when it is still empty). Same rules as the protocol: 1–16 characters (`normalizeName`).

export const NAME_KEY = 'tdt.name';

export function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}
