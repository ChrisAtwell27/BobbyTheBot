/**
 * Performance Tracking Utilities
 * Add this to expensive operations to track their duration
 */

/**
 * Tracks execution time of async operations
 * @param {string} operationName - Name of the operation for logging
 * @param {Function} operation - Async function to execute
 * @param {number} warnThreshold - Log warning if operation takes longer than this (ms)
 */
async function trackPerformance(operationName, operation, warnThreshold = 1000) {
  const startTime = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    if (duration > warnThreshold) {
      console.warn(`[PERF] ⚠️ ${operationName} took ${duration}ms (threshold: ${warnThreshold}ms)`);
    } else if (duration > warnThreshold / 2) {
      console.log(`[PERF] ${operationName} took ${duration}ms`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[PERF] ❌ ${operationName} failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Debounces a function to prevent it from being called too frequently
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttles a function to execute at most once per interval
 * @param {Function} func - Function to throttle
 * @param {number} interval - Minimum milliseconds between calls
 */
function throttle(func, interval) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      return func(...args);
    }
  };
}

/**
 * Rate limiter that tracks call frequency
 */
class RateLimiter {
  constructor(maxCalls, perMs) {
    this.maxCalls = maxCalls;
    this.perMs = perMs;
    this.calls = [];
  }

  canCall() {
    const now = Date.now();
    this.calls = this.calls.filter(time => now - time < this.perMs);
    return this.calls.length < this.maxCalls;
  }

  recordCall() {
    this.calls.push(Date.now());
  }

  async execute(operation, operationName = 'operation') {
    if (!this.canCall()) {
      console.warn(`[RATE_LIMIT] ${operationName} rate limited (${this.maxCalls}/${this.perMs}ms)`);
      return null;
    }
    this.recordCall();
    return await operation();
  }
}

module.exports = {
  trackPerformance,
  debounce,
  throttle,
  RateLimiter
};
