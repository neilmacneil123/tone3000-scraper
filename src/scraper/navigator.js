class Navigator {
  constructor(page, logger, rateLimiter, config) {
    this.page = page;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.config = config;
  }

  async detectTotalPages() {
    try {
      // Wait for search results to load
      await this.page.waitForSelector('a[href*="/tones/"]', { timeout: 10000 });
      
      // Try to find pagination information
      // The site might have pagination controls or we need to scroll/load more
      const hasMoreButton = await this.page.$('button:has-text("Load More")');
      const hasPagination = await this.page.$('nav[aria-label="pagination"]');
      
      if (hasPagination) {
        // Extract page numbers from pagination
        const pages = await this.page.$$eval(
          'nav[aria-label="pagination"] a, nav[aria-label="pagination"] button',
          elements => elements.map(el => {
            const text = el.textContent.trim();
            const num = parseInt(text);
            return isNaN(num) ? 0 : num;
          }).filter(n => n > 0)
        );
        const maxPage = Math.max(...pages, 1);
        this.logger.info(`Detected ${maxPage} total pages`);
        return maxPage;
      }
      
      // If no pagination found, we might need to implement infinite scroll detection
      // For now, we'll check the console log that showed "1620 tones"
      this.logger.warn('Could not detect pagination, will navigate until no more items found');
      return 999; // Large number to iterate until we find no more items
      
    } catch (error) {
      this.logger.error('Failed to detect total pages', { error: error.message });
      return 1;
    }
  }

  async extractItemUrls(browser) {
    try {
      // Use parallel scanning if total pages is known
      if (this.config.totalPages) {
        this.logger.info(`Using parallel scanning for ${this.config.totalPages} pages with ${this.config.pageScanConcurrency} workers`);
        const urls = await this.loadAllItemsParallel(browser);
        this.logger.debug(`Extracted ${urls.length} total item URLs`);
        return urls;
      } else {
        // Fall back to sequential scanning
        this.logger.info('Using sequential page scanning (auto-detect mode)');
        const urls = await this.loadAllItemsFromAllPages();
        this.logger.debug(`Extracted ${urls.length} total item URLs`);
        return urls;
      }
      
    } catch (error) {
      this.logger.error('Failed to extract item URLs', { error: error.message });
      return [];
    }
  }

  async loadAllItemsParallel(browser) {
    try {
      const totalPages = this.config.totalPages;
      const concurrency = this.config.pageScanConcurrency;
      
      this.logger.info(`Scanning ${totalPages} pages in parallel...`);
      
      const allUrls = new Set();
      let pagesScanned = 0;
      
      // Create worker function
      const scanPage = async (pageNum, workerPage) => {
        try {
          // Construct URL with page parameter
          const baseUrl = this.config.baseUrl.split('?')[0];
          const pageUrl = pageNum === 1
            ? baseUrl
            : `${baseUrl}?page=${pageNum}`;
          
          this.logger.debug(`[Worker] Navigating to: ${pageUrl}`);
          await workerPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Wait a bit for content to load
          await this.rateLimiter.waitCustom(2000);
          
          // Try to find items with multiple selectors
          const pageUrls = await workerPage.evaluate(() => {
            const selectors = [
              'a[href*="/tones/"]',
              'a[href*="/tone/"]',
              'a[class*="tone"]',
              'a[class*="item"]'
            ];
            
            const urlSet = new Set();
            
            for (const selector of selectors) {
              const anchors = document.querySelectorAll(selector);
              anchors.forEach(a => {
                const href = a.getAttribute('href');
                if (href && (href.includes('/tones/') || href.includes('/tone/'))) {
                  const url = href.startsWith('http') ? href : `https://www.tone3000.com${href}`;
                  urlSet.add(url);
                }
              });
              
              if (urlSet.size > 0) break; // Found items, stop trying selectors
            }
            
            return Array.from(urlSet);
          });
          
          pagesScanned++;
          if (pagesScanned % 10 === 0 || pagesScanned === totalPages) {
            this.logger.info(`Progress: ${pagesScanned}/${totalPages} pages scanned (${allUrls.size} items found)`);
          }
          
          return pageUrls;
          
        } catch (error) {
          this.logger.warn(`Failed to scan page ${pageNum}:`, { error: error.message });
          return [];
        }
      };
      
      // Create worker pool
      const workers = [];
      for (let i = 0; i < concurrency; i++) {
        const workerPage = await browser.newPage();
        await workerPage.setViewport({ width: 1920, height: 1080 });
        workers.push(workerPage);
      }
      
      // Process all pages with worker pool
      const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
      let currentIndex = 0;
      
      const processNext = async (workerPage) => {
        while (currentIndex < pageNumbers.length) {
          const pageNum = pageNumbers[currentIndex++];
          const pageUrls = await scanPage(pageNum, workerPage);
          pageUrls.forEach(url => allUrls.add(url));
        }
      };
      
      // Start all workers
      await Promise.all(workers.map(worker => processNext(worker)));
      
      // Close worker pages
      for (const worker of workers) {
        await worker.close();
      }
      
      this.logger.success(`Finished parallel scanning. Total unique items: ${allUrls.size}`);
      return Array.from(allUrls);
      
    } catch (error) {
      this.logger.error('Failed to load items in parallel', { error: error.message });
      return [];
    }
  }

  async loadAllItemsFromAllPages() {
    try {
      this.logger.info('Loading items from all pages via URL pagination...');
      
      const allUrls = new Set();
      let currentPage = 1;
      let consecutiveEmptyPages = 0;
      const maxEmptyPages = 3;

      while (consecutiveEmptyPages < maxEmptyPages) {
        // Navigate to page
        const pageUrl = currentPage === 1
          ? this.page.url()
          : `${this.page.url().split('?')[0]}?page=${currentPage}`;
        
        if (currentPage > 1) {
          this.logger.debug(`Navigating to page ${currentPage}: ${pageUrl}`);
          await this.page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.rateLimiter.waitCustom(1000);
        }

        // Extract items from current page
        const pageUrls = await this.page.$$eval(
          'a[href*="/tones/"]',
          anchors => {
            const urlSet = new Set();
            anchors.forEach(a => {
              const href = a.getAttribute('href');
              if (href && href.includes('/tones/')) {
                const url = href.startsWith('http') ? href : `https://www.tone3000.com${href}`;
                urlSet.add(url);
              }
            });
            return Array.from(urlSet);
          }
        );

        if (pageUrls.length === 0) {
          consecutiveEmptyPages++;
          this.logger.debug(`No items on page ${currentPage} (${consecutiveEmptyPages}/${maxEmptyPages} empty)`);
        } else {
          consecutiveEmptyPages = 0;
          
          // Add new URLs
          const newUrlCount = pageUrls.filter(url => !allUrls.has(url)).length;
          pageUrls.forEach(url => allUrls.add(url));
          
          this.logger.info(`Page ${currentPage}: ${pageUrls.length} items (${newUrlCount} new, total: ${allUrls.size})`);
        }

        currentPage++;
        
        // Safety limit to prevent infinite loops
        if (currentPage > 300) {
          this.logger.warn('Reached safety limit of 300 pages');
          break;
        }
      }

      this.logger.success(`Finished loading all pages. Total unique items: ${allUrls.size}`);
      return Array.from(allUrls);

    } catch (error) {
      this.logger.error('Failed to load all items from pages', { error: error.message });
      return [];
    }
  }

  async navigateToNextPage(currentPage) {
    try {
      // Method 1: Try pagination buttons
      const nextButton = await this.page.$('button[aria-label="Next page"], a[aria-label="Next page"]');
      if (nextButton) {
        await nextButton.click();
        await this.rateLimiter.waitBetweenPages();
        await this.page.waitForSelector('a[href*="/tones/"]', { timeout: 10000 });
        return true;
      }

      // Method 2: Try URL parameter modification (e.g., ?page=2)
      const currentUrl = this.page.url();
      const url = new URL(currentUrl);
      
      // Check if there's already a page parameter
      const hasPageParam = url.searchParams.has('page');
      const nextPageNum = currentPage + 1;
      
      url.searchParams.set('page', nextPageNum.toString());
      
      this.logger.debug(`Navigating to page ${nextPageNum}: ${url.href}`);
      await this.page.goto(url.href, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.rateLimiter.waitBetweenPages();
      
      // Check if we actually got new content
      const hasItems = await this.page.$('a[href*="/tones/"]');
      return !!hasItems;
      
    } catch (error) {
      this.logger.error('Failed to navigate to next page', { error: error.message });
      return false;
    }
  }

  async scrollToBottom() {
    try {
      await this.page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    } catch (error) {
      this.logger.debug('Scroll to bottom failed', { error: error.message });
    }
  }
}

export default Navigator;