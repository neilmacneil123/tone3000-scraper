class Navigator {
  constructor(page, logger, rateLimiter) {
    this.page = page;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
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

  async extractItemUrls() {
    try {
      // Scroll to load all items (infinite scroll)
      await this.loadAllItems();
      
      // Extract all item URLs from the current page
      const urls = await this.page.$$eval(
        'a[href*="/tones/"]',
        anchors => {
          // Get unique URLs
          const urlSet = new Set();
          anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/tones/')) {
              // Convert relative URLs to absolute
              const url = href.startsWith('http') ? href : `https://www.tone3000.com${href}`;
              urlSet.add(url);
            }
          });
          return Array.from(urlSet);
        }
      );

      this.logger.debug(`Extracted ${urls.length} item URLs from current page`);
      return urls;
      
    } catch (error) {
      this.logger.error('Failed to extract item URLs', { error: error.message });
      return [];
    }
  }

  async loadAllItems() {
    try {
      this.logger.info('Loading all items via infinite scroll...');
      let previousCount = 0;
      let currentCount = 0;
      let noChangeCount = 0;
      const maxAttempts = 5; // Stop after 5 consecutive scrolls with no new items

      while (noChangeCount < maxAttempts) {
        // Get current count of items
        currentCount = await this.page.$$eval(
          'a[href*="/tones/"]',
          anchors => new Set(anchors.map(a => a.getAttribute('href'))).size
        );

        this.logger.debug(`Current items: ${currentCount}, Previous: ${previousCount}`);

        // Scroll to bottom
        await this.scrollToBottom();
        
        // Wait for potential new items to load
        await this.rateLimiter.waitCustom(2000); // 2 seconds for content to load

        // Check if new items loaded
        if (currentCount === previousCount) {
          noChangeCount++;
          this.logger.debug(`No new items loaded (attempt ${noChangeCount}/${maxAttempts})`);
        } else {
          noChangeCount = 0;
          this.logger.info(`Loaded ${currentCount - previousCount} new items (total: ${currentCount})`);
        }

        previousCount = currentCount;
      }

      this.logger.success(`Finished loading all items. Total: ${currentCount}`);
      return currentCount;

    } catch (error) {
      this.logger.error('Failed to load all items', { error: error.message });
      return 0;
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