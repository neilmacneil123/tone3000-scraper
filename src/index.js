import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import config from './config.js';
import Logger from './utils/logger.js';
import StateManager from './utils/stateManager.js';
import RateLimiter from './utils/rateLimiter.js';
import Navigator from './scraper/navigator.js';
import ItemScraper from './scraper/itemScraper.js';

class Tone3000Scraper {
  constructor() {
    this.config = config;
    this.logger = null;
    this.stateManager = null;
    this.rateLimiter = null;
    this.browser = null;
    this.page = null;
    this.navigator = null;
    this.itemScraper = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    console.log('🎵 Tone3000 Scraper Starting...\n');

    // Initialize logger
    this.logger = new Logger(this.config);
    await this.logger.initialize();
    
    // Initialize state manager
    this.stateManager = new StateManager(this.config.stateFile);
    const hasExistingState = await this.stateManager.load();
    
    if (hasExistingState) {
      this.logger.info('Resuming from previous session');
      this.logger.info(`Last processed page: ${this.stateManager.getLastProcessedPage()}`);
    } else {
      this.logger.info('Starting fresh scraping session');
    }

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter(this.config.delays);

    // Create download directory
    await fs.mkdir(this.config.downloadDir, { recursive: true });

    // Setup graceful shutdown
    this.setupShutdownHandlers();

    this.logger.success('Initialization complete\n');
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logger.info(`\n${signal} received. Saving progress and shutting down gracefully...`);
      
      if (this.stateManager) {
        await this.stateManager.save();
        this.logger.info('Progress saved successfully');
      }

      if (this.browser) {
        await this.browser.close();
        this.logger.info('Browser closed');
      }

      this.printSummary();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async launchBrowser() {
    this.logger.info('Launching browser...');
    
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.page = await this.browser.newPage();
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Initialize navigator and scraper
    this.navigator = new Navigator(this.page, this.logger, this.rateLimiter);
    this.itemScraper = new ItemScraper(this.page, this.logger, this.rateLimiter, this.config);

    this.logger.success('Browser launched successfully');
  }

  async scrapeAllPages() {
    try {
      // Navigate to search page
      this.logger.info(`Navigating to ${this.config.baseUrl}`);
      await this.page.goto(this.config.baseUrl, { 
        waitUntil: 'networkidle2',
        timeout: this.config.browserTimeout 
      });

      // Detect total pages (or use large number for infinite scroll sites)
      const totalPages = await this.navigator.detectTotalPages();
      this.logger.info(`Total pages to process: ${totalPages === 999 ? 'Unknown (will continue until no items found)' : totalPages}`);

      // Get starting page
      const startPage = this.stateManager.getLastProcessedPage() + 1;
      let currentPage = startPage;
      let consecutiveEmptyPages = 0;

      // Process each page
      for (currentPage = startPage; currentPage <= totalPages; currentPage++) {
        if (this.isShuttingDown) break;

        this.logger.info(`\n${'='.repeat(60)}`);
        this.logger.info(`Processing page ${currentPage}/${totalPages === 999 ? '?' : totalPages}`);
        this.logger.info('='.repeat(60));

        // Navigate to the current page if not already there
        if (currentPage > startPage) {
          const hasMorePages = await this.navigator.navigateToNextPage(currentPage - 1);
          if (!hasMorePages) {
            this.logger.info('No more pages found');
            break;
          }
        }

        // Extract item URLs from current page
        const itemUrls = await this.navigator.extractItemUrls();
        
        if (itemUrls.length === 0) {
          consecutiveEmptyPages++;
          this.logger.warn(`No items found on page ${currentPage}`);
          
          if (consecutiveEmptyPages >= 3) {
            this.logger.info('Reached end of items (3 consecutive empty pages)');
            break;
          }
          
          await this.stateManager.updatePage(currentPage);
          continue;
        }

        consecutiveEmptyPages = 0;
        this.logger.info(`Found ${itemUrls.length} items on page ${currentPage}`);

        // Process each item
        for (let i = 0; i < itemUrls.length; i++) {
          if (this.isShuttingDown) break;

          const itemUrl = itemUrls[i];

          // Skip if already processed
          if (this.stateManager.isItemProcessed(itemUrl)) {
            this.logger.debug(`Skipping already processed item: ${itemUrl}`);
            continue;
          }

          // Progress indicator
          const totalProcessed = this.stateManager.getStats().successfulDownloads + 
                                this.stateManager.getStats().failedDownloads +
                                this.stateManager.getStats().skippedItems;
          this.logger.progress(i + 1, itemUrls.length, itemUrl);

          // Scrape the item
          const result = await this.itemScraper.scrapeItem(itemUrl);

          // Update state
          if (result.success) {
            await this.stateManager.markItemProcessed(itemUrl, true);
          } else {
            if (result.reason === 'No download button found') {
              await this.stateManager.markSkipped(itemUrl);
            } else {
              await this.stateManager.markItemProcessed(itemUrl, false);
            }
          }

          // Rate limiting between items
          if (i < itemUrls.length - 1) {
            await this.rateLimiter.waitBetweenItems();
          }
        }

        // Update page progress
        await this.stateManager.updatePage(currentPage);
        
        // Rate limiting between pages
        if (currentPage < totalPages) {
          await this.rateLimiter.waitBetweenPages();
        }
      }

      this.logger.success('\n✅ Scraping completed!');
      
    } catch (error) {
      this.logger.error('Fatal error during scraping', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  printSummary() {
    const stats = this.stateManager.getStats();
    const failedItems = this.stateManager.getFailedItems();

    console.log('\n' + '='.repeat(60));
    console.log('📊 SCRAPING SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful downloads: ${stats.successfulDownloads}`);
    console.log(`❌ Failed downloads: ${stats.failedDownloads}`);
    console.log(`⏭️  Skipped items: ${stats.skippedItems}`);
    console.log(`📄 Total processed: ${stats.successfulDownloads + stats.failedDownloads + stats.skippedItems}`);
    
    if (stats.startTime) {
      const start = new Date(stats.startTime);
      const end = stats.endTime ? new Date(stats.endTime) : new Date();
      const duration = Math.round((end - start) / 1000 / 60);
      console.log(`⏱️  Duration: ${duration} minutes`);
    }

    if (failedItems.length > 0) {
      console.log('\n❌ Failed Items:');
      failedItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.url} (${item.attempts} attempts)`);
      });
    }

    console.log('\n💾 Download location: ' + this.config.downloadDir);
    console.log('📝 Log file: ' + this.logger.logFile);
    console.log('💾 Progress file: ' + this.config.stateFile);
    console.log('='.repeat(60) + '\n');
  }

  async run() {
    try {
      await this.initialize();
      await this.launchBrowser();
      await this.scrapeAllPages();
      await this.stateManager.finalize();
      
      if (this.browser) {
        await this.browser.close();
      }

      this.printSummary();
      process.exit(0);
      
    } catch (error) {
      this.logger.error('Scraper failed', { error: error.message, stack: error.stack });
      
      if (this.stateManager) {
        await this.stateManager.save();
      }
      
      if (this.browser) {
        await this.browser.close();
      }

      this.printSummary();
      process.exit(1);
    }
  }
}

// Start the scraper
const scraper = new Tone3000Scraper();
scraper.run();