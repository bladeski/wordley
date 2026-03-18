/**
 * @fileoverview GameTile Web Component for Wordley.
 * A reusable tile component that supports both display and input modes
 * with customizable appearance based on game state.
 */

export type TileStatus =
  | 'correct'
  | 'success' // Green
  | 'present'
  | 'warning' // Amber
  | 'absent' // Grey
  | 'disabled' // Semi-transparent for disabled state
  | 'info' // Blue, for informational purposes
  | 'error'
  | 'danger' // Red, for error states
  | '';
export type TileType = 'letter' | 'number';

export interface TileInputEventDetail {
  value: string;
  index: number;
}

export interface TileFocusEventDetail {
  index: number;
}

export interface TileKeydownEventDetail {
  key: string;
  index: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  originalEvent: KeyboardEvent;
}

/**
 * Custom Tile web component for the Wordley game.
 *
 * Features:
 * - Display mode (readonly) for showing guessed letters
 * - Input mode for entering new guesses
 * - Status-based coloring (correct/present/absent)
 * - Keyboard navigation support
 * - Shadow DOM encapsulation
 *
 * @element game-tile
 *
 * @attr {string} value - The character displayed in the tile
 * @attr {boolean} readonly - Whether the tile is read-only (display mode)
 * @attr {string} type - Input type: "letter" (default) or "number"
 * @attr {string} status - Tile status/color: "correct" | "present" | "absent" | ""
 * @attr {number} index - Position index for the tile (used in events)
 * @attr {string} placeholder - Placeholder character to show (e.g., for correct letters)
 *
 * @fires tile-input - When the tile value changes (detail: { value, index })
 * @fires tile-focus - When the tile receives focus (detail: { index })
 * @fires tile-keydown - When a key is pressed (detail: { key, index })
 */
export class GameTile extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['value', 'readonly', 'type', 'status', 'index', 'disabled', 'placeholder', 'selected'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.#render();
  }

  /**
   * Renders the shadow DOM content.
   */
  #render(): void {
    const isReadonly = this.hasAttribute('readonly');
    const value = this.getAttribute('value') || '';
    const type = this.getAttribute('type') || 'letter';
    const disabled = this.hasAttribute('disabled');
    const placeholder = this.getAttribute('placeholder') || '';

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          --tile-scale: var(--scale, 1);
          --tile-font-size: calc(1.5rem * var(--tile-scale));
          --tile-size: calc(4rem * var(--tile-scale));
          --tile-border-radius: calc(var(--radius-sm, 0.25rem) * var(--tile-scale));
          --tile-border-width: var(--border-sm, 2px);
          --tile-bg: var(--color-tile-bg, #ffffff);
          --tile-border: var(--color-tile-border, #d3d6da);
          --tile-text: var(--color-tile-text, #1a1a1b);
        }

        :host([status="correct"]), :host([status="success"]) {
          --tile-bg: var(--color-success-bg, rgba(34, 197, 94, 0.18));
          --tile-border: var(--color-success-border, rgba(34, 197, 94, 0.55));
          --tile-text: var(--color-success-text, #dcfce7);
        }

        :host([status="present"]), :host([status="warning"]) {
          --tile-bg: var(--color-warning-bg, rgba(234, 179, 8, 0.18));
          --tile-border: var(--color-warning-border, rgba(234, 179, 8, 0.55));
          --tile-text: var(--color-warning-text, #fef9c3);
        }

        :host([status="absent"]) {
          --tile-bg: var(--color-absent-bg, rgba(71, 85, 105, 0.3));
          --tile-border: var(--color-absent-border, rgba(71, 85, 105, 0.7));
          --tile-text: var(--color-absent-text, #cbd5e1);
          opacity: 0.7;
        }

        :host([selected]) {
          --tile-border: var(--accent, #4a90d9);
          --color-tile-border-filled: var(--accent, #4a90d9);
        }

        :host([disabled]) {
          opacity: 0.5;
          pointer-events: none;
        }

        :host([status="info"]) {
          --tile-bg: var(--color-info-bg, rgba(59, 130, 246, 0.18));
          --tile-border: var(--color-info-border, rgba(59, 130, 246, 0.55));
          --tile-text: var(--color-info-text, #dbeafe);
        }

        :host([status="error"]), :host([status="danger"]) {
          --tile-bg: var(--color-error-bg, rgba(239, 68, 68, 0.18));
          --tile-border: var(--color-error-border, rgba(239, 68, 68, 0.55));
          --tile-text: var(--color-error-text, #fee2e2);
        }

        .tile {
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--tile-size);
          height: var(--tile-size);
          font-family: var(--font-family-base, "Space Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif);
          font-size: var(--tile-font-size);
          font-weight: bold;
          text-transform: uppercase;
          background: var(--tile-bg);
          border: var(--tile-border-width) solid var(--tile-border);
          border-radius: var(--tile-border-radius);
          color: var(--tile-text);
          box-sizing: border-box;
          user-select: none;
          transition: background-color 0.2s, border-color 0.2s, transform 0.1s;
        }

        .tile.filled {
          border-color: var(--color-tile-border-filled, #878a8c);
        }

        input.tile {
          text-align: center;
          caret-color: transparent;
          outline: none;
          cursor: pointer;
        }

        input.tile:focus {
          border-color: var(--color-focus, #4a90d9);
          box-shadow: 0 0 0 2px var(--color-focus-ring, rgba(74, 144, 217, 0.3));
          transform: scale(1.05);
        }

        input.tile::selection {
          background: transparent;
        }

        input.tile::placeholder {
          color: var(--color-correct, #22c55e);
          opacity: 0.6;
          font-weight: bold;
        }
      </style>
      ${
        isReadonly
          ? `<div class="tile${value ? ' filled' : ''}" part="tile">${value}</div>`
          : `<input 
            class="tile${value ? ' filled' : ''}" 
            part="tile"
            type="text"
            maxlength="1"
            value="${value}"
            placeholder="${placeholder}"
            ${disabled ? 'disabled' : ''}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            inputmode="${type === 'number' ? 'numeric' : 'text'}"
            pattern="${type === 'number' ? '[0-9]' : '[a-zA-Z]'}"
            aria-label="Tile ${this.getAttribute('index') || ''}"
          />`
      }
    `;

    if (!isReadonly) {
      this.#attachInputListeners();
    }
  }

  /**
   * Attaches event listeners to the input element.
   */
  #attachInputListeners(): void {
    const input = this.shadowRoot!.querySelector('input');
    if (!input) return;

    input.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const type = this.getAttribute('type') || 'letter';
      let value = target.value;

      // Filter based on type
      if (type === 'letter') {
        value = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
      } else if (type === 'number') {
        value = value.replace(/[^0-9]/g, '');
      }

      target.value = value;
      this.setAttribute('value', value);

      // Update filled class
      target.classList.toggle('filled', value.length > 0);

      this.dispatchEvent(
        new CustomEvent<TileInputEventDetail>('tile-input', {
          bubbles: true,
          composed: true,
          detail: {
            value,
            index: parseInt(this.getAttribute('index') || '0', 10),
          },
        }),
      );
    });

    input.addEventListener('focus', () => {
      input.select();
      this.dispatchEvent(
        new CustomEvent<TileFocusEventDetail>('tile-focus', {
          bubbles: true,
          composed: true,
          detail: {
            index: parseInt(this.getAttribute('index') || '0', 10),
          },
        }),
      );
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      const index = parseInt(this.getAttribute('index') || '0', 10);

      this.dispatchEvent(
        new CustomEvent<TileKeydownEventDetail>('tile-keydown', {
          bubbles: true,
          composed: true,
          detail: {
            key: e.key,
            index,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            originalEvent: e,
          },
        }),
      );

      // Handle Enter key - submit the parent form
      if (e.key === 'Enter') {
        const form = this.closest('form');
        if (form) {
          form.requestSubmit();
        }
      }

      // Handle backspace on empty - allow parent to handle navigation
      if (e.key === 'Backspace' && !input.value) {
        e.preventDefault();
      }
    });
  }

  connectedCallback(): void {
    // Set default attributes if not present
    if (!this.hasAttribute('type')) {
      this.setAttribute('type', 'letter');
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'value') {
      const input = this.shadowRoot!.querySelector('input');
      const div = this.shadowRoot!.querySelector('div.tile');

      if (input && input.value !== newValue) {
        input.value = newValue || '';
        input.classList.toggle('filled', (newValue || '').length > 0);
      }
      if (div) {
        div.textContent = newValue || '';
        div.classList.toggle('filled', (newValue || '').length > 0);
      }
    } else if (name === 'placeholder') {
      const input = this.shadowRoot!.querySelector('input');
      if (input) {
        input.placeholder = newValue || '';
      }
    } else if (
      name === 'readonly' ||
      name === 'disabled' ||
      name === 'status' ||
      name === 'selected'
    ) {
      // Re-render for structural changes
      this.#render();
    }
  }

  // Public API

  /** Current tile value */
  get value(): string {
    return this.getAttribute('value') || '';
  }

  set value(val: string) {
    this.setAttribute('value', val || '');
  }

  /** Placeholder character */
  get placeholder(): string {
    return this.getAttribute('placeholder') || '';
  }

  set placeholder(val: string) {
    if (val) {
      this.setAttribute('placeholder', val);
    } else {
      this.removeAttribute('placeholder');
    }
  }

  /** Whether tile is readonly */
  get readonly(): boolean {
    return this.hasAttribute('readonly');
  }

  set readonly(val: boolean) {
    if (val) {
      this.setAttribute('readonly', '');
    } else {
      this.removeAttribute('readonly');
    }
  }

  /** Tile status (correct/present/absent) */
  get status(): TileStatus {
    return (this.getAttribute('status') || '') as TileStatus;
  }

  set status(val: TileStatus) {
    if (val) {
      this.setAttribute('status', val);
    } else {
      this.removeAttribute('status');
    }
  }

  /** Whether tile is disabled */
  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(val: boolean) {
    if (val) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  /** Whether tile is selected (UI highlight) */
  get selected(): boolean {
    return this.hasAttribute('selected');
  }

  set selected(val: boolean) {
    if (val) {
      this.setAttribute('selected', '');
    } else {
      this.removeAttribute('selected');
    }
  }

  /** Tile index */
  get index(): number {
    return parseInt(this.getAttribute('index') || '0', 10);
  }

  set index(val: number) {
    this.setAttribute('index', String(val));
  }

  /** Focuses the internal input element */
  focus(): void {
    const input = this.shadowRoot!.querySelector('input');
    if (input) {
      input.focus();
    }
  }

  /** Clears the tile value */
  clear(): void {
    this.value = '';
  }
}

// Register the custom element
customElements.define('game-tile', GameTile);

// Extend HTMLElementTagNameMap for TypeScript
declare global {
  interface HTMLElementTagNameMap {
    'game-tile': GameTile;
  }
}
