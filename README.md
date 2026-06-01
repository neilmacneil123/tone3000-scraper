# Tone3000 Scraper

A Node.js scraper for downloading audio files from tone3000.com.

## What it does

Downloads all .zip files from the tone3000.com search results. Handles pagination automatically and can resume if interrupted.

## Requirements

- Node.js 16+
- Linux users need some extra dependencies (see below)

## Installation

```bash
npm install
```

### Linux Setup

If you're on Ubuntu/Debian, install these first:

```bash
sudo apt-get update && sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

## Usage

```bash
npm start
```

Downloads will be saved to the `downloads/` folder, organized by category (IRs, NAMs, Cabs, Presets, Uncategorized) and then item name.

## Configuration

Edit `src/config.js` to change settings:

- `concurrency` - Number of simultaneous downloads (default: 5)
- `downloadDir` - Where files get saved
- `headless` - Set to `false` to watch the browser

## Resume capability

If the scraper stops or crashes, just run `npm start` again. It will skip already downloaded files and continue where it left off.

To start fresh, delete `progress.json`.

## Notes

The scraper is configured for tone3000.com's current structure (219 pages). If the site changes, you may need to adjust the settings.

Downloads around 5000+ items total, which takes 2-3 hours depending on your connection and the `concurrency` setting.