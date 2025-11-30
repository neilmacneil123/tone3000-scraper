# Tone3000 Web Scraper

A robust Node.js-based web scraper for downloading all .zip files from [tone3000.com/search](https://www.tone3000.com/search).

## Features

✅ **Automated Pagination** - Automatically navigates through all 200+ pages  
✅ **Resume Capability** - Can resume from where it left off if interrupted  
✅ **Rate Limiting** - Respectful scraping with configurable delays (2-3 seconds)  
✅ **Organized Downloads** - Files saved in folders named after each item  
✅ **Error Handling** - Automatic retry logic for failed downloads (3 attempts)  
✅ **Progress Tracking** - Real-time progress updates and statistics  
✅ **Graceful Shutdown** - Save progress on interruption (Ctrl+C)  
✅ **Comprehensive Logging** - Detailed logs saved to files for debugging  

## Prerequisites

- Node.js v16 or higher
- npm or yarn

**Note:** You do NOT need Chrome or Chromium installed! Puppeteer automatically downloads and bundles its own version of Chromium during installation (~170-300MB).

### Linux Users (Ubuntu/Debian)

If you're on Ubuntu/Debian Linux, you need to install Chrome's dependencies first:

```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2
```

**For other Linux distributions:**
```bash
# Fedora/RHEL
sudo yum install -y nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXrandr mesa-libgbm alsa-lib

# Arch Linux
sudo pacman -S nss nspr atk at-spi2-atk cups libdrm libxkbcommon libxcomposite libxdamage libxrandr mesa alsa-lib
```

### Windows/macOS Users

No additional dependencies needed - just Node.js!

## Installation

1. Clone or download this repository
2. **(Linux only)** Install system dependencies using the commands above
3. Install npm dependencies:

```bash
npm install
```

## Usage

### Start the scraper:

```bash
npm start
```

### Watch mode (auto-restart on file changes):

```bash
npm run dev
```

### How it works:

1. The scraper navigates to the search page
2. **Automatically iterates through all pages** (using URL pagination)
   - Navigates through pages: ?page=1, ?page=2, ?page=3, etc.
   - Extracts items from each page until no more pages found
   - Typically processes 200+ pages with ~1600+ total items
3. Collects all unique item URLs from all pages
4. For each item:
   - Visits the item detail page
   - Clicks the "Download All" button
   - Waits for download to complete
   - Saves file in organized folder structure
5. Saves progress after each download
6. Generates summary report at completion

**Note:** The initial page loading phase may take ~5-10 minutes to collect all items from 200+ pages. Progress will be logged as each page is processed.

### File Structure:

```
scrapper/
├── downloads/              # Downloaded files (organized by item name)
│   ├── Item-Name-1/
│   │   └── downloads.zip
│   ├── Item-Name-2/
│   │   └── downloads.zip
│   └── ...
├── logs/                   # Log files
│   └── scraper-*.log
├── progress.json          # State file for resume capability
├── src/
│   ├── index.js          # Main entry point
│   ├── config.js         # Configuration settings
│   ├── scraper/
│   │   ├── navigator.js  # Page navigation logic
│   │   └── itemScraper.js # Item scraping logic
│   └── utils/
│       ├── logger.js     # Logging system
│       ├── stateManager.js # Progress tracking
│       └── rateLimiter.js  # Rate limiting
└── package.json
```

## Configuration

Edit `src/config.js` to customize:

```javascript
{
  // Download directory
  downloadDir: './downloads',
  
  // Delays (in milliseconds)
  delays: {
    betweenPages: 2000,      // 2 seconds
    betweenItems: 2500,      // 2.5 seconds
    afterDownload: 3000,     // 3 seconds
  },
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 5000,
  
  // Browser settings
  headless: true,            // Set to false to see the browser
  
  // Other settings...
}
```

## Resume Capability

If the scraper is interrupted (Ctrl+C, crash, etc.), it automatically saves progress to `progress.json`. When you restart:

```bash
npm start
```

It will automatically resume from where it left off, skipping already downloaded items.

### Reset Progress:

To start fresh, delete the `progress.json` file:

```bash
rm progress.json
```

## Monitoring Progress

The scraper provides real-time updates:

- Current page being processed
- Items per page
- Download success/failure
- Overall statistics

Example output:
```
[2024-01-01T12:00:00.000Z] [INFO] Processing page 5/200
[2024-01-01T12:00:02.000Z] [INFO] Found 10 items on page 5
Progress: 3/10 (30.0%) - https://www.tone3000.com/tones/item-name
[2024-01-01T12:00:05.000Z] [SUCCESS] Successfully downloaded: Item-Name/downloads.zip
```

## Troubleshooting

### Download not starting:

1. Check if "Download All" button exists on the page
2. Try setting `headless: false` in config to watch the browser
3. Check logs for specific error messages

### Scraper stuck:

1. Stop with Ctrl+C (progress will be saved)
2. Check `logs/` directory for errors
3. Delete `progress.json` to start fresh if needed

### Downloads incomplete:

- Failed downloads are tracked in `progress.json`
- Check the summary report for failed items
- Retry logic attempts downloads 3 times automatically

## Output

After completion, you'll see a summary:

```
============================================================
📊 SCRAPING SUMMARY
============================================================
✅ Successful downloads: 1580
❌ Failed downloads: 12
⏭️  Skipped items: 8
📄 Total processed: 1600
⏱️  Duration: 245 minutes
💾 Download location: ./downloads
📝 Log file: ./logs/scraper-2024-01-01.log
============================================================
```

## Notes

- The scraper respects rate limits to avoid overwhelming the server
- Progress is saved after each item, so you can safely stop at any time
- Large downloads may take time - the timeout is set to 5 minutes per file
- All downloads are verified before marking as complete

## License

MIT

## Disclaimer

This tool is for educational purposes. Please respect the website's terms of service and robots.txt. Use responsibly and consider the server load.