/**
 * @fileoverview Wordley - A Wordle-style word guessing game.
 * Features: configurable word lengths (4-6), timer mode, 1-2 player support,
 * localStorage persistence for settings and statistics.
 * @module game
 */

// Side-effect import to register the custom element
import '../components/tile-component';
import type {
  GameTile,
  TileStatus,
  TileInputEventDetail,
  TileKeydownEventDetail,
} from '../components/tile-component';

// Type definitions
type LetterStatus = 'absent' | 'present' | 'correct';
type MessageTone = 'info' | 'error' | 'success';
type GameMode = 'singlePlayer' | 'twoPlayer';

interface Definition {
  partOfSpeech: string;
  definition: string;
}

interface GameSettings {
  wordLength: number;
  timerDuration: number;
  playerCount: number;
}

interface SinglePlayerStats {
  [guesses: number]: number;
  failed: number;
}

interface TwoPlayerStats {
  player1: { [wordLength: number]: { wins: number; losses: number } };
  player2: { [wordLength: number]: { wins: number; losses: number } };
  draws: { [wordLength: number]: number };
}

interface GameStats {
  singlePlayer: { [wordLength: number]: SinglePlayerStats };
  twoPlayer: TwoPlayerStats;
}

interface GameOptions {
  boardId?: string;
  formId?: string;
  lengthSelectId?: string;
  resetButtonId?: string;
  alphaLeftId?: string;
  alphaRightId?: string;
  buttonSelector?: string;
  allowedWords?: string[] | null;
  wordLength?: number;
  maxRows?: number;
  board?: HTMLElement | null;
  form?: HTMLFormElement | null;
  lengthSelect?: HTMLSelectElement | null;
  resetButton?: HTMLButtonElement | null;
  alphaLeft?: HTMLElement | null;
  alphaRight?: HTMLElement | null;
  button?: HTMLButtonElement | null;
  messageBox?: HTMLElement | null;
}

/** All uppercase letters A-Z. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Priority order for letter statuses (higher wins). */
const STATUS_PRIORITY: Readonly<Record<LetterStatus, number>> = Object.freeze({
  absent: 0,
  present: 1,
  correct: 2,
});

/**
 * Fetches the word list JSON for the given word length.
 * @param length - The word length (4, 5, or 6).
 * @returns Array of allowed words.
 */
async function loadWords(length = 5): Promise<string[]> {
  const response = await fetch(`./words-${length}-letter.json`);
  if (!response.ok) throw new Error(`Unable to load words-${length}-letter.json`);
  return response.json();
}

/**
 * Fetches definitions of a word from the Dictionary API.
 * Returns the first definition for each part of speech.
 * @param word - The word to look up.
 * @returns Array of definitions or null.
 */
async function fetchDefinition(word: string): Promise<Definition[] | null> {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!response.ok) return null;
    const data = await response.json();
    const meanings = data?.[0]?.meanings;
    if (!meanings || meanings.length === 0) return null;

    const results: Definition[] = [];
    for (const meaning of meanings) {
      const partOfSpeech = meaning.partOfSpeech;
      const definition = meaning.definitions?.[0]?.definition;
      if (partOfSpeech && definition) {
        results.push({ partOfSpeech, definition });
      }
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

/**
 * Wordle-style word guessing game with support for:
 * - Configurable word lengths (4-6 letters)
 * - Timer mode with visual progress bar
 * - 1-2 player modes with alternating turns
 * - Statistics tracking persisted to localStorage
 * - Alphabet status display showing used letters
 * - Word definitions fetched from Dictionary API
 *
 * @example
 * const game = new Wordley({ wordLength: 5 });
 * await game.init();
 */
export class Wordley {
  /** Storage key for game statistics. */
  static readonly STATS_KEY = 'wordley_stats';
  /** Storage key for game settings. */
  static readonly SETTINGS_KEY = 'wordley_settings';

  // Private fields for DOM elements
  #board: HTMLElement | null = null;
  #form: HTMLFormElement | null = null;
  #button: HTMLButtonElement | null = null;
  #resetButton: HTMLButtonElement | null = null;
  #lengthSelect: HTMLSelectElement | null = null;
  #lengthValue: HTMLElement | null = null;
  #messageBox: HTMLElement | null = null;
  #rowTemplate: HTMLTemplateElement | null = null;
  #letterInputs: GameTile[] = [];
  #alphaCols: (HTMLElement | null)[] = [];
  #settingsDialog: HTMLDialogElement | null = null;
  #settingsBtn: HTMLElement | null = null;
  #closeSettingsBtn: HTMLElement | null = null;
  #timerSelect: HTMLSelectElement | null = null;
  #playerCountInputs: NodeListOf<HTMLInputElement> | HTMLInputElement[] = [];
  #turnIndicator: HTMLElement | null = null;

  // Private fields for game state
  #alphabetTiles: Map<string, GameTile> = new Map();
  #letterStatusMap: Map<string, LetterStatus> = new Map();
  #allowedWords: string[] = [];
  #allowedWordsSet: Set<string> = new Set();
  #secret: string | null = null;
  #row = 0;
  #gameOver = false;
  #wordLength: number;
  #maxRows: number;
  #stats: GameStats;
  #correctPositions: (string | null)[] = new Array(6).fill(null);
  #timerDuration = 0;
  #timerInterval: ReturnType<typeof setInterval> | null = null;
  #timerElapsed = 0;
  #timerStartedFirstRow = false;
  #playerCount = 1;
  #currentPlayer: 1 | 2 = 1;
  #winner: 1 | 2 | null = null;

  // Options
  readonly options: Required<
    Omit<
      GameOptions,
      | 'allowedWords'
      | 'board'
      | 'form'
      | 'lengthSelect'
      | 'resetButton'
      | 'alphaLeft'
      | 'alphaRight'
      | 'button'
      | 'messageBox'
    >
  > &
    GameOptions;

  /**
   * Creates a new Wordley instance.
   * @param options - Configuration options.
   */
  constructor(options: GameOptions = {}) {
    this.options = {
      boardId: 'board',
      formId: 'guessForm',
      lengthSelectId: 'lengthSelect',
      resetButtonId: 'resetGame',
      alphaLeftId: 'alphaLeft',
      alphaRightId: 'alphaRight',
      buttonSelector: 'button',
      allowedWords: null,
      wordLength: 5,
      maxRows: 6,
      ...options,
    };

    this.#allowedWords = this.options.allowedWords ?? [];
    this.#allowedWordsSet = new Set(this.#allowedWords);
    this.#wordLength = this.options.wordLength!;
    this.#maxRows = this.options.maxRows!;
    this.#stats = this.#loadStats();
  }

  /**
   * Initializes the game by querying DOM elements, setting up event listeners,
   * and loading the initial word list.
   * @throws {Error} If required DOM elements are missing.
   */
  async init(): Promise<void> {
    this.#board = this.options.board || document.getElementById(this.options.boardId!);
    this.#form = (this.options.form ||
      document.getElementById(this.options.formId!)) as HTMLFormElement | null;
    this.#lengthSelect = (this.options.lengthSelect ||
      document.getElementById(this.options.lengthSelectId!)) as HTMLSelectElement | null;
    this.#button = (this.options.button ||
      (this.#form
        ? this.#form.querySelector(this.options.buttonSelector!)
        : null)) as HTMLButtonElement | null;
    this.#resetButton = (this.options.resetButton ||
      document.getElementById(this.options.resetButtonId!)) as HTMLButtonElement | null;
    this.#alphaCols = [
      this.options.alphaLeft || document.getElementById(this.options.alphaLeftId!),
      this.options.alphaRight || document.getElementById(this.options.alphaRightId!),
    ];
    this.#messageBox = this.options.messageBox || document.getElementById('message');
    this.#rowTemplate = document.getElementById('RowTemplate') as HTMLTemplateElement | null;
    this.#letterInputs = Array.from(document.querySelectorAll('.guess-letter')) as GameTile[];
    this.#lengthValue = document.getElementById('lengthValue');
    this.#settingsDialog = document.getElementById('settingsDialog') as HTMLDialogElement | null;
    this.#settingsBtn = document.getElementById('settingsBtn');
    this.#closeSettingsBtn = document.getElementById('closeSettings');
    this.#timerSelect = document.getElementById('timerSelect') as HTMLSelectElement | null;
    this.#playerCountInputs = document.querySelectorAll(
      'input[name="playerCount"]',
    ) as NodeListOf<HTMLInputElement>;
    this.#turnIndicator = document.getElementById('turnIndicator');

    if (
      !this.#board ||
      !this.#form ||
      !this.#rowTemplate ||
      this.#letterInputs.length === 0 ||
      this.#alphaCols.some((col) => !col) ||
      !this.#messageBox
    ) {
      throw new Error('Missing required DOM elements for the game.');
    }

    // Load saved settings before applying
    this.#loadSettings();

    if (this.#lengthSelect) {
      this.#lengthSelect.value = String(this.#wordLength);
      this.#lengthSelect.addEventListener('change', this.#handleLengthChange);
    }

    await this.#applyLength(this.#wordLength);

    this.#form.addEventListener('submit', this.#handleSubmit);
    if (this.#resetButton) {
      this.#resetButton.addEventListener('click', this.#handleReset);
    }

    // Settings dialog event listeners
    if (this.#settingsBtn && this.#settingsDialog) {
      this.#settingsBtn.addEventListener('click', this.#openSettings);
    }
    if (this.#closeSettingsBtn && this.#settingsDialog) {
      this.#closeSettingsBtn.addEventListener('click', this.#closeSettings);
    }
    if (this.#settingsDialog) {
      this.#settingsDialog.addEventListener('click', this.#handleDialogBackdrop);
    }

    // Timer event listener
    if (this.#timerSelect) {
      this.#timerSelect.addEventListener('change', this.#handleTimerChange);
    }

    // Player count event listeners
    this.#playerCountInputs.forEach((input) => {
      input.addEventListener('change', this.#handlePlayerCountChange);
    });

    this.#letterInputs.forEach((input) => {
      input.addEventListener('tile-input', this.#handleLetterInput as EventListener);
      input.addEventListener('tile-keydown', this.#handleLetterKeydown as EventListener);
    });

    this.#focusFirstLetter();
    // Timer starts on first letter input for first row
  }

  /**
   * Applies a new word length, reloading the word list and resetting the board.
   * @param length - The desired word length (4, 5, or 6).
   */
  async #applyLength(length: number | string): Promise<void> {
    this.#wordLength = Number(length) || 5;
    const baseRows = Math.max(6, this.#wordLength + 1);
    // Ensure even number of rows for 2-player mode (fair turns)
    if (this.#playerCount === 2) {
      const extraRows = baseRows + 2;
      this.#maxRows = extraRows % 2 === 0 ? extraRows : extraRows + 1;
    } else {
      this.#maxRows = baseRows;
    }
    this.#allowedWords = await loadWords(this.#wordLength);
    this.#allowedWordsSet = new Set(this.#allowedWords);

    if (this.#lengthSelect) {
      this.#lengthSelect.setAttribute('data-length', String(this.#wordLength));
    }
    this.#updateLengthValue(this.#wordLength);
    this.#resetAlphabetStatuses();

    // Adjust letter inputs for the selected length
    this.#letterInputs.forEach((input, idx) => {
      const active = idx < this.#wordLength;
      input.disabled = !active;
      input.value = '';
    });

    this.#secret = this.#pickSecret();
    this.#row = 0;
    this.#gameOver = false;
    this.#timerStartedFirstRow = false;
    this.#currentPlayer = 1;
    this.#winner = null;
    if (this.#button) this.#button.disabled = false;
    this.#buildBoard();
    this.#focusFirstLetter();
    this.#updateRemainingMessage();
    this.#updateTurnIndicator();
    this.#resetTimer();
  }

  /** Clears the board and builds rows for the current game configuration. */
  #buildBoard(): void {
    // Preserve turn indicator before clearing
    const turnIndicator = this.#turnIndicator;
    this.#board!.innerHTML = '';
    // Re-add turn indicator at top of board
    if (turnIndicator) {
      this.#board!.appendChild(turnIndicator);
    }
    this.#buildAlphabet();
    this.#resetAlphabetStatuses();

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < this.#maxRows; i++) {
      const clone = this.#rowTemplate!.content.firstElementChild!.cloneNode(true) as HTMLElement;
      clone.dataset.row = String(i);
      fragment.appendChild(clone);
    }
    this.#board!.appendChild(fragment);
  }

  /**
   * Randomly selects a secret word from the allowed words list.
   * @returns The secret word.
   */
  #pickSecret(): string {
    return this.#allowedWords[Math.floor(Math.random() * this.#allowedWords.length)];
  }

  /** Builds the alphabet tiles in the left and right columns (A-M, N-Z). */
  #buildAlphabet(): void {
    const letters = ALPHABET.split('');
    const slices = [letters.slice(0, 13), letters.slice(13)];

    this.#alphabetTiles.clear();

    slices.forEach((arr, idx) => {
      const container = this.#alphaCols[idx];
      const fragment = document.createDocumentFragment();

      arr.forEach((ch) => {
        const tile = document.createElement('game-tile') as GameTile;
        tile.classList.add('alpha-tile');
        tile.setAttribute('readonly', '');
        tile.value = ch;
        tile.dataset.letter = ch;
        fragment.appendChild(tile);
        this.#alphabetTiles.set(ch, tile);
      });

      if (container) {
        container.innerHTML = '';
        container.appendChild(fragment);
      }
    });
  }

  /** Clears all letter statuses from alphabet tiles and resets tracking. */
  #resetAlphabetStatuses(): void {
    this.#letterStatusMap.clear();
    this.#alphabetTiles.forEach((tile) => {
      tile.status = '';
    });
    this.#correctPositions = new Array(6).fill(null);
    this.#updateInputPlaceholders();
  }

  /** Updates placeholders on input tiles to show correctly guessed letters. */
  #updateInputPlaceholders(): void {
    const inputs = this.#getActiveInputs();
    if (!inputs || inputs.length === 0) return;
    inputs.forEach((input, i) => {
      input.placeholder = this.#correctPositions[i] || '';
    });
  }

  /**
   * Calculates the number of guesses remaining.
   * @returns Remaining guess count (minimum 0).
   */
  #remainingGuesses(): number {
    return Math.max(0, this.#maxRows - this.#row);
  }

  /**
   * Generates a human-readable message for remaining guesses.
   * @returns e.g., '5 guesses remaining' or '1 guess remaining'.
   */
  #remainingMessage(): string {
    const remaining = this.#remainingGuesses();
    const label = remaining === 1 ? 'guess' : 'guesses';
    return `${remaining} ${label} remaining`;
  }

  /** Updates the message box with the current remaining guesses. */
  #updateRemainingMessage(): void {
    if (this.#gameOver) return;
    this.#setMessage(this.#remainingMessage(), 'info');
  }

  /**
   * Updates the displayed word length value label.
   * @param length - The current word length.
   */
  #updateLengthValue(length: number): void {
    if (this.#lengthValue) {
      this.#lengthValue.textContent = String(length);
    }
  }

  /**
   * Displays a message in the message box with optional tone styling.
   * @param text - The message to display.
   * @param tone - Visual tone class.
   */
  #setMessage(text: string, tone: MessageTone = 'info'): void {
    if (!this.#messageBox) return;
    let content = text;

    if (!content) {
      this.#messageBox.textContent = '';
      this.#messageBox.classList.remove('show', 'error', 'success', 'info');
      return;
    }
    this.#messageBox.textContent = content;
    this.#messageBox.classList.remove('error', 'success', 'info');
    this.#messageBox.classList.add('show', tone);
  }

  /** Updates the turn indicator to show whose turn it is or game result. */
  #updateTurnIndicator(): void {
    if (!this.#turnIndicator) return;

    let content;
    let playerClass = '';

    if (this.#gameOver) {
      if (this.#winner) {
        const winnerLabel = this.#winner === 1 ? 'Player 1' : 'Player 2';
        content = `${winnerLabel} wins!`;
        playerClass = `player-${this.#winner}`;
      } else {
        content = 'Game Over';
      }
    } else {
      const playerLabel = this.#currentPlayer === 1 ? 'Player 1' : 'Player 2';
      content = `${playerLabel}'s turn`;
      playerClass = `player-${this.#currentPlayer}`;
    }

    this.#turnIndicator.innerHTML = content;
    this.#turnIndicator.classList.remove('player-1', 'player-2');
    this.#messageBox?.classList.remove('player-1', 'player-2');
    if (playerClass) {
      this.#turnIndicator.classList.add(playerClass);
      this.#messageBox?.classList.add(playerClass);
    }
  }

  /**
   * Updates the status of a letter in the alphabet tracker.
   * Only upgrades status (absent → present → correct), never downgrades.
   * @param letter - The letter to update.
   * @param status - The new status.
   */
  #setLetterStatus(letter: string, status: LetterStatus): void {
    const upper = letter.toUpperCase();
    const current = this.#letterStatusMap.get(upper);
    if (current && STATUS_PRIORITY[current] >= STATUS_PRIORITY[status]) return;

    this.#letterStatusMap.set(upper, status);
    const tile = this.#alphabetTiles.get(upper);
    if (tile) {
      tile.status = status;
      const statusText =
        status === 'correct'
          ? 'correct position'
          : status === 'present'
            ? 'in word, wrong position'
            : 'not in word';
      tile.setAttribute('aria-label', `${upper}, ${statusText}`);
    }
  }

  /**
   * Handles form submission.
   * @param event - The submit event.
   */
  #handleSubmit = (event: Event): void => {
    event.preventDefault();
    this.#makeGuess();
  };

  /**
   * Handles word length changes from the length selector.
   * @param event - The change event.
   */
  #handleLengthChange = async (event: Event): Promise<void> => {
    try {
      await this.#applyLength((event.target as HTMLSelectElement).value);
      this.#saveSettings();
    } catch (err) {
      console.error(err);
    }
  };

  /** Handles the reset button click by restarting with the current word length. */
  #handleReset = async (): Promise<void> => {
    try {
      await this.#applyLength(this.#wordLength);
    } catch (err) {
      console.error(err);
    }
  };

  /** Opens the settings dialog. */
  #openSettings = (): void => {
    this.#settingsDialog?.showModal();
  };

  /** Closes the settings dialog. */
  #closeSettings = (): void => {
    this.#settingsDialog?.close();
  };

  /**
   * Handles clicks on the dialog backdrop to close it.
   * @param event - The click event.
   */
  #handleDialogBackdrop = (event: MouseEvent): void => {
    if (event.target === this.#settingsDialog) {
      this.#closeSettings();
    }
  };

  /**
   * Handles timer duration changes.
   * @param event - The change event.
   */
  #handleTimerChange = (event: Event): void => {
    this.#timerDuration = parseInt((event.target as HTMLSelectElement).value, 10) || 0;
    this.#resetTimer();
    this.#saveSettings();
  };

  /**
   * Handles player count changes.
   * @param event - The change event.
   */
  #handlePlayerCountChange = async (event: Event): Promise<void> => {
    const newCount = parseInt((event.target as HTMLInputElement).value, 10) || 1;
    if (newCount !== this.#playerCount) {
      this.#playerCount = newCount;
      this.#saveSettings();
      // Reset game to apply new row count
      await this.#applyLength(this.#wordLength);
    }
  };

  /** Loads settings from localStorage and applies them. */
  #loadSettings(): void {
    try {
      const stored = localStorage.getItem(Wordley.SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);

        // Apply word length
        if (settings.wordLength && this.#lengthSelect) {
          this.#wordLength = settings.wordLength;
          this.#lengthSelect.value = String(settings.wordLength);
        }

        // Apply timer duration
        if (settings.timerDuration !== undefined && this.#timerSelect) {
          this.#timerDuration = settings.timerDuration;
          this.#timerSelect.value = String(settings.timerDuration);
        }

        // Apply player count
        if (settings.playerCount) {
          this.#playerCount = settings.playerCount;
          this.#playerCountInputs.forEach((input) => {
            input.checked = parseInt(input.value, 10) === settings.playerCount;
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
  }

  /** Saves current settings to localStorage. */
  #saveSettings(): void {
    try {
      const settings = {
        wordLength: this.#wordLength,
        timerDuration: this.#timerDuration,
        playerCount: this.#playerCount,
      };
      localStorage.setItem(Wordley.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }

  /** Starts the countdown timer if a duration is set. */
  #startTimer(): void {
    if (this.#timerDuration <= 0 || this.#gameOver) return;

    this.#stopTimer();
    this.#timerElapsed = 0;
    this.#updateTimerProgress();

    this.#timerInterval = setInterval(() => {
      this.#timerElapsed++;
      this.#updateTimerProgress();

      if (this.#timerElapsed >= this.#timerDuration) {
        this.#stopTimer();
        this.#handleTimerExpired();
      }
    }, 1000);
  }

  /** Stops the countdown timer. */
  #stopTimer(): void {
    if (this.#timerInterval) {
      clearInterval(this.#timerInterval);
      this.#timerInterval = null;
    }
  }

  /** Resets and restarts the timer. */
  #resetTimer(): void {
    this.#stopTimer();
    this.#timerElapsed = 0;

    // Disable transition for instant reset
    this.#messageBox?.classList.add('timer-reset');
    this.#updateTimerProgress(true);
    // Re-enable transition after a frame
    requestAnimationFrame(() => {
      this.#messageBox?.classList.remove('timer-reset');
    });

    // Don't auto-start on first row - timer starts on first letter input
    if (!this.#gameOver && (this.#row > 0 || this.#timerStartedFirstRow)) {
      this.#startTimer();
    }
  }

  /** Updates the timer progress bar width and color via CSS custom properties. */
  #updateTimerProgress(reset = false): void {
    if (this.#messageBox && !reset && this.#timerDuration > 0) {
      const percent = ((this.#timerElapsed + 1) / this.#timerDuration) * 100;
      this.#messageBox.style.setProperty('--timer-progress', `${percent}%`);

      // Update color based on time elapsed (not visual progress)
      let color;
      if (percent < 50) {
        color = 'var(--color-success)';
      } else if (percent < 80) {
        color = 'var(--color-warning)';
      } else {
        color = 'var(--color-danger)';
      }
      this.#messageBox.style.setProperty('--timer-color', color);
    } else if (this.#messageBox) {
      const resetPercent = '0%';
      this.#messageBox.style.setProperty('--timer-progress', resetPercent);
      this.#messageBox.style.setProperty('--timer-color', 'var(--color-success)');
    }
  }

  /** Handles when the timer expires - skip turn (never auto-submit). */
  #handleTimerExpired(): void {
    if (this.#gameOver) return;

    // Time ran out - mark row as skipped (blank tiles, absent status)
    const rowEl = this.#board?.querySelector(`.row[data-row="${this.#row}"]`);
    if (rowEl) {
      // Add player indicator for 2-player mode
      if (this.#playerCount === 2) {
        rowEl.classList.add(`player-${this.#currentPlayer}`);
      }
      const tiles = Array.from(rowEl.querySelectorAll('.tiles game-tile')) as GameTile[];
      tiles.slice(0, this.#wordLength).forEach((tile) => {
        tile.value = '';
        tile.status = 'absent';
      });
    }

    this.#setMessage("Time's up!", 'error');
    this.#row++;

    // Switch players in 2-player mode
    if (this.#playerCount === 2 && this.#row < this.#maxRows) {
      this.#currentPlayer = this.#currentPlayer === 1 ? 2 : 1;
      this.#updateTurnIndicator();
    }

    this.#clearGuessInputs();
    this.#focusFirstLetter();

    if (this.#row >= this.#maxRows) {
      this.#recordStat(this.#wordLength, 'failed');
      this.#setMessage(`Out of guesses! The word was ${this.#secret!.toUpperCase()}.`, 'error');
      this.#endGame();
    } else {
      this.#updateRemainingMessage();
      // Reset progress to 0 immediately
      this.#timerElapsed = 0;
      this.#messageBox?.classList.add('timer-reset');
      this.#updateTimerProgress(true);
      requestAnimationFrame(() => {
        this.#messageBox?.classList.remove('timer-reset');
        this.#startTimer();
      });
    }
  }

  /**
   * Handles letter input from tile component, auto-advancing focus.
   * @param event - The tile-input event.
   */
  #handleLetterInput = (event: CustomEvent<TileInputEventDetail>): void => {
    const { value, index } = event.detail;

    if (value) {
      // Start timer on first letter input for first row
      if (this.#row === 0 && !this.#timerStartedFirstRow && this.#timerDuration > 0) {
        this.#timerStartedFirstRow = true;
        this.#startTimer();
      }

      const next = this.#letterInputs.find((el, idx) => idx > index && !el.disabled);
      next?.focus();
    }

    this.#updateRemainingMessage();
  };

  /**
   * Handles keydown events for navigation between tile inputs.
   * @param event - The tile-keydown event.
   */
  #handleLetterKeydown = (event: CustomEvent<TileKeydownEventDetail>): void => {
    const { key, index, originalEvent } = event.detail;
    const input = this.#letterInputs[index];

    if (key === 'Backspace' && !input.value) {
      for (let i = index - 1; i >= 0; i--) {
        const candidate = this.#letterInputs[i];
        if (!candidate.disabled) {
          candidate.value = '';
          candidate.focus();
          originalEvent?.preventDefault();
          break;
        }
      }
    } else if (key === 'ArrowLeft') {
      originalEvent?.preventDefault();
      for (let i = index - 1; i >= 0; i--) {
        const candidate = this.#letterInputs[i];
        if (!candidate.disabled) {
          candidate.focus();
          break;
        }
      }
    } else if (key === 'ArrowRight') {
      originalEvent?.preventDefault();
      for (let i = index + 1; i < this.#letterInputs.length; i++) {
        const candidate = this.#letterInputs[i];
        if (!candidate.disabled) {
          candidate.focus();
          break;
        }
      }
    }
  };

  /**
   * Returns the active (enabled) letter input tiles.
   * @returns Array of active tile elements.
   */
  #getActiveInputs(): GameTile[] {
    return this.#letterInputs.slice(0, this.#wordLength).filter((input) => !input.disabled);
  }

  /** Clears all values from active guess inputs. */
  #clearGuessInputs(): void {
    this.#getActiveInputs().forEach((input) => {
      input.value = '';
    });
  }

  /** Focuses the first active letter input. */
  #focusFirstLetter(): void {
    this.#getActiveInputs()[0]?.focus();
  }

  /**
   * Processes the current guess: validates, scores, and updates game state.
   * Handles win/loss conditions and advances to the next row.
   */
  #makeGuess(): void {
    if (this.#gameOver || this.#row >= this.#maxRows) return;

    const activeInputs = this.#getActiveInputs();
    const letters = activeInputs.map((input) => (input.value || '').toLowerCase());
    const guess = letters.join('');

    if (letters.some((ch) => ch.length !== 1)) {
      this.#setMessage(`Enter a ${this.#wordLength}-letter word.`, 'error');
      return;
    }
    if (!this.#allowedWordsSet.has(guess)) {
      this.#setMessage('Word not in list.', 'error');
      return;
    }

    const rowEl = this.#board?.querySelector(`.row[data-row='${this.#row}']`);
    const tiles = rowEl
      ? (Array.from(rowEl.querySelectorAll('.tiles game-tile')) as GameTile[]).slice(
          0,
          this.#wordLength,
        )
      : [];

    // Add player indicator for 2-player mode
    if (this.#playerCount === 2 && rowEl) {
      rowEl.classList.add(`player-${this.#currentPlayer}`);
    }

    this.#scoreGuess(guess, tiles);

    // Fetch and display the definition
    this.#displayDefinition(guess, rowEl ?? null);

    const isWin = guess === this.#secret;
    const isLoss = this.#row === this.#maxRows - 1;

    if (isWin) {
      this.#winner = this.#currentPlayer;
      this.#recordStat(this.#wordLength, this.#row + 1);
      this.#setMessage(`You win! The word was ${this.#secret!.toUpperCase()}.`, 'success');
      this.#endGame();
    } else if (isLoss) {
      this.#recordStat(this.#wordLength, 'failed');
      this.#setMessage(`Out of guesses! The word was ${this.#secret!.toUpperCase()}.`, 'error');
      this.#endGame();
    }

    this.#row++;

    // Switch players in 2-player mode
    if (this.#playerCount === 2 && !isWin && !isLoss) {
      this.#currentPlayer = this.#currentPlayer === 1 ? 2 : 1;
      this.#updateTurnIndicator();
    }

    if (!isWin && !isLoss) {
      this.#updateRemainingMessage();
      this.#resetTimer();
    }

    this.#clearGuessInputs();
    this.#focusFirstLetter();
  }

  /**
   * Scores a guess against the secret word using Wordle rules.
   * Marks tiles as correct (green), present (yellow), or absent (gray).
   * @param guess - The guessed word (lowercase).
   * @param tiles - The tile elements to update.
   */
  #scoreGuess(guess: string, tiles: GameTile[]): void {
    const secretArr: (string | null)[] = this.#secret!.split('');
    const guessArr: (string | null)[] = guess.split('');

    // First pass: mark correct letters
    for (let i = 0; i < this.#wordLength; i++) {
      const letter = guess[i].toUpperCase();
      tiles[i].value = letter;
      if (guessArr[i] === secretArr[i]) {
        tiles[i].status = 'correct';
        tiles[i].setAttribute('aria-label', `${letter}, correct`);
        this.#setLetterStatus(guess[i], 'correct');
        this.#correctPositions[i] = letter;
        secretArr[i] = null;
        guessArr[i] = null;
      }
    }

    // Update input tile placeholders
    this.#updateInputPlaceholders();

    // Second pass: mark present and absent letters
    for (let i = 0; i < this.#wordLength; i++) {
      if (guessArr[i] === null) continue;

      const letter = guessArr[i]!.toUpperCase();
      const idx = secretArr.indexOf(guessArr[i]);
      if (idx !== -1) {
        tiles[i].status = 'present';
        tiles[i].setAttribute('aria-label', `${letter}, present in word`);
        secretArr[idx] = null;
        this.#setLetterStatus(guessArr[i]!, 'present');
      } else {
        tiles[i].status = 'absent';
        tiles[i].setAttribute('aria-label', `${letter}, not in word`);
        this.#setLetterStatus(guessArr[i]!, 'absent');
      }
    }
  }

  /**
   * Fetches and displays the definitions of a word in the row's tooltip.
   * @param word - The word to look up.
   * @param rowEl - The row element containing the tooltip.
   */
  async #displayDefinition(word: string, rowEl: Element | null): Promise<void> {
    if (!rowEl) return;
    const tooltip = rowEl.querySelector('.tooltip');
    if (!tooltip) return;

    const definitions = await fetchDefinition(word);
    if (definitions && definitions.length > 0) {
      // Generate unique ID for tooltip and link via aria-describedby
      const htmlRowEl = rowEl as HTMLElement;
      const tooltipId = `tooltip-${htmlRowEl.dataset.row}-${Date.now()}`;
      tooltip.id = tooltipId;
      rowEl.setAttribute('aria-describedby', tooltipId);

      // Build HTML content
      const html = definitions
        .map((d) => `<strong>${d.partOfSpeech}:</strong> ${d.definition}`)
        .join('<br>');
      tooltip.innerHTML = html;

      // Update aria-label for screen readers
      htmlRowEl.hidden = false;
      rowEl.setAttribute('aria-label', `Definition of ${word}`);
    }
  }

  /** Ends the game by disabling inputs and the submit button. */
  #endGame(): void {
    this.#gameOver = true;
    this.#stopTimer();
    // Reset timer progress to 0 immediately
    this.#timerElapsed = 0;
    this.#messageBox?.classList.add('timer-reset');
    this.#updateTimerProgress(true);
    requestAnimationFrame(() => {
      this.#messageBox?.classList.remove('timer-reset');
    });
    this.#getActiveInputs().forEach((input) => {
      input.disabled = true;
    });
    if (this.#button) this.#button.disabled = true;
    if (this.#resetButton)
      setTimeout(() => {
        this.#resetButton!.focus();
      }, 100);
    this.#updateTurnIndicator();
  }

  /**
   * Loads statistics from localStorage.
   * @returns Stats object.
   */
  #loadStats(): GameStats {
    try {
      const stored = localStorage.getItem(Wordley.STATS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load stats from localStorage:', e);
    }
    return this.#createEmptyStats();
  }

  /**
   * Creates an empty statistics object.
   * @returns Empty stats object with 1-player and 2-player sections.
   */
  #createEmptyStats(): GameStats {
    const stats: GameStats = {
      singlePlayer: {},
      twoPlayer: {
        player1: {},
        player2: {},
        draws: {},
      },
    };
    for (let len = 4; len <= 6; len++) {
      stats.singlePlayer[len] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, failed: 0 };
      stats.twoPlayer.player1[len] = { wins: 0, losses: 0 };
      stats.twoPlayer.player2[len] = { wins: 0, losses: 0 };
      stats.twoPlayer.draws[len] = 0;
    }
    return stats;
  }

  /**
   * Saves statistics to localStorage.
   */
  #saveStats(): void {
    try {
      localStorage.setItem(Wordley.STATS_KEY, JSON.stringify(this.#stats));
    } catch (e) {
      console.warn('Failed to save stats to localStorage:', e);
    }
  }

  /**
   * Records a game result in statistics.
   * @param wordLength - The word length (4, 5, or 6).
   * @param guesses - Number of guesses (1-6) or 'failed'.
   */
  #recordStat(wordLength: number, guesses: number | 'failed'): void {
    // Ensure stats structure exists
    this.#ensureStatsStructure(wordLength);

    if (this.#playerCount === 1) {
      // Single player: track guess distribution
      const key = guesses === 'failed' ? 'failed' : guesses;
      if (this.#stats.singlePlayer[wordLength][key] !== undefined) {
        this.#stats.singlePlayer[wordLength][key]++;
      }
    } else {
      // Two player: track wins/losses/draws
      if (this.#winner === 1) {
        this.#stats.twoPlayer.player1[wordLength].wins++;
        this.#stats.twoPlayer.player2[wordLength].losses++;
      } else if (this.#winner === 2) {
        this.#stats.twoPlayer.player2[wordLength].wins++;
        this.#stats.twoPlayer.player1[wordLength].losses++;
      } else {
        // Draw - neither player won
        this.#stats.twoPlayer.draws[wordLength]++;
      }
    }
    this.#saveStats();
  }

  /**
   * Ensures the stats structure exists for a given word length.
   * Handles migration from old format.
   * @param wordLength - The word length to check.
   */
  #ensureStatsStructure(wordLength: number): void {
    // Migrate old flat structure if needed
    if (!this.#stats.singlePlayer) {
      const oldStats = this.#stats as unknown as Record<number, SinglePlayerStats>;
      this.#stats = this.#createEmptyStats();
      // Migrate old data to singlePlayer
      for (let len = 4; len <= 6; len++) {
        if (oldStats[len]) {
          this.#stats.singlePlayer[len] = oldStats[len];
        }
      }
    }
    // Ensure word length entries exist
    if (!this.#stats.singlePlayer[wordLength]) {
      this.#stats.singlePlayer[wordLength] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, failed: 0 };
    }
    if (!this.#stats.twoPlayer.player1[wordLength]) {
      this.#stats.twoPlayer.player1[wordLength] = { wins: 0, losses: 0 };
    }
    if (!this.#stats.twoPlayer.player2[wordLength]) {
      this.#stats.twoPlayer.player2[wordLength] = { wins: 0, losses: 0 };
    }
    if (this.#stats.twoPlayer.draws[wordLength] === undefined) {
      this.#stats.twoPlayer.draws[wordLength] = 0;
    }
  }

  /**
   * Gets statistics for a specific mode and/or word length.
   * @param mode - Game mode to filter by.
   * @param wordLength - Optional word length to filter by.
   * @returns Statistics object.
   */
  getStats(mode?: GameMode, wordLength?: number): unknown {
    // Ensure current structure
    if (!this.#stats.singlePlayer) {
      this.#ensureStatsStructure(4);
    }

    if (mode === 'singlePlayer') {
      if (wordLength) {
        return (
          this.#stats.singlePlayer[wordLength] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, failed: 0 }
        );
      }
      return this.#stats.singlePlayer;
    }

    if (mode === 'twoPlayer') {
      if (wordLength) {
        return {
          player1: this.#stats.twoPlayer.player1[wordLength] || { wins: 0, losses: 0 },
          player2: this.#stats.twoPlayer.player2[wordLength] || { wins: 0, losses: 0 },
          draws: this.#stats.twoPlayer.draws[wordLength] || 0,
        };
      }
      return this.#stats.twoPlayer;
    }

    return this.#stats;
  }
}

// Bootstrap the game when the DOM is ready (browser environment only)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const game = new Wordley();
    game.init().catch((err) => console.error(err));
  });
}
