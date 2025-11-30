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
2. **Parallel page scanning** (OPTIMIZED - uses 10 workers)
   - Scans 219 pages simultaneously with 10 browser tabs
   - Extracts items from all pages in parallel
   - **Completes in ~1-2 minutes** (vs. ~7-10 minutes sequential)
   - Finds all ~5,000+ items across 219 pages
3. Collects all unique item URLs
4. **Concurrent downloads** (5 workers downloading simultaneously)
   - Each worker processes items independently
   - 5 items downloading at the same time
5. For each item:
   - Visits the item detail page
   - Clicks the "Download All" button
   - Waits for download to complete
   - Saves file in organized folder structure
6. Saves progress after each download
7. Generates summary report at completion

**Total Time Estimate:**
- Phase 1 (URL collection): ~1-2 minutes with parallel scanning
- Phase 2 (Downloads): ~2-3 hours with 5 concurrent workers
- **Total: ~2-3 hours for all 5000+ items**

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
  
  // Pagination settings
  totalPages: 219,           // Total pages (set to null for auto-detect)
  
  // Concurrency settings
  concurrency: 5,            // Simultaneous downloads (1-10 recommended)
  pageScanConcurrency: 10,   // Simultaneous page scans (5-15 recommended)
  
  // Delays (in milliseconds)
  delays: {
    betweenPages: 1000,      // 1 second (for parallel scanning)
    betweenItems: 500,       // 0.5 seconds
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

### Performance Settings

#### totalPages (NEW!)
- **`totalPages: 219`** - Pre-configured for tone3000.com
- Enables parallel page scanning (10x faster URL collection)
- Set to `null` to auto-detect (slower but works if page count changes)

#### Download Concurrency
- **`concurrency: 5`** (default) - Downloads 5 items simultaneously
- **Recommended range:** 3-10 concurrent downloads
- **Impact on speed:**
  - `concurrency: 1` → ~13-16 hours for 5000 items
  - `concurrency: 3` → ~4-5 hours
  - `concurrency: 5` → ~2.5-3 hours
  - `concurrency: 10` → ~1.5-2 hours

#### Page Scan Concurrency (NEW!)
- **`pageScanConcurrency: 10`** (default) - Scans 10 pages simultaneously
- Only used when `totalPages` is set
- **Impact on URL collection:**
  - Sequential (old): ~7-10 minutes for 219 pages
  - Parallel with 10 workers: ~1-2 minutes

**Note:** Higher concurrency uses more RAM (~100-200MB per worker). Default settings provide excellent performance.

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