class RateLimiter {
  constructor(delays) {
    this.delays = delays;
  }

  async wait(type = 'betweenItems') {
    const delay = this.delays[type] || this.delays.betweenItems;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async waitBetweenPages() {
    return this.wait('betweenPages');
  }

  async waitBetweenItems() {
    return this.wait('betweenItems');
  }

  async waitAfterDownload() {
    return this.wait('afterDownload');
  }

  async waitCustom(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }
}

export default RateLimiter;