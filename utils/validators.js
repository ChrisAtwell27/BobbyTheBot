// ===============================================
// VALORANT INPUT VALIDATORS
// ===============================================
// Provides validation and sanitization for Valorant-related inputs
// to prevent security issues and ensure data quality

// Valid Valorant regions
const VALID_REGIONS = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];

/**
 * Validates a Valorant player name
 * @param {string} name - The player name to validate
 * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
 */
function validateValorantName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Name is required' };
    }

    // Remove leading/trailing whitespace
    const trimmed = name.trim();

    // Check length (Riot names are 3-16 characters)
    if (trimmed.length < 3) {
        return { valid: false, error: 'Name must be at least 3 characters long' };
    }
    if (trimmed.length > 16) {
        return { valid: false, error: 'Name must be no more than 16 characters long' };
    }

    // Check for valid characters (alphanumeric, spaces, and some special chars Riot allows)
    // Riot allows: letters, numbers, spaces, and some unicode characters
    // We'll be more restrictive to prevent injection attacks
    const validNamePattern = /^[a-zA-Z0-9\s\u00C0-\u017F]+$/;
    if (!validNamePattern.test(trimmed)) {
        return {
            valid: false,
            error: 'Name can only contain letters, numbers, and spaces'
        };
    }

    return { valid: true, sanitized: trimmed };
}

/**
 * Validates a Valorant tag (without the # symbol)
 * @param {string} tag - The tag to validate
 * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
 */
function validateValorantTag(tag) {
    if (!tag || typeof tag !== 'string') {
        return { valid: false, error: 'Tag is required' };
    }

    // Remove leading/trailing whitespace and any # symbols
    let trimmed = tag.trim().replace(/#/g, '');

    // Check length (Riot tags are typically 3-5 characters)
    if (trimmed.length < 3) {
        return { valid: false, error: 'Tag must be at least 3 characters long' };
    }
    if (trimmed.length > 5) {
        return { valid: false, error: 'Tag must be no more than 5 characters long' };
    }

    // Check for valid characters (alphanumeric only for tags)
    const validTagPattern = /^[a-zA-Z0-9]+$/;
    if (!validTagPattern.test(trimmed)) {
        return {
            valid: false,
            error: 'Tag can only contain letters and numbers (no # symbol needed)'
        };
    }

    return { valid: true, sanitized: trimmed };
}

/**
 * Validates a Valorant region
 * @param {string} region - The region to validate
 * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
 */
function validateRegion(region) {
    if (!region || typeof region !== 'string') {
        return { valid: false, error: 'Region is required' };
    }

    // Normalize to lowercase
    const normalized = region.toLowerCase().trim();

    // Check against whitelist
    if (!VALID_REGIONS.includes(normalized)) {
        return {
            valid: false,
            error: `Invalid region. Must be one of: ${VALID_REGIONS.join(', ')}`
        };
    }

    return { valid: true, sanitized: normalized };
}

/**
 * Sanitizes a file path to prevent path traversal attacks
 * @param {string} filePath - The file path to sanitize
 * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
 */
function sanitizeFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return { valid: false, error: 'File path is required' };
    }

    // Remove any path traversal attempts
    const dangerous = ['..', '~', '//', '\\\\', '\x00'];
    for (const pattern of dangerous) {
        if (filePath.includes(pattern)) {
            return {
                valid: false,
                error: 'Invalid file path: contains dangerous characters'
            };
        }
    }

    // Remove leading/trailing whitespace and slashes
    let sanitized = filePath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');

    // Ensure it's just a filename or relative path within allowed directories
    // Remove any absolute path indicators
    sanitized = sanitized.replace(/^[a-zA-Z]:/, ''); // Remove Windows drive letters
    sanitized = sanitized.replace(/^\//, ''); // Remove Unix root

    return { valid: true, sanitized };
}

/**
 * Validates all Valorant registration fields at once
 * @param {Object} data - Object with name, tag, region fields
 * @returns {Object} { valid: boolean, errors?: Object, sanitized?: Object }
 */
function validateValorantRegistration(data) {
    const errors = {};
    const sanitized = {};

    // Validate name
    const nameResult = validateValorantName(data.name);
    if (!nameResult.valid) {
        errors.name = nameResult.error;
    } else {
        sanitized.name = nameResult.sanitized;
    }

    // Validate tag
    const tagResult = validateValorantTag(data.tag);
    if (!tagResult.valid) {
        errors.tag = tagResult.error;
    } else {
        sanitized.tag = tagResult.sanitized;
    }

    // Validate region
    const regionResult = validateRegion(data.region);
    if (!regionResult.valid) {
        errors.region = regionResult.error;
    } else {
        sanitized.region = regionResult.sanitized;
    }

    // Return results
    if (Object.keys(errors).length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, sanitized };
}

module.exports = {
    validateValorantName,
    validateValorantTag,
    validateRegion,
    sanitizeFilePath,
    validateValorantRegistration,
    VALID_REGIONS
};
