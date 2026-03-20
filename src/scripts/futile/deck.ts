import { Tile, COLOURS, NUMBERS, COPIES_PER_TILE, shuffle } from "./shared";


export class Deck {
  #tiles: Tile[];
  constructor() {
    this.#tiles = this.#createDeck();
  }
  #createDeck(): Tile[] {
    const deck: Tile[] = [];
    for (const c of COLOURS) {
      for (const n of NUMBERS) {
        for (let k = 0; k < COPIES_PER_TILE; k++) {
          deck.push({
            id: `${c}-${n}-${k}-${(Math.random()).toString(36).slice(2, 8)}`,
            colour: c,
            number: n,
          });
        }
      }
    }
    return shuffle(deck);
  }
  draw(): Tile | undefined {
    return this.#tiles.pop();
  }
  get size(): number {
    return this.#tiles.length;
  }
}
