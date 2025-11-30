export default {
  // Base URL for scraping
  baseUrl: 'https://www.tone3000.com/search',
  
  // Download settings
  downloadDir: './downloads',
  
  // Pagination settings
  totalPages: 219,           // Total number of pages (set to null for auto-detect)
  
  // Concurrency settings
  concurrency: 5,            // Number of simultaneous downloads (1-10 recommended)
  pageScanConcurrency: 10,   // Number of simultaneous page scans during URL collection
  
  // Rate limiting settings (in milliseconds)
  delays: {
    betweenPages: 1000,      // 1 second between page navigations (for parallel scanning)
    betweenItems: 500,       // 0.5 seconds between item visits (reduced for concurrent)
    afterDownload: 3000,     // 3 seconds after download starts
  },
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 5000,          // 5 seconds before retry
  
  // Browser settings
  headless: true,            // Set to false to see the browser
  browserTimeout: 60000,     // 60 seconds
  
  // Progress tracking
  stateFile: './progress.json',
  
  // Logging settings
  logDir: './logs',
  logLevel: 'info',          // 'debug', 'info', 'warn', 'error'
  
  // Download timeout
  downloadTimeout: 300000,   // 5 minutes for large files
};