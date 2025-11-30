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
      // Load all items from all pages (URL-based pagination)
      const urls = await this.loadAllItemsFromAllPages();
      
      this.logger.debug(`Extracted ${urls.length} total item URLs`);
      return urls;
      
    } catch (error) {
      this.logger.error('Failed to extract item URLs', { error: error.message });
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