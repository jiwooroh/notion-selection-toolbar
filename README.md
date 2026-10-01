# Notion Selection Toolbar

A Notion-style floating toolbar for [Obsidian](https://obsidian.md) that appears when you select text or a line.

## Features

- Change block type (headings, lists, quotes, etc.)
- Text color and highlight (background) color, with customizable light/dark palettes
- Inline formatting: bold, italic, strikethrough, underline, and more
- Recently used colors, plus a command to re-apply the most recent one
- Optional custom toolbar button that runs any Obsidian command

## Commands

- Toggle strikethrough
- Toggle underline
- Apply most recently used color

## Installation (manual)

1. Build the plugin:
   ```bash
   npm install
   npm run build
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/notion-selection-toolbar/`.
3. Enable **Notion Selection Toolbar** in Obsidian under Settings → Community plugins.

## Development

```bash
npm install
npm run dev
```

## License

MIT
