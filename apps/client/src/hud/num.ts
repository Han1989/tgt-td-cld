// Whole numbers for the HUD (q1, Han's laptop run of 11 Nov 2026: "271 / 949.2799999999999"). In Endless a veteran
// level multiplies a hero's max HP and a Reinforce rank a tower's, so the snapshot's numbers can be fractional; the
// sim, the bars' widths and the saved match report keep them exact, and only the text goes through here. Pure, tested.

/** Current HP: rounded up, so anything alive never reads 0; never above the max as shown. */
export function hpNow(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(Math.ceil(hp - 1e-9), maxWhole(maxHp)));
}

/** Max HP (or any max): the nearest whole number. */
export function maxWhole(max: number): number {
  return Math.round(max);
}

/** Current mana: rounded down, so a skill that reads affordable is affordable; never above the max as shown. */
export function manaNow(mana: number, maxMana: number): number {
  return Math.max(0, Math.min(Math.floor(mana + 1e-9), maxWhole(maxMana)));
}

/** "271 / 949". */
export function hpLine(hp: number, maxHp: number): string {
  return `${hpNow(hp, maxHp)} / ${maxWhole(maxHp)}`;
}

/** "34 / 332". */
export function manaLine(mana: number, maxMana: number): string {
  return `${manaNow(mana, maxMana)} / ${maxWhole(maxMana)}`;
}

/** Any other game number shown whole (damage, a stat): the nearest. */
export function whole(v: number): number {
  return Math.round(v);
}
