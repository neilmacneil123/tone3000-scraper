import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

class Logger {
  constructor(config) {
    this.logDir = config.logDir;
    this.logLevel = config.logLevel;
    this.logFile = null;
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  async initialize() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(this.logDir, `scraper-${timestamp}.log`);
    } catch (error) {
      console.error('Failed to initialize logger:', error.message);
    }
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.logLevel];
  }

  async writeToFile(message) {
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, message + '\n');
      } catch (error) {
        // Silently fail to avoid recursion
      }
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
  }

  debug(message, data) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, data);
      console.log(chalk.gray(formatted));
      this.writeToFile(formatted);
    }
  }

  info(message, data) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, data);
      console.log(chalk.blue(formatted));
      this.writeToFile(formatted);
    }
  }

  success(message, data) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('success', message, data);
      console.log(chalk.green(formatted));
      this.writeToFile(formatted);
    }
  }

  warn(message, data) {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, data);
      console.log(chalk.yellow(formatted));
      this.writeToFile(formatted);
    }
  }

  error(message, data) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, data);
      console.log(chalk.red(formatted));
      this.writeToFile(formatted);
    }
  }

  progress(current, total, itemName) {
    const percentage = ((current / total) * 100).toFixed(1);
    const message = `Progress: ${current}/${total} (${percentage}%) - ${itemName}`;
    console.log(chalk.cyan(message));
    this.writeToFile(this.formatMessage('progress', message));
  }
}

export default Logger;