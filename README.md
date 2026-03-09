# Wordley

A modern, accessible Wordle-style word guessing game built with TypeScript and Web Components.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Play Now](https://img.shields.io/badge/Play%20Now-Wordley-green.svg)](https://bladeski.github.io/wordley/)

**[▶ Play Wordley](https://bladeski.github.io/wordley/)**

## Features

### Game Modes

- **Single Player** - Classic Wordle experience with unlimited attempts (up to 6 guesses)
- **Two Player** - Alternating turns between two players competing to guess the word first

### Customizable Difficulty

- **Word Length** - Choose between 4, 5, or 6 letter words
- **Timer Mode** - Optional countdown timer (15, 30, 45, or 60 seconds per guess) for added challenge

### User Experience

- **Visual Feedback** - Color-coded tiles showing correct (green), present (yellow), and absent (gray) letters
- **Alphabet Status** - Side panels displaying which letters have been used and their status
- **Word Definitions** - After completing a game, see the definition of the target word (fetched from Dictionary API)
- **Persistent Settings** - Your preferences are saved to localStorage
- **Statistics Tracking** - Track your wins, losses, and guess distribution (statistic viewing is a work in progress)

### Accessibility

- Full keyboard navigation support
- Screen reader compatible with ARIA labels
- Skip link for keyboard users
- High contrast color scheme

### Technical Highlights

- **Custom Web Components** - Reusable `<game-tile>` component with Shadow DOM encapsulation
- **TypeScript** - Fully typed codebase for better developer experience
- **Zero Runtime Dependencies** - Pure vanilla JavaScript/TypeScript, no frameworks
- **Modern CSS** - CSS custom properties for theming, responsive design

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Yarn](https://yarnpkg.com/) package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/bladeski/wordley.git
cd wordley

# Install dependencies
yarn install
```

### Development

```bash
# Start the development server with hot reload
yarn start
```

The game will be available at `http://localhost:1234`.

### Production Build

```bash
# Build for production
yarn build
```

The optimized output will be in the `dist/` directory.

## How to Play

1. **Enter a Guess** - Type a word using your keyboard or click the tiles
2. **Submit** - Press Enter or click the "Guess" button
3. **Read the Feedback**:
   - 🟩 **Green** - Letter is correct and in the right position
   - 🟨 **Yellow** - Letter is in the word but in the wrong position
   - ⬜ **Gray** - Letter is not in the word
4. **Keep Guessing** - Use the feedback to narrow down the word
5. **Win** - Guess the word within 6 attempts!

### Settings

Click the gear icon (⚙️) to access settings:

- **Difficulty** - Select word length (4, 5, or 6 letters)
- **Timer** - Enable a countdown timer for each guess
- **Players** - Switch between 1 and 2 player modes

## Project Structure

```
wordley/
├── src/
│   ├── index.html      # Main HTML entry point
│   ├── game.ts         # Core game logic
│   ├── tile-component.ts # Custom <game-tile> web component
│   └── style.css       # Styles and theming
├── static/
│   ├── words-4-letter.json
│   ├── words-5-letter.json
│   └── words-6-letter.json
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Pages deployment
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment

This project includes a GitHub Actions workflow for automatic deployment to GitHub Pages.

### Setup GitHub Pages

1. Push your code to the `main` branch
2. Go to your repository Settings → Pages
3. Under "Source", select "GitHub Actions"
4. The workflow will automatically build and deploy on each push to `main`

### Manual Deployment

```bash
yarn build
# Deploy the contents of dist/ to your hosting provider
```

## Technologies Used

- **TypeScript** - Type-safe JavaScript
- **Parcel** - Zero-config bundler
- **Web Components** - Native custom elements with Shadow DOM
- **CSS Custom Properties** - Theming and design tokens
- **Dictionary API** - Word definitions

## Browser Support

Supports all modern browsers:

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Bladeski** - [GitHub](https://github.com/bladeski)

## Acknowledgments

- Inspired by [Wordle](https://www.nytimes.com/games/wordle/index.html) by Josh Wardle
- Word lists curated for gameplay balance
- [Dictionary API](https://dictionaryapi.dev/) for word definitions
