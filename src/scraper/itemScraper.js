import path from 'path';

class ItemScraper {
  constructor(page, logger, rateLimiter, config) {
    this.page = page;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.config = config;
  }

  sanitizeFileName(name) {
    // Remove invalid characters from file/folder names
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  normalizeLabel(text = '') {
    return text
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  classifyItem(itemName, itemUrl = '') {
    const normalized = this.normalizeLabel(`${itemName} ${itemUrl}`);

    if (/\bir\b|impulse\s*response/.test(normalized)) {
      return 'IRs';
    }

    if (/\bnam\b|neural\s*amp\s*model/.test(normalized)) {
      return 'NAMs';
    }

    if (/\bcab\b|cabinet/.test(normalized)) {
      return 'Cabs';
    }

    if (/\bpreset\b|profile/.test(normalized)) {
      return 'Presets';
    }

    return 'Uncategorized';
  }

  buildCategoryCleanItemName(rawItemName, itemCategory) {
    const tokensToStrip = {
      IRs: ['impulse response', 'impulse', 'response', ' ir ', 'irs'],
      NAMs: ['neural amp model', 'neural', 'amp', 'model', ' nam ', 'nams'],
      Cabs: ['cabinet', 'cab', 'cabs'],
      Presets: ['preset', 'presets', 'profile', 'profiles']
    };

    let cleaned = ` ${this.normalizeLabel(rawItemName)} `;
    const replacements = tokensToStrip[itemCategory] || [];

    for (const token of replacements) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
      cleaned = cleaned.replace(new RegExp(escaped, 'gi'), ' ');
    }

    const sanitized = this.sanitizeFileName(cleaned.replace(/\s+/g, ' ').trim());
    return sanitized || this.sanitizeFileName(rawItemName) || 'unknown-item';
  }

  async extractItemName() {
    try {
      // Try to get the item title from the page
      const titleSelectors = [
        'h1',
        '[class*="title"]',
        '[class*="heading"]'
      ];

      for (const selector of titleSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await this.page.evaluate(el => el.textContent, element);
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }

      // Fallback: use URL slug
      const url = this.page.url();
      const urlParts = url.split('/');
      const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      return this.sanitizeFileName(slug) || 'unknown-item';
      
    } catch (error) {
      this.logger.warn('Failed to extract item name', { error: error.message });
      return 'unknown-item';
    }
  }

  async findDownloadButton() {
    try {
      // Wait for the page to load
      await this.page.waitForSelector('button, a', { timeout: 10000 });

      // Try multiple selectors for the Download All button
      const downloadSelectors = [
        'button:has-text("Download All")',
        'a:has-text("Download All")',
        'button[aria-label*="Download All"]',
        'a[aria-label*="Download All"]',
        'button:has-text("download all")',
        'button[class*="download"]',
        'a[class*="download"]'
      ];

      for (const selector of downloadSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            const text = await this.page.evaluate(el => el.textContent, button);
            if (text.toLowerCase().includes('download all') || text.toLowerCase().includes('download')) {
              this.logger.debug('Found download button with selector:', selector);
              return button;
            }
          }
        } catch (err) {
          // Try next selector
          continue;
        }
      }

      // Alternative: find by text content
      const buttons = await this.page.$$('button, a');
      for (const button of buttons) {
        const text = await this.page.evaluate(el => el.textContent, button);
        if (text && (text.includes('Download All') || text.includes('download all'))) {
          this.logger.debug('Found download button by text content');
          return button;
        }
      }

      return null;
      
    } catch (error) {
      this.logger.error('Failed to find download button', { error: error.message });
      return null;
    }
  }

  async setupDownloadTracking(itemName, itemCategory) {
    try {
      // Create download directory for this item
      const downloadPath = path.join(this.config.downloadDir, itemCategory, itemName);
      
      // Set up download behavior
      const client = await this.page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.resolve(downloadPath)
      });

      return downloadPath;
      
    } catch (error) {
      this.logger.error('Failed to setup download tracking', { error: error.message });
      throw error;
    }
  }

  async waitForDownload(downloadPath, timeout = 300000) {
    const fs = await import('fs/promises');
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          // Check if download directory exists and has files
          const files = await fs.readdir(downloadPath);
          const zipFiles = files.filter(f => f.endsWith('.zip') && !f.endsWith('.crdownload'));
          
          if (zipFiles.length > 0) {
            clearInterval(checkInterval);
            this.logger.success(`Download completed: ${zipFiles[0]}`);
            resolve(zipFiles[0]);
          }

          // Check for timeout
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error('Download timeout'));
          }
          
        } catch (error) {
          // Directory might not exist yet, continue waiting
        }
      }, 1000); // Check every second
    });
  }

  async scrapeItem(itemUrl, retryCount = 0) {
    try {
      this.logger.info(`Scraping item: ${itemUrl}`);
      
      // Navigate to item page
      await this.page.goto(itemUrl, { 
        waitUntil: 'networkidle2', 
        timeout: this.config.browserTimeout 
      });

      // Extract item name
      const rawItemName = await this.extractItemName();
      const itemCategory = this.classifyItem(rawItemName, itemUrl);
      const itemName = this.buildCategoryCleanItemName(rawItemName, itemCategory);
      this.logger.debug(`Item name: ${itemName}`);
      this.logger.debug(`Raw item name: ${rawItemName}`);
      this.logger.debug(`Item category: ${itemCategory}`);

      // Setup download directory
      const downloadPath = await this.setupDownloadTracking(itemName, itemCategory);
      this.logger.debug(`Download path: ${downloadPath}`);

      // Find download button
      const downloadButton = await this.findDownloadButton();
      
      if (!downloadButton) {
        this.logger.warn(`No download button found for: ${itemName}`);
        return { success: false, itemName, reason: 'No download button found' };
      }

      // Click download button
      this.logger.info(`Clicking download button for: ${itemName}`);
      await downloadButton.click();

      // Wait for download to complete
      await this.rateLimiter.waitAfterDownload();
      const fileName = await this.waitForDownload(downloadPath, this.config.downloadTimeout);

      this.logger.success(`Successfully downloaded: ${itemName}/${fileName}`);
      
      return { 
        success: true, 
        itemName,
        itemCategory,
        fileName,
        downloadPath 
      };
      
    } catch (error) {
      this.logger.error(`Failed to scrape item: ${itemUrl}`, { 
        error: error.message,
        retryCount 
      });

      // Retry logic
      if (retryCount < this.config.maxRetries) {
        this.logger.info(`Retrying (${retryCount + 1}/${this.config.maxRetries})...`);
        await this.rateLimiter.waitCustom(this.config.retryDelay);
        return this.scrapeItem(itemUrl, retryCount + 1);
      }

      return { 
        success: false, 
        itemName: await this.extractItemName(), 
        error: error.message 
      };
    }
  }
}

export default ItemScraper;
