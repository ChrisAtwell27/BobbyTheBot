// ===============================================
// MEMORY MANAGEMENT UTILITIES
// ===============================================
// Utilities to prevent memory leaks in long-running Discord bot processes

// Global registry to track all CleanupMap instances for graceful shutdown
if (!global.cleanupMapRegistry) {
    global.cleanupMapRegistry = [];
}

/**
 * LimitedMap - A Map with automatic size limiting using LRU (Least Recently Used) eviction
 * Prevents unbounded growth by removing oldest entries when limit is reached
 */
class LimitedMap extends Map {
    /**
     * @param {number} maxSize - Maximum number of entries allowed (default: 1000)
     */
    constructor(maxSize = 1000) {
        super();
        this.maxSize = maxSize;
    }

    /**
     * Set a key-value pair, automatically removing oldest entry if limit exceeded
     * @param {*} key - The key
     * @param {*} value - The value
     * @returns {LimitedMap} - This map instance
     */
    set(key, value) {
        // If key already exists, delete it first to update insertion order
        if (this.has(key)) {
            this.delete(key);
        }

        // Add the new entry
        super.set(key, value);

        // If size exceeded, remove oldest entry (first entry in iteration order)
        if (this.size > this.maxSize) {
            const firstKey = this.keys().next().value;
            this.delete(firstKey);
            console.log(`[Memory] LimitedMap evicted oldest entry: ${firstKey} (size: ${this.size}/${this.maxSize})`);
        }

        return this;
    }
}

/**
 * CleanupMap - A Map with automatic cleanup of expired entries
 * Useful for cooldowns, temporary caches, and time-limited data
 */
class CleanupMap extends Map {
    /**
     * @param {number} maxAge - Maximum age in milliseconds before entries expire (default: 1 hour)
     * @param {number} cleanupInterval - How often to run cleanup in milliseconds (default: 5 minutes)
     */
    constructor(maxAge = 60 * 60 * 1000, cleanupInterval = 5 * 60 * 1000) {
        super();
        this.maxAge = maxAge;
        this.timestamps = new Map(); // Track insertion time for each key

        // Start automatic cleanup
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, cleanupInterval);

        // Register this instance for graceful shutdown cleanup
        global.cleanupMapRegistry.push(this);

        console.log(`[Memory] CleanupMap initialized - maxAge: ${maxAge}ms, cleanup every ${cleanupInterval}ms`);
    }

    /**
     * Set a key-value pair with automatic timestamp tracking
     * @param {*} key - The key
     * @param {*} value - The value
     * @returns {CleanupMap} - This map instance
     */
    set(key, value) {
        super.set(key, value);
        this.timestamps.set(key, Date.now());
        return this;
    }

    /**
     * Delete a key and its timestamp
     * @param {*} key - The key to delete
     * @returns {boolean} - True if key was deleted
     */
    delete(key) {
        this.timestamps.delete(key);
        return super.delete(key);
    }

    /**
     * Remove all expired entries
     * @returns {number} - Number of entries removed
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, timestamp] of this.timestamps) {
            if (now - timestamp > this.maxAge) {
                this.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`[Memory] CleanupMap removed ${removed} expired entries (${this.size} remaining)`);
        }

        return removed;
    }

    /**
     * Stop the automatic cleanup timer (call when shutting down)
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            console.log('[Memory] CleanupMap cleanup timer stopped');
        }

        // Remove from global registry
        const index = global.cleanupMapRegistry.indexOf(this);
        if (index > -1) {
            global.cleanupMapRegistry.splice(index, 1);
        }
    }

    /**
     * Clear all entries and timestamps
     */
    clear() {
        super.clear();
        this.timestamps.clear();
    }
}

/**
 * Manually clean up old entries from a regular Map based on a timestamp property
 * Useful for cleaning up game states, lobbies, etc.
 *
 * @param {Map} map - The Map to clean up
 * @param {number} maxAge - Maximum age in milliseconds
 * @param {string} timestampKey - Property name containing the timestamp (default: 'createdAt')
 * @returns {number} - Number of entries removed
 */
function cleanupOldEntries(map, maxAge, timestampKey = 'createdAt') {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of map) {
        const timestamp = value[timestampKey];

        if (timestamp && (now - timestamp > maxAge)) {
            map.delete(key);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`[Memory] Cleaned up ${removed} old entries from Map (${map.size} remaining)`);
    }

    return removed;
}

/**
 * Manually clean up finished game sessions from a Map
 * Removes entries where a specific property indicates completion
 *
 * @param {Map} map - The Map to clean up
 * @param {string} statusKey - Property name containing the status (default: 'status')
 * @param {Array<string>} completedStatuses - Status values indicating completion (default: ['finished', 'ended', 'completed'])
 * @returns {number} - Number of entries removed
 */
function cleanupFinishedGames(map, statusKey = 'status', completedStatuses = ['finished', 'ended', 'completed']) {
    let removed = 0;

    for (const [key, value] of map) {
        const status = value[statusKey];

        if (status && completedStatuses.includes(status)) {
            map.delete(key);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`[Memory] Cleaned up ${removed} finished games from Map (${map.size} remaining)`);
    }

    return removed;
}

/**
 * Set up periodic cleanup for a Map
 * Returns the interval ID so it can be cleared later
 *
 * @param {Map} map - The Map to clean up
 * @param {Function} cleanupFn - Cleanup function to call
 * @param {number} interval - Cleanup interval in milliseconds (default: 5 minutes)
 * @returns {NodeJS.Timeout} - The interval ID
 */
function setupPeriodicCleanup(map, cleanupFn, interval = 5 * 60 * 1000) {
    console.log(`[Memory] Setting up periodic cleanup every ${interval}ms`);

    return setInterval(() => {
        cleanupFn(map);
    }, interval);
}

/**
 * Get memory usage statistics for debugging
 * @returns {Object} - Memory usage information
 */
function getMemoryStats() {
    const usage = process.memoryUsage();
    return {
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
        external: `${Math.round(usage.external / 1024 / 1024)} MB`
    };
}

/**
 * Destroy all registered CleanupMap instances
 * Call this during graceful shutdown to stop all cleanup timers
 * @returns {number} - Number of CleanupMaps destroyed
 */
function destroyAllCleanupMaps() {
    let count = 0;
    if (global.cleanupMapRegistry && Array.isArray(global.cleanupMapRegistry)) {
        // Create a copy since destroy() modifies the array
        const maps = [...global.cleanupMapRegistry];
        maps.forEach(cleanupMap => {
            if (cleanupMap && typeof cleanupMap.destroy === 'function') {
                cleanupMap.destroy();
                count++;
            }
        });
    }
    return count;
}

module.exports = {
    LimitedMap,
    CleanupMap,
    cleanupOldEntries,
    cleanupFinishedGames,
    setupPeriodicCleanup,
    getMemoryStats,
    destroyAllCleanupMaps
};
