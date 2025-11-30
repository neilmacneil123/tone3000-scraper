import fs from 'fs/promises';
import path from 'path';

class StateManager {
  constructor(stateFile) {
    this.stateFile = stateFile;
    this.state = {
      lastProcessedPage: 0,
      processedItems: [],
      failedItems: [],
      stats: {
        totalItems: 0,
        successfulDownloads: 0,
        failedDownloads: 0,
        skippedItems: 0,
        startTime: null,
        endTime: null
      }
    };
  }

  async load() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      this.state = JSON.parse(data);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start fresh
        this.state.stats.startTime = new Date().toISOString();
        return false;
      }
      throw error;
    }
  }

  async save() {
    try {
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('Failed to save state:', error.message);
    }
  }

  isItemProcessed(itemUrl) {
    return this.state.processedItems.includes(itemUrl);
  }

  async markItemProcessed(itemUrl, success = true) {
    if (!this.state.processedItems.includes(itemUrl)) {
      this.state.processedItems.push(itemUrl);
    }

    if (success) {
      this.state.stats.successfulDownloads++;
      // Remove from failed if it was there
      this.state.failedItems = this.state.failedItems.filter(item => item.url !== itemUrl);
    } else {
      this.state.stats.failedDownloads++;
      const existingFailed = this.state.failedItems.find(item => item.url === itemUrl);
      if (!existingFailed) {
        this.state.failedItems.push({
          url: itemUrl,
          timestamp: new Date().toISOString(),
          attempts: 1
        });
      } else {
        existingFailed.attempts++;
      }
    }

    await this.save();
  }

  async updatePage(pageNumber) {
    this.state.lastProcessedPage = pageNumber;
    await this.save();
  }

  async markSkipped(itemUrl) {
    this.state.stats.skippedItems++;
    if (!this.state.processedItems.includes(itemUrl)) {
      this.state.processedItems.push(itemUrl);
    }
    await this.save();
  }

  getLastProcessedPage() {
    return this.state.lastProcessedPage;
  }

  getStats() {
    return this.state.stats;
  }

  getFailedItems() {
    return this.state.failedItems;
  }

  async finalize() {
    this.state.stats.endTime = new Date().toISOString();
    await this.save();
  }

  async reset() {
    this.state = {
      lastProcessedPage: 0,
      processedItems: [],
      failedItems: [],
      stats: {
        totalItems: 0,
        successfulDownloads: 0,
        failedDownloads: 0,
        skippedItems: 0,
        startTime: new Date().toISOString(),
        endTime: null
      }
    };
    await this.save();
  }
}

export default StateManager;