export type Colour = 'blue' | 'red' | 'amber' | 'green';

export interface Tile {
  id: string;
  colour: Colour;
  number: number;
}

export const COLOURS: Colour[] = ['blue', 'red', 'amber', 'green'];
export const COPIES_PER_TILE = 2;
export const NUMBERS = Array.from({ length: 10 }, (_, i) => i);

export const COLOUR_TO_STATUS: Record<Colour, string> = {
  blue: 'blue',
  red: 'red',
  amber: 'yellow',
  green: 'green',
};

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function compareTiles(a: Tile, b: Tile): number {
  if (a.number !== b.number) return a.number - b.number;
  if (a.colour !== b.colour) return a.colour.localeCompare(b.colour);
  return a.id.localeCompare(b.id);
}

export function isSet(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;
  const num = tiles[0].number;
  return tiles.every((t) => t.number === num);
}

export function isRun(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;
  const colour = tiles[0].colour;
  if (!tiles.every((t) => t.colour === colour)) return false;
  const nums = tiles.map((t) => t.number).sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) return false;
  return true;
}
