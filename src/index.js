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

    // Initialize navigator (uses main page for navigation)
    this.navigator = new Navigator(this.page, this.logger, this.rateLimiter);

    this.logger.success('Browser launched successfully');
    this.logger.info(`Concurrency: ${this.config.concurrency} simultaneous downloads`);
  }

  async createWorkerPage() {
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    return page;
  }

  async processItem(itemUrl, workerPage, workerId) {
    try {
      // Skip if already processed
      if (this.stateManager.isItemProcessed(itemUrl)) {
        this.logger.debug(`[Worker ${workerId}] Skipping already processed: ${itemUrl}`);
        return { skipped: true };
      }

      // Create item scraper for this worker
      const itemScraper = new ItemScraper(workerPage, this.logger, this.rateLimiter, this.config);

      // Scrape the item
      const result = await itemScraper.scrapeItem(itemUrl);

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

      return result;

    } catch (error) {
      this.logger.error(`[Worker ${workerId}] Error processing ${itemUrl}`, { error: error.message });
      await this.stateManager.markItemProcessed(itemUrl, false);
      return { success: false, error: error.message };
    }
  }

  async scrapeAllPages() {
    try {
      // Navigate to search page
      this.logger.info(`Navigating to ${this.config.baseUrl}`);
      await this.page.goto(this.config.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.browserTimeout
      });

      this.logger.info(`\n${'='.repeat(60)}`);
      this.logger.info('EXTRACTING ALL ITEMS (URL PAGINATION)');
      this.logger.info('='.repeat(60));

      // Extract ALL item URLs from all pages
      const itemUrls = await this.navigator.extractItemUrls();
      
      if (itemUrls.length === 0) {
        this.logger.warn('No items found');
        return;
      }

      this.logger.success(`\nTotal items found: ${itemUrls.length}`);
      this.logger.info(`\n${'='.repeat(60)}`);
      this.logger.info(`STARTING DOWNLOADS (${this.config.concurrency} concurrent)`);
      this.logger.info('='.repeat(60) + '\n');

      // Filter out already processed items
      const pendingUrls = itemUrls.filter(url => !this.stateManager.isItemProcessed(url));
      const alreadyProcessed = itemUrls.length - pendingUrls.length;
      
      if (alreadyProcessed > 0) {
        this.logger.info(`Skipping ${alreadyProcessed} already processed items`);
      }

      if (pendingUrls.length === 0) {
        this.logger.success('All items already processed!');
        return;
      }

      this.logger.info(`Processing ${pendingUrls.length} pending items\n`);

      // Create worker pool
      const workers = [];
      for (let i = 0; i < this.config.concurrency; i++) {
        const workerPage = await this.createWorkerPage();
        workers.push({ id: i + 1, page: workerPage, busy: false });
      }

      // Process queue
      let currentIndex = 0;
      let completed = 0;
      const total = pendingUrls.length;

      const processNext = async (worker) => {
        while (currentIndex < pendingUrls.length && !this.isShuttingDown) {
          const index = currentIndex++;
          const itemUrl = pendingUrls[index];
          
          worker.busy = true;
          
          // Progress update
          this.logger.progress(completed + 1, total, `[Worker ${worker.id}] ${itemUrl}`);
          
          await this.processItem(itemUrl, worker.page, worker.id);
          
          completed++;
          worker.busy = false;
          
          // Small delay between items
          await this.rateLimiter.waitBetweenItems();
        }
      };

      // Start all workers
      const workerPromises = workers.map(worker => processNext(worker));
      
      // Wait for all workers to complete
      await Promise.all(workerPromises);

      // Close worker pages
      for (const worker of workers) {
        await worker.page.close();
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