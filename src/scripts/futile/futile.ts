// Futile - multiplayer tile game (class-based)
// Split into modules: shared, deck, player, futile

import '../components/tile-component';
import type { TileStatus } from '../components/tile-component';
import { Tile, COLOUR_TO_STATUS } from './shared';
import { Deck } from './deck';
import { Player } from './player';

import { AIPlayer } from './ai-player';

export class Futile {
  playerCount = 2;
  players: Player[] = [];
  deck?: Deck;
  currentPlayer = 0;
  turnsThisRound = 0;
  pendingPasses: Array<{ tileId: string; from: number } | null> = [];
  selectedIds = new Set<string>();
  selectedMeldSourceOwner: number | null = null;
  selectedMeldSourceMeldIdx: number | null = null;
  selectedMeldDestOwner: number | null = null;
  selectedMeldDestMeldIdx: number | null = null;
  selectedMeldTileIds: Set<string> = new Set();
  // Track specific played-meld tile instances to avoid ambiguity when identical tiles exist
  // Key format: `<owner>|<meldIdx>|<tileId>`
  selectedMeldInstanceKeys: Set<string> = new Set();

  gameOver = false;

  // simple per-turn lock to prevent concurrent mutations
  turnBusy = false;
  // watchdog timer id to recover from stale turnBusy
  watchdogTimer: number | null = null;

  humanPlayer = 0;
  bots = new Map<number, AIPlayer>();

  // DOM
  messageEl: HTMLElement | null = null;
  playerAreas: HTMLElement[] = [];
  // help dialog elements
  helpButton: HTMLElement | null = null;
  helpDialog: HTMLDialogElement | null = null;
  closeHelpBtn: HTMLElement | null = null;
  // settings dialog elements
  settingsDialog: HTMLDialogElement | null = null;
  settingsBtn: HTMLElement | null = null;
  closeSettingsBtn: HTMLElement | null = null;
  // AI difficulty
  difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  // debug overlay
  // (debug overlay removed)

  constructor(playerCount = 2, humanPlayer = 0) {
    this.playerCount = Math.max(2, Math.min(4, playerCount));
    this.humanPlayer = Math.max(0, Math.min(this.playerCount - 1, humanPlayer));
    for (let i = 0; i < this.playerCount; i++) this.players.push(new Player(i));
  }

  init() {
    this.messageEl = document.getElementById('message');
    this.playerAreas = Array.from(document.querySelectorAll('.player-area')) as HTMLElement[];
    this.helpButton = document.getElementById('helpBtn');
    this.helpDialog = document.getElementById('helpDialog') as HTMLDialogElement | null;
    this.closeHelpBtn = document.getElementById('closeHelp');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsDialog = document.getElementById('settingsDialog') as HTMLDialogElement | null;
    this.closeSettingsBtn = document.getElementById('closeSettings');
    // load saved settings (player count, difficulty) before UI wiring
    this.loadSettings();
    this.initUI();
    this.wireControls();
    this.wireHelp();
    this.wireSettings();
    this.startNewGame();
  }

  wireHelp() {
    if (this.helpButton && this.helpDialog) {
      this.helpButton.addEventListener('click', () => this.openHelp());
    }
    if (this.closeHelpBtn && this.helpDialog) {
      this.closeHelpBtn.addEventListener('click', () => this.helpDialog?.close());
    }
    if (this.helpDialog) {
      this.helpDialog.addEventListener('click', (ev) => {
        if (ev.target === this.helpDialog) this.helpDialog?.close();
      });
    }
  }

  openHelp() {
    if (!this.helpDialog) return;
    try {
      this.helpDialog.showModal();
    } catch {
      // fallback for browsers without dialog support
      (this.helpDialog as any).open = true;
    }
  }

  wireSettings() {
    if (this.settingsBtn && this.settingsDialog) {
      this.settingsBtn.addEventListener('click', () => this.openSettings());
    }
    if (this.closeSettingsBtn && this.settingsDialog) {
      this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    }
    if (this.settingsDialog) {
      this.settingsDialog.addEventListener('click', (ev) => {
        if (ev.target === this.settingsDialog) this.closeSettings();
      });
    }
  }

  openSettings() {
    if (!this.settingsDialog) return;
    // reflect current values
    const pcInput = this.settingsDialog.querySelector(
      `input[name="playerCount"][value="${this.playerCount}"]`,
    ) as HTMLInputElement | null;
    if (pcInput) pcInput.checked = true;
    const diffInput = this.settingsDialog.querySelector(
      `input[name="difficulty"][value="${this.difficulty}"]`,
    ) as HTMLInputElement | null;
    if (diffInput) diffInput.checked = true;
    try {
      this.settingsDialog.showModal();
    } catch {
      // fallback for browsers without dialog support
      (this.settingsDialog as any).open = true;
    }
  }

  closeSettings() {
    if (!this.settingsDialog) return;
    const diffSel = this.settingsDialog.querySelector('input[name="difficulty"]:checked') as
      | HTMLInputElement
      | null;
    if (diffSel) this.difficulty = diffSel.value as 'easy' | 'medium' | 'hard';
    try {
      this.settingsDialog.close();
    } catch {
      (this.settingsDialog as any).open = false;
    }
    this.saveSettings();
  }

  saveSettings() {
    try {
      const payload = { playerCount: this.playerCount, difficulty: this.difficulty };
      localStorage.setItem('futile_settings', JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('futile_settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.playerCount === 'number') this.playerCount = Math.max(2, Math.min(4, parsed.playerCount));
      if (parsed.difficulty === 'easy' || parsed.difficulty === 'medium' || parsed.difficulty === 'hard') {
        this.difficulty = parsed.difficulty;
      }
      // reflect playerCount in UI radios if present
      const pcInput = document.querySelector(
        `input[name="playerCount"][value="${this.playerCount}"]`,
      ) as HTMLInputElement | null;
      if (pcInput) pcInput.checked = true;
      // reflect difficulty in dialog radios
      const diffInput = document.querySelector(
        `input[name="difficulty"][value="${this.difficulty}"]`,
      ) as HTMLInputElement | null;
      if (diffInput) diffInput.checked = true;
    } catch {
      // ignore parse errors
    }
  }

  // debug overlay removed

  startWatchdog(timeout = 5000) {
    this.clearWatchdog();
    // eslint-disable-next-line no-restricted-globals
    this.watchdogTimer = window.setTimeout(() => {
      if (this.turnBusy) {
        // eslint-disable-next-line no-console
        console.warn('watchdog cleared stale turnBusy flag');
        this.turnBusy = false;
      }
      this.clearWatchdog();
    }, timeout) as unknown as number;
  }

  clearWatchdog() {
    if (this.watchdogTimer != null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  // debug overlay removed

  setMessage(text: string) {
    if (this.messageEl) this.messageEl.textContent = text;
  }

  // Keep `selectedMeldTileIds` in sync with `selectedMeldInstanceKeys`.
  syncSelectedMeldIdsFromInstances() {
    // If we have instance keys, rebuild the id-based set from them.
    if (this.selectedMeldInstanceKeys.size > 0) {
      this.selectedMeldTileIds.clear();
      for (const key of this.selectedMeldInstanceKeys) {
        const parts = key.split('|');
        const id = parts[2];
        if (id) this.selectedMeldTileIds.add(id);
      }
      return;
    }

    // If there are no instance keys but there are id-only selections and a source owner/index,
    // generate instance keys for the selected id(s) using the selected source owner/index,
    // but only if that tile id actually exists in the referenced source meld. This avoids
    // incorrectly mapping an id to a different meld when identical tiles exist elsewhere.
    if (this.selectedMeldInstanceKeys.size === 0 && this.selectedMeldTileIds.size > 0) {
      if (this.selectedMeldSourceOwner !== null && this.selectedMeldSourceMeldIdx !== null) {
        const owner = this.selectedMeldSourceOwner;
        const idx = this.selectedMeldSourceMeldIdx;
        const player = this.players[owner];
        if (player && player.playedMelds && player.playedMelds[idx]) {
          const sourceMeld = player.playedMelds[idx];
          const availableIds = new Set(sourceMeld.map((t) => t.id));
          for (const id of Array.from(this.selectedMeldTileIds)) {
            if (availableIds.has(id)) {
              const k = `${owner}|${idx}|${id}`;
              this.selectedMeldInstanceKeys.add(k);
            }
          }
        }
      }
    }
  }

  notify(text: string) {
    // Show a blocking alert only when the human is the active player.
    if (this.currentPlayer === this.humanPlayer) {
      // eslint-disable-next-line no-alert
      alert(text);
    } else {
      // For AI players, avoid blocking alerts — log and display a non-blocking message.
      // eslint-disable-next-line no-console
      console.warn('AI suppressed alert:', text);
      this.setMessage(typeof text === 'string' ? text : String(text));
    }
  }

  clearSelectedMeldSelections() {
    // Clear both id-based and instance-based selection state and reset selection anchors
    this.selectedMeldTileIds.clear();
    this.selectedMeldInstanceKeys.clear();
    this.selectedMeldSourceOwner = null;
    this.selectedMeldSourceMeldIdx = null;
    this.selectedMeldDestOwner = null;
    this.selectedMeldDestMeldIdx = null;
  }

  initUI() {
    const radios = document.querySelectorAll(
      'input[name="playerCount"]',
    ) as NodeListOf<HTMLInputElement>;
    radios.forEach((r) => {
      r.addEventListener('change', async () => {
        const val = parseInt(r.value, 10);
        if (!isNaN(val)) {
          this.playerCount = Math.max(2, Math.min(4, val));
          this.players = [];
          for (let i = 0; i < this.playerCount; i++) this.players.push(new Player(i));
          for (let i = 0; i < this.playerAreas.length; i++) {
            this.playerAreas[i].style.display = i < this.playerCount ? '' : 'none';
          }
          await this.startNewGame();
          this.saveSettings();
        }
      });
    });
  }

  onTileClick(playerIdx: number, tileId: string, el: HTMLElement) {
    if (this.gameOver) return;
    if (playerIdx !== this.currentPlayer) return;
    if (this.selectedIds.has(tileId)) {
      this.selectedIds.delete(tileId);
      el.removeAttribute('selected');
    } else {
      this.selectedIds.add(tileId);
      el.setAttribute('selected', '');
    }
  }

  renderAllHands() {
    // ensure instance/id selection sets are synchronized before rendering
    this.syncSelectedMeldIdsFromInstances();
    // Always render the current state so end-of-game updates are visible;
    // `gameOver` is used to block further actions, not rendering.
    for (let i = 0; i < this.playerAreas.length; i++) {
      const area = this.playerAreas[i];
      if (!area) continue;
      // show/hide by class according to configured player count
      area.classList.toggle('show', i < this.playerCount);
      if (i < this.playerCount) {
        this.players[i].render(area, i, this);
      } else {
        // clear any leftover DOM for non-participating areas
        const played = area.querySelector('.played-tiles');
        if (played) played.innerHTML = '';
        const scoreEl = area.querySelector('.player-score') as HTMLElement | null;
        if (scoreEl) scoreEl.textContent = '';
        area.classList.remove('active');
      }
    }
    // Render current player's interactive rack into #tileRack
    const rack = document.getElementById('tileRack') as HTMLElement | null;
    if (rack) {
      rack.innerHTML = '';
      const current = this.players[this.currentPlayer];
      if (this.currentPlayer === this.humanPlayer) {
        current.hand.forEach((tile) => {
          const tileEl = document.createElement('game-tile') as HTMLElement;
          tileEl.setAttribute('value', String(tile.number));
          tileEl.setAttribute('type', 'number');
          tileEl.setAttribute('readonly', '');
          tileEl.dataset.id = tile.id;
          tileEl.setAttribute('status', COLOUR_TO_STATUS[tile.colour]);
          if (this.selectedIds.has(tile.id)) tileEl.setAttribute('selected', '');
          const pending = this.pendingPasses.find(
            (p) => p && p.tileId === tile.id && p.from === this.currentPlayer,
          );
          if (pending) tileEl.setAttribute('pending-pass', '');
          tileEl.addEventListener('click', () =>
            this.onTileClick(this.currentPlayer, tile.id, tileEl),
          );
          rack.appendChild(tileEl);
        });
      } else {
        // It's a bot's turn — render blank, non-interactive tiles so human cannot see hand
        current.hand.forEach(() => {
          const tileEl = document.createElement('game-tile') as HTMLElement;
          tileEl.setAttribute('value', '');
          tileEl.setAttribute('type', 'number');
          tileEl.setAttribute('readonly', '');
          rack.appendChild(tileEl);
        });
      }
    }
    this.renderDraw();
    this.updateScores();
  }

  renderDraw() {
    this.setMessage(`Draw pile: ${this.deck?.size} — Player ${this.currentPlayer + 1}'s turn`);
  }

  updateScores() {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.score = p.computeScore();
      const area = this.playerAreas[i];
      if (!area) continue;
      const scoreEl = area.querySelector('.player-score') as HTMLElement | null;
      if (scoreEl) scoreEl.textContent = String(p.score);
    }
  }

  getSelectedTilesFromHand(): Tile[] {
    const sel = Array.from(this.selectedIds);
    const hand = this.players[this.currentPlayer].hand;
    return sel.map((id) => hand.find((t) => t.id === id)!).filter(Boolean);
  }

  effectiveHandCount(playerIdx: number): number {
    // Outgoing pending passes count as part of a player's hand and therefore
    // prevent the game from ending until the tile is actually removed when
    // `applyPendingPasses()` runs.
    let count = this.players[playerIdx].hand.length;
    if (Array.isArray(this.pendingPasses) && this.pendingPasses.length > 0) {
      for (const p of this.pendingPasses) {
        if (p && p.from === playerIdx) count++;
      }
    }
    return count;
  }

  checkForWin(): boolean {
    if (this.gameOver) return false;
    const gameEnded = this.players.some((p,i) => this.effectiveHandCount(i) === 0);
    this.updateScores();
    this.renderAllHands();

    if (gameEnded) {
      // Mark the game as over so no further turns or AI actions proceed.
      this.gameOver = true;
      const winner = [...this.players].sort((a, b) => b.score - a.score)[0];
      this.setMessage(`Player ${winner.id + 1} wins with a score of ${winner.score}!`);
    }
    return gameEnded;
  }

  isSet(tiles: Tile[]): boolean {
    if (tiles.length < 3) return false;
    const num = tiles[0].number;
    return tiles.every((t) => t.number === num);
  }

  isRun(tiles: Tile[]): boolean {
    if (tiles.length < 3) return false;
    const colour = tiles[0].colour;
    if (!tiles.every((t) => t.colour === colour)) return false;
    const nums = tiles.map((t) => t.number).sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) return false;
    return true;
  }

  async playSelected() {
    if (this.turnBusy) return;
    this.turnBusy = true;
    this.startWatchdog();
    try {
      if (this.gameOver) return;
      const tiles = this.getSelectedTilesFromHand();
      if (tiles.length === 0) {
        this.notify('Select tiles to play.');
        return;
      }

      if (this.selectedMeldDestOwner !== null && this.selectedMeldDestMeldIdx !== null) {
        const hasPlayed = this.players[this.currentPlayer].hasPlayedMeld;
          if (!hasPlayed) {
          this.notify('You must have played at least one meld previously before adding to existing melds.');
          return;
        }
        const owner = this.selectedMeldDestOwner;
        const meldIdx = this.selectedMeldDestMeldIdx;
        const target = this.players[owner].playedMelds[meldIdx];
        const targetIsSet = this.isSet(target);
        const targetIsRun = this.isRun(target);
        if (targetIsSet) {
          const num = target[0].number;
          if (!tiles.every((t) => t.number === num)) {
            this.notify('All tiles added to this set must have the same number as the set.');
            return;
          }
          tiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
          await this.players[owner].updateMeld(meldIdx, tiles);
          this.selectedIds.clear();
          this.selectedMeldDestOwner = null;
          this.selectedMeldDestMeldIdx = null;
          if (this.checkForWin()) return;
          this.renderAllHands();
          return;
        } else if (targetIsRun) {
          const colour = target[0].colour;
          if (!tiles.every((t) => t.colour === colour)) {
            this.notify('Tiles added to this run must be the same colour as the run.');
            return;
          }
          const existingNums = target.map((t) => t.number);
          const newNums = tiles.map((t) => t.number);
          const combinedNums = Array.from(new Set(existingNums.concat(newNums))).sort(
            (a, b) => a - b,
          );
          if (
            combinedNums.length !==
            existingNums.length + newNums.filter((n) => !existingNums.includes(n)).length
          ) {
            this.notify('Cannot add duplicate numbers into a run.');
            return;
          }
          const min = combinedNums[0];
          const max = combinedNums[combinedNums.length - 1];
          if (max - min + 1 !== combinedNums.length) {
            this.notify('Added tiles must extend the run so the combined tiles are consecutive.');
            return;
          }
          tiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
          await this.players[owner].updateMeld(meldIdx, tiles);
          this.selectedIds.clear();
          this.selectedMeldDestOwner = null;
          this.selectedMeldDestMeldIdx = null;
          if (this.checkForWin()) return;
          this.renderAllHands();
          return;
        } else {
          this.notify('Target meld is neither a valid set nor run.');
          return;
        }
      }

      if (this.isSet(tiles) || this.isRun(tiles)) {
        tiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
        const added = await this.players[this.currentPlayer].addMeld(tiles.slice());
        if (!added) {
          this.notify('Failed to create meld — invalid combination.');
            return;
        }
        this.selectedIds.clear();
        this.players[this.currentPlayer].markHasPlayedMeld();
        if (this.checkForWin()) return;
        this.renderAllHands();
      } else {
        this.notify(
          'Invalid meld. A valid set is 3+ of the same number. A valid run is 3+ of same colour and consecutive numbers.',
        );
      }
    } finally {
      this.turnBusy = false;
      this.clearWatchdog();
    }
  }

  async startTurn() {
    if (this.gameOver) return;
    const tile = this.deck?.draw();
    if (tile) this.players[this.currentPlayer].receiveTile(tile);
    this.selectedIds.clear();
    this.turnsThisRound++;
    this.renderAllHands();
    // If the current player is an AI (not the human), ensure a bot exists and schedule its actions.
    if (this.currentPlayer !== this.humanPlayer) {
      let bot = this.bots.get(this.currentPlayer);
      if (!bot) {
        // lazily create a bot if one wasn't instantiated (defensive)
        bot = new (await import('./ai-player').then((m) => m.AIPlayer))(this.currentPlayer);
        this.bots.set(this.currentPlayer, bot as any);
      }
      // defensive: if a stale busy flag remains, clear it to avoid a stall
      if (this.turnBusy) {
        // eslint-disable-next-line no-console
        console.warn('startTurn clearing stale turnBusy flag before scheduling AI');
        this.turnBusy = false;
        this.clearWatchdog();
      }
      // debug: schedule info (visible)
      // schedule AI turn and catch errors so the game doesn't stall
      setTimeout(() => {
        try {
          // AI.takeTurn is async — call and catch promise rejections
          (bot as any).takeTurn(this).catch((err: unknown) => {
            // Log and advance the turn to avoid stalling
            // eslint-disable-next-line no-console
            console.error('AI error:', err);
            void this.endTurn();
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('AI scheduling error:', err);
          void this.endTurn();
        }
      }, 180);
    }
  }

  async endTurn() {
    if (this.gameOver) return;
    const selectedForPass = Array.from(this.selectedIds);
    let passId: string | null = null;
    // Human players must explicitly select one tile. For AI players, auto-pick a tile if none or multiple selected.
    if (this.currentPlayer === this.humanPlayer) {
      if (selectedForPass.length !== 1) {
        this.notify(
          'You must select exactly one tile from your hand to pass to the next player before ending your turn.',
        );
        return;
      }
      passId = selectedForPass[0];
    } else {
      if (selectedForPass.length === 1) passId = selectedForPass[0];
      else {
        const hand = this.players[this.currentPlayer].hand;
        if (hand.length > 0) {
          // choose a deterministic tile (first) so AI behavior is predictable
          passId = hand[0].id;
        } else {
          passId = null;
        }
      }
    }
    if (!passId) {
      // nothing to pass — for humans this was handled above; for AI, just advance without a pass
      if (this.currentPlayer === this.humanPlayer) return;
    }
    // Do NOT remove the tile from the player's hand yet — ownership remains until passes applied
    const receiver = (this.currentPlayer + 1) % this.playerCount;
    this.pendingPasses[receiver] = { tileId: passId as string, from: this.currentPlayer };

    // Clear all selection state at end of turn so no stale selections remain
    this.selectedIds.clear();
    this.clearSelectedMeldSelections();
    this.selectedMeldSourceOwner = null;
    this.selectedMeldSourceMeldIdx = null;
    this.selectedMeldDestOwner = null;
    this.selectedMeldDestMeldIdx = null;

    this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
    this.renderAllHands();

    if (this.turnsThisRound >= this.playerCount) {
      this.applyPendingPasses();
      this.turnsThisRound = 0;
    }

    // clear any stale busy flag before starting next player's turn
    if (this.turnBusy) {
      // eslint-disable-next-line no-console
      console.warn('endTurn clearing stale turnBusy flag');
      this.turnBusy = false;
    }

    await this.startTurn();
  }

  applyPendingPasses() {
    for (let i = 0; i < this.playerCount; i++) {
      const pending = this.pendingPasses[i];
      if (pending) {
        const from = pending.from;
        const tileId = pending.tileId;
        const tile = this.players[from].removeTileById(tileId);
        if (tile) this.players[i].receiveTile(tile);
        this.pendingPasses[i] = null;
      }
    }
    // After passes applied, just re-render; passing tiles should not trigger game end.
    this.renderAllHands();
  }

  async startNewGame() {
    this.deck = new Deck();
    this.currentPlayer = 0;
    this.turnsThisRound = 0;
    this.pendingPasses = new Array(this.playerCount).fill(null);
    this.selectedIds.clear();
    this.selectedMeldSourceOwner = null;
    this.selectedMeldSourceMeldIdx = null;
    this.selectedMeldDestOwner = null;
    this.selectedMeldDestMeldIdx = null;
    this.clearSelectedMeldSelections();
    this.players = [];
    for (let i = 0; i < this.playerCount; i++) this.players.push(new Player(i));
    // create AI players for all non-human players
    this.bots.clear();
    for (let i = 0; i < this.playerCount; i++) {
      if (i === this.humanPlayer) continue;
      this.bots.set(i, new AIPlayer(i));
    }
    for (let k = 0; k < 10; k++) {
      for (let p = 0; p < this.playerCount; p++) {
        const tile = this.deck.draw();
        if (!tile) break;
        this.players[p].receiveTile(tile);
      }
    }
    this.renderAllHands();
    this.startTurn();
  }

  wireControls() {
    const createBtn = document.getElementById('meldButton') as HTMLButtonElement;
    createBtn?.addEventListener('click', () => this.createMeld());
    const endBtn = document.getElementById('passButton') as HTMLButtonElement;
    endBtn?.addEventListener('click', () => this.endTurn());
  }

  async createMeld() {
    if (this.turnBusy) return;
    this.turnBusy = true;
    this.startWatchdog();
    try {
      if (this.gameOver) return;
      const handTiles = this.getSelectedTilesFromHand();
      const stolenTiles: Tile[] = [];
      // collect stolen tiles from ANY melds where tiles are selected
      const removals: Array<{ owner: number; meldIdx: number; ids: string[] }> = [];
      for (let owner = 0; owner < this.players.length; owner++) {
        const player = this.players[owner];
        for (let mi = 0; mi < player.playedMelds.length; mi++) {
          const meld = player.playedMelds[mi];
          const idsToRemove = meld.map((t) => t.id).filter((id) => this.selectedMeldTileIds.has(id));
          if (idsToRemove.length > 0) {
              const remaining = meld.filter((t) => !idsToRemove.includes(t.id));
              if (remaining.length > 0 && !(this.isSet(remaining) || this.isRun(remaining))) {
                this.notify('Cannot remove those tiles — one of the source melds would become invalid.');
                return;
              }
            removals.push({ owner, meldIdx: mi, ids: idsToRemove });
            // add the actual Tile objects to stolenTiles
            for (const t of meld) if (idsToRemove.includes(t.id)) stolenTiles.push(t);
          }
        }
      }

      const combined = [...stolenTiles, ...handTiles];
      if (combined.length === 0) {
        this.notify('Select tiles from your hand or a meld to create a meld.');
        return;
      }

      // Prevent creating a meld solely from tiles stolen from other melds
      // without including at least one tile from the player's hand.
      if (stolenTiles.length > 0 && handTiles.length === 0) {
        this.notify('You must include at least one tile from your hand when creating a meld from stolen tiles.');
        return;
      }
      // Prevent creating a meld using only tiles stolen from other players' melds.
      if (stolenTiles.length > 0 && handTiles.length === 0) {
        this.notify('You must include at least one tile from your hand when creating a meld from existing melds.');
        return;
      }
      if (!(this.isSet(combined) || this.isRun(combined))) {
        this.notify('Selected tiles do not form a valid meld.');
        return;
      }

      // Remove tiles from sources (may be multiple)
      for (const r of removals) {
        await this.players[r.owner].removeTilesFromMeld(r.meldIdx, r.ids);
      }
      handTiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));

      const added = await this.players[this.currentPlayer].addMeld(combined.slice());
      if (!added) {
        this.notify('Failed to create meld — resulting meld is invalid.');
        return;
      }
      this.selectedIds.clear();
      this.clearSelectedMeldSelections();
      this.selectedMeldSourceOwner = null;
      this.selectedMeldSourceMeldIdx = null;
      if (this.checkForWin()) return;
      this.renderAllHands();
    } finally {
      this.turnBusy = false;
      this.clearWatchdog();
    }
  }

  async addToMeld(targetOwner: number, targetMeldIdx: number): Promise<boolean> {
    if (this.turnBusy) {
      // rejected due to turnBusy
      return false;
    }
    this.turnBusy = true;
    this.startWatchdog();
    try {
      if (this.gameOver) return false;
      // Player must have played at least one meld previously before adding to existing melds.
      const hasPlayed = this.players[this.currentPlayer].hasPlayedMeld;
      if (!hasPlayed) {
        this.notify('You must have played at least one meld previously before adding to existing melds.');
        return false;
      }
      const handTiles = this.getSelectedTilesFromHand();
      const stolenTiles: Tile[] = [];
      const removals: Array<{ owner: number; meldIdx: number; ids: string[] }> = [];
      for (let owner = 0; owner < this.players.length; owner++) {
        const player = this.players[owner];
        for (let mi = 0; mi < player.playedMelds.length; mi++) {
          const meld = player.playedMelds[mi];
          const idsToRemove = meld.map((t) => t.id).filter((id) => this.selectedMeldTileIds.has(id));
          if (idsToRemove.length > 0) {
            const remaining = meld.filter((t) => !idsToRemove.includes(t.id));
            if (remaining.length > 0 && !(this.isSet(remaining) || this.isRun(remaining))) {
              this.notify('Cannot remove those tiles — one of the source melds would become invalid.');
              return false;
            }
            removals.push({ owner, meldIdx: mi, ids: idsToRemove });
            for (const t of meld) if (idsToRemove.includes(t.id)) stolenTiles.push(t);
          }
        }
      }

      const combined = [...stolenTiles, ...handTiles];
      if (combined.length === 0) {
        this.notify('Select tiles from your hand or a meld to add.');
        return false;
      }

      // Prevent moving tiles directly from one meld to another without playing at least one tile from your hand
      if (stolenTiles.length > 0 && handTiles.length === 0) {
        this.notify('You must include at least one tile from your hand when moving tiles between melds.');
        return false;
      }

      const destMeld = this.players[targetOwner].playedMelds[targetMeldIdx];
      if (!destMeld) {
        this.notify('Destination meld no longer exists.');
        return false;
      }
      const dstIsSet = this.isSet(destMeld);
      const dstIsRun = this.isRun(destMeld);
      if (dstIsSet) {
        const num = destMeld[0].number;
        if (!combined.every((t) => t.number === num)) {
          this.notify('Cannot add: combined tiles are not the same number required by destination set.');
          return false;
        }
      } else if (dstIsRun) {
        const colour = destMeld[0].colour;
        if (!combined.every((t) => t.colour === colour)) {
          this.notify('Cannot add: combined tiles are not the same colour required by destination run.');
          return false;
        }
        const existingNums = destMeld.map((t) => t.number);
        const newNums = combined.map((t) => t.number);
        const combinedNums = Array.from(new Set(existingNums.concat(newNums))).sort((a, b) => a - b);
        if (
          combinedNums.length !==
          existingNums.length + newNums.filter((n) => !existingNums.includes(n)).length
        ) {
          this.notify('Cannot add duplicate numbers into a run.');
          return false;
        }
        const min = combinedNums[0];
        const max = combinedNums[combinedNums.length - 1];
        if (max - min + 1 !== combinedNums.length) {
          this.notify('Added tiles must extend the run so the combined tiles are consecutive.');
          return false;
        }
      } else {
        this.notify('Destination meld is neither a valid set nor run.');
        return false;
      }

      // perform removals and update destination (may be multiple sources)
      // debug
      for (const r of removals) {
        await this.players[r.owner].removeTilesFromMeld(r.meldIdx, r.ids);
      }
      handTiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
      // debug: about to updateMeld
      const ok = await this.players[targetOwner].updateMeld(targetMeldIdx, combined.slice());
      if (!ok) {
        this.notify('Failed to add tiles to destination meld — validation failed.');
        return false;
      }

      this.selectedIds.clear();
      this.clearSelectedMeldSelections();
      this.selectedMeldSourceOwner = null;
      this.selectedMeldSourceMeldIdx = null;
      this.selectedMeldDestOwner = null;
      this.selectedMeldDestMeldIdx = null;
      if (this.checkForWin()) return true;
      this.renderAllHands();
      return true;
    } finally {
      this.turnBusy = false;
      this.clearWatchdog();
    }
  }

  async stealCreate() {
    if (this.turnBusy) return;
    this.turnBusy = true;
    this.startWatchdog();
    try {
      if (this.gameOver) return;
      if (this.selectedMeldSourceOwner === null || this.selectedMeldSourceMeldIdx === null) {
        this.notify('Select a source meld to steal from first.');
        return;
      }
      if (this.selectedMeldTileIds.size === 0) {
        this.notify('Select one or more tiles from the source meld to steal.');
        return;
      }
      const handTiles = this.getSelectedTilesFromHand();
      if (handTiles.length === 0) {
        this.notify('Select one or more tiles from your hand to use with stolen tiles.');
        return;
      }
      const owner = this.selectedMeldSourceOwner!;
      const meldIdx = this.selectedMeldSourceMeldIdx!;
      if (!this.players[owner] || !this.players[owner].playedMelds[meldIdx]) {
        this.notify('The selected source meld is no longer available. Please re-select a source meld.');
        this.selectedMeldSourceOwner = null;
        this.selectedMeldSourceMeldIdx = null;
        this.clearSelectedMeldSelections();
        this.renderAllHands();
        return;
      }
      const sourceMeld = this.players[owner].playedMelds[meldIdx];
      const stolenTiles: Tile[] = sourceMeld.filter((t) => this.selectedMeldTileIds.has(t.id));
      const remaining = sourceMeld.filter((t) => !this.selectedMeldTileIds.has(t.id));
      if (remaining.length > 0 && !(this.isSet(remaining) || this.isRun(remaining))) {
        this.notify('Cannot steal these tiles — the original meld would become invalid.');
        return;
      }
      const combined = [...stolenTiles, ...handTiles];
      if (!(this.isSet(combined) || this.isRun(combined))) {
        this.notify('Stolen tiles plus selected hand tiles do not form a valid meld.');
        return;
      }
      const tileIds = Array.from(this.selectedMeldTileIds);
      await this.players[owner].removeTilesFromMeld(meldIdx, tileIds);
      handTiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
      const added = await this.players[this.currentPlayer].addMeld(combined);
      if (!added) {
        this.notify('Failed to create meld from stolen tiles — resulting meld invalid.');
        return;
      }
      this.clearSelectedMeldSelections();
      this.selectedMeldSourceOwner = null;
      this.selectedMeldSourceMeldIdx = null;
      this.selectedIds.clear();
      if (this.checkForWin()) return;
      this.renderAllHands();
    } finally {
      this.turnBusy = false;
      this.clearWatchdog();
    }
  }

  async stealAdd() {
    if (this.turnBusy) return;
    this.turnBusy = true;
    this.startWatchdog();
    try {
      if (this.gameOver) return;
      if (this.selectedMeldSourceOwner === null || this.selectedMeldSourceMeldIdx === null) {
        this.notify('Select a source meld to steal from first.');
        return;
      }
      if (this.selectedMeldTileIds.size === 0) {
        this.notify('Select one or more tiles from the source meld to steal.');
        return;
      }
      if (this.selectedMeldDestOwner === null || this.selectedMeldDestMeldIdx === null) {
        this.notify(
          'Select a destination meld to add to (click a meld while you have hand tiles selected).',
        );
        return;
      }
      const handTiles = this.getSelectedTilesFromHand();
      if (handTiles.length === 0) {
        this.notify('Select one or more tiles from your hand to use with stolen tiles.');
        return;
      }
      const srcOwner = this.selectedMeldSourceOwner!;
      const srcIdx = this.selectedMeldSourceMeldIdx!;
      const dstOwner = this.selectedMeldDestOwner!;
      const dstIdx = this.selectedMeldDestMeldIdx!;
      const sourceMeld = this.players[srcOwner].playedMelds[srcIdx];
      const destMeld = this.players[dstOwner].playedMelds[dstIdx];
      const stolenTiles: Tile[] = sourceMeld.filter((t) => this.selectedMeldTileIds.has(t.id));
      const remaining = sourceMeld.filter((t) => !this.selectedMeldTileIds.has(t.id));
      if (remaining.length > 0 && !(this.isSet(remaining) || this.isRun(remaining))) {
        this.notify('Cannot steal these tiles — the original meld would become invalid.');
        return;
      }
      const combined = [...stolenTiles, ...handTiles];
      const dstIsSet = this.isSet(destMeld);
      const dstIsRun = this.isRun(destMeld);
      if (dstIsSet) {
        const num = destMeld[0].number;
        if (!combined.every((t) => t.number === num)) {
          this.notify('Cannot add: combined tiles are not the same number required by destination set.');
          return;
        }
      } else if (dstIsRun) {
        const colour = destMeld[0].colour;
        if (!combined.every((t) => t.colour === colour)) {
          this.notify('Cannot add: combined tiles are not the same colour required by destination run.');
          return;
        }
        const existingNums = destMeld.map((t) => t.number);
        const newNums = combined.map((t) => t.number);
        const combinedNums = Array.from(new Set(existingNums.concat(newNums))).sort((a, b) => a - b);
        if (
          combinedNums.length !==
          existingNums.length + newNums.filter((n) => !existingNums.includes(n)).length
        ) {
          this.notify('Cannot add duplicate numbers into a run.');
          return;
        }
        const min = combinedNums[0];
        const max = combinedNums[combinedNums.length - 1];
        if (max - min + 1 !== combinedNums.length) {
          this.notify('Added tiles must extend the run so the combined tiles are consecutive.');
          return;
        }
      } else {
        this.notify('Destination meld is neither a valid set nor run.');
        return;
      }
      const tileIds = Array.from(this.selectedMeldTileIds);
      await this.players[srcOwner].removeTilesFromMeld(srcIdx, tileIds);
      handTiles.forEach((t) => this.players[this.currentPlayer].removeTileById(t.id));
      await this.players[dstOwner].updateMeld(dstIdx, combined);
      this.clearSelectedMeldSelections();
      this.selectedMeldSourceOwner = null;
      this.selectedMeldSourceMeldIdx = null;
      this.selectedMeldDestOwner = null;
      this.selectedMeldDestMeldIdx = null;
      this.selectedIds.clear();
      if (this.checkForWin()) return;
      this.renderAllHands();
    } finally {
      this.turnBusy = false;
      this.clearWatchdog();
    }
  }
}

// (end Player class)

// bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const game = new Futile(2, 0); // human player is player 1 (index 0)
  game.init();
});
