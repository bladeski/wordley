import '../../components/tile-component';
import type { Futile } from './futile';
import { COLOUR_TO_STATUS, compareTiles, Tile, isSet, isRun } from './shared';

export class Player {
  readonly id: number;
  #hand: Tile[] = [];
  #playedMelds: Tile[][] = [];
  #hasPlayedMeld = false;
  #score = 0;
  #bonus = 0;

  constructor(id: number) {
    this.id = id;
  }

  get hand(): Tile[] {
    return this.#hand;
  }
  get playedMelds(): Tile[][] {
    return this.#playedMelds;
  }
  get hasPlayedMeld(): boolean {
    return this.#hasPlayedMeld;
  }
  get score(): number {
    return this.#score;
  }
  set score(val: number) {
    this.#score = val;
  }

  receiveTile(tile: Tile): void {
    this.#hand.push(tile);
    this.#hand.sort(compareTiles);
  }

  removeTileById(id: string): Tile | null {
    const idx = this.#hand.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    return this.#hand.splice(idx, 1)[0];
  }

  async addMeld(tiles: Tile[]): Promise<boolean> {
    if (!Array.isArray(tiles) || tiles.length === 0) return false;
    const copy = tiles.slice();
    copy.sort(compareTiles);
    // Validate meld conforms to rules
    if (!(isSet(copy) || isRun(copy))) return false;
    this.#playedMelds.push(copy);
    this.#hasPlayedMeld = true;
    return true;
  }

  async updateMeld(meldIdx: number, tiles: Tile[]): Promise<boolean> {
    if (meldIdx < 0 || meldIdx >= this.#playedMelds.length) return false;
    if (!Array.isArray(tiles) || tiles.length === 0) return false;
    const existing = this.#playedMelds[meldIdx] ?? [];
    const combined = existing.concat(tiles).slice();
    combined.sort((a, b) => a.number - b.number);
    // Combined meld must be a valid set or run
    if (!(isSet(combined) || isRun(combined))) return false;
    this.#playedMelds[meldIdx] = combined;
    this.#hasPlayedMeld = true;
    return true;
  }

  async removeTilesFromMeld(meldIdx: number, tileIds: string[]): Promise<boolean> {
    if (meldIdx < 0 || meldIdx >= this.#playedMelds.length) return false;
    const meld = this.#playedMelds[meldIdx];
    const remaining = meld.filter((t) => !tileIds.includes(t.id));
    // remaining meld must either be empty or still a valid meld
    if (remaining.length > 0) {
      remaining.sort(compareTiles);
      if (!(isSet(remaining) || isRun(remaining))) return false;
    }
    this.#playedMelds[meldIdx] = remaining;
    return true;
  }

  computeScore(): number {
    const meldSum = this.#playedMelds.flat().reduce((s, t) => s + t.number, 0);
    const handSum = this.#hand.reduce((s, t) => s + t.number, 0);
    return meldSum - handSum + this.#bonus;
  }

  markHasPlayedMeld(): void {
    this.#hasPlayedMeld = true;
  }

  addBonus(points: number): void {
    this.#bonus += points;
  }

  render(area: HTMLElement, playerIdx: number, game: Futile): void {
    if (!area) return;
    // Render blank/backed tiles in each player's area to indicate hand size
    const handEl = area.querySelector('.player-hand') as HTMLElement | null;
    if (handEl) {
      handEl.innerHTML = '';
      this.#hand.forEach(() => {
        const tileEl = document.createElement('game-tile') as HTMLElement;
        tileEl.setAttribute('value', '');
        tileEl.setAttribute('type', 'number');
        tileEl.setAttribute('readonly', '');
        handEl.appendChild(tileEl);
      });
    }

    // Render played melds
    let playedEl = area.querySelector('.played-tiles') as HTMLElement | null;
    if (!playedEl) {
      playedEl = document.createElement('div');
      playedEl.className = 'played-tiles';
      area.appendChild(playedEl);
    }
    playedEl.innerHTML = '';

    for (let m = 0; m < this.#playedMelds.length; m++) {
      const tiles = this.#playedMelds[m];
      const meldEl = document.createElement('div');
      meldEl.className = 'meld';

      tiles.forEach((t) => {
        const el = document.createElement('game-tile') as HTMLElement;
        el.setAttribute('value', String(t.number));
        el.setAttribute('type', 'number');
        el.setAttribute('readonly', '');
        el.setAttribute('status', COLOUR_TO_STATUS[t.colour] || '');
        el.dataset.id = t.id;
        if (game.selectedMeldTileIds.has(t.id)) el.setAttribute('selected', '');
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // only allow selecting meld tiles when it's the human player's turn
          if (game.currentPlayer !== game.humanPlayer) return;
          const currentHasPlayed = game.players[game.currentPlayer].hasPlayedMeld;
          const handHasSelection = game.selectedIds.size > 0;
          if (handHasSelection && currentHasPlayed) {
            game.selectedMeldDestOwner = playerIdx;
            game.selectedMeldDestMeldIdx = m;
          }

          // Toggle selection of this meld tile (allowed even if player hasn't played a meld yet)
          if (game.selectedMeldTileIds.has(t.id)) {
            game.selectedMeldTileIds.delete(t.id);
            el.removeAttribute('selected');
          } else {
            // Prevent selecting matching tiles in other players' melds (same colour+number),
            // but allow selecting multiple identical tiles within the same player's melds.
            for (const sid of Array.from(game.selectedMeldTileIds)) {
              let found: { id: string; colour: string; number: number; owner: number; meldIdx: number } | null = null;
              for (let ownerIdx = 0; ownerIdx < game.players.length; ownerIdx++) {
                const p = game.players[ownerIdx];
                for (let mid = 0; mid < p.playedMelds.length; mid++) {
                  const meld = p.playedMelds[mid];
                  for (const mt of meld) {
                    if (mt.id === sid) {
                      found = { id: mt.id, colour: mt.colour, number: mt.number, owner: ownerIdx, meldIdx: mid };
                      break;
                    }
                  }
                  if (found) break;
                }
                if (found) break;
              }
              if (found && found.colour === t.colour && found.number === t.number) {
                if (found.owner !== playerIdx) {
                  game.selectedMeldTileIds.delete(found.id);
                }
              }
            }
            game.selectedMeldTileIds.add(t.id);
            el.setAttribute('selected', '');
          }
          game.renderAllHands();
        });
        meldEl.appendChild(el);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'meld-add';
      addBtn.title = 'Add selected tiles to this meld';
      const tile = document.createElement('game-tile');
      tile.setAttribute('value', '+');
      addBtn.appendChild(tile);
      addBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        // only allow adding to a meld when it's the human player's turn
        if (game.currentPlayer !== game.humanPlayer) return;
        await game.addToMeld(playerIdx, m);
        game.renderAllHands();
      });
      meldEl.appendChild(addBtn);
      playedEl.appendChild(meldEl);
    }

    area.classList.toggle('active', playerIdx === game.currentPlayer);
    const scoreEl = area.querySelector('.player-score') as HTMLElement | null;
    if (scoreEl) scoreEl.textContent = String(this.#score);
  }
}
