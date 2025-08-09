/**
 * XRPL Input Validators
 * Validation utilities for XRPL addresses, seeds, and transaction data
 */

/**
 * Validate XRPL address format
 * @param {string} address - XRPL address to validate
 * @returns {boolean} True if valid address
 */
function isValidAddress(address) {
    if (!address || typeof address !== 'string') {
        return false;
    }

    // XRPL addresses start with 'r' and are 25-34 characters long
    // Using base58 alphabet excluding 0, O, I, l
    const addressRegex = /^r[1-9A-HJ-NP-Za-km-z]{24,33}$/;
    return addressRegex.test(address);
}

/**
 * Validate XRPL seed phrase format
 * @param {string} seed - Seed phrase to validate
 * @returns {boolean} True if valid seed format
 */
function isValidSeed(seed) {
    if (!seed || typeof seed !== 'string') {
        return false;
    }

    const trimmed = seed.trim();

    // Check for hex seed (64 characters, starts with 's' for XRPL or raw hex)
    if (/^s[1-9A-HJ-NP-Za-km-z]{28,29}$/.test(trimmed)) {
        return true; // XRPL encoded seed
    }
    
    if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
        return true; // Raw hex seed
    }

    // Check for mnemonic phrase (12-24 words)
    const words = trimmed.split(/\s+/);
    if (words.length >= 12 && words.length <= 24) {
        // Basic word validation - each word should be at least 2 characters
        return words.every(word => word.length >= 2 && /^[a-zA-Z]+$/.test(word));
    }

    return false;
}

/**
 * Validate token data for creation
 * @param {Object} tokenData - Token data object
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateTokenData(tokenData) {
    const errors = [];
    
    if (!tokenData || typeof tokenData !== 'object') {
        errors.push('Token data must be an object');
        return { isValid: false, errors };
    }

    // Validate token code
    if (!tokenData.tokenCode) {
        errors.push('Token code is required');
    } else if (typeof tokenData.tokenCode !== 'string') {
        errors.push('Token code must be a string');
    } else if (tokenData.tokenCode.length < 1 || tokenData.tokenCode.length > 20) {
        errors.push('Token code must be 1-20 characters long');
    } else if (!/^[A-Za-z0-9]+$/.test(tokenData.tokenCode)) {
        errors.push('Token code must contain only alphanumeric characters');
    }

    // Validate total supply
    if (!tokenData.totalSupply && tokenData.totalSupply !== 0) {
        errors.push('Total supply is required');
    } else if (typeof tokenData.totalSupply !== 'number') {
        errors.push('Total supply must be a number');
    } else if (tokenData.totalSupply < 0) {
        errors.push('Total supply must be positive');
    } else if (tokenData.totalSupply > 1e17) {
        errors.push('Total supply exceeds maximum allowed value');
    }

    // Validate metadata (optional)
    if (tokenData.metadata) {
        if (typeof tokenData.metadata !== 'object') {
            errors.push('Metadata must be an object');
        } else {
            // Validate specific metadata fields if present
            if (tokenData.metadata.name && typeof tokenData.metadata.name !== 'string') {
                errors.push('Metadata name must be a string');
            }
            if (tokenData.metadata.description && typeof tokenData.metadata.description !== 'string') {
                errors.push('Metadata description must be a string');
            }
            if (tokenData.metadata.symbol && typeof tokenData.metadata.symbol !== 'string') {
                errors.push('Metadata symbol must be a string');
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate trustline data
 * @param {Object} trustlineData - Trustline data object
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateTrustlineData(trustlineData) {
    const errors = [];
    
    if (!trustlineData || typeof trustlineData !== 'object') {
        errors.push('Trustline data must be an object');
        return { isValid: false, errors };
    }

    // Validate issuer address
    if (!trustlineData.issuerAddress) {
        errors.push('Issuer address is required');
    } else if (!isValidAddress(trustlineData.issuerAddress)) {
        errors.push('Invalid issuer address format');
    }

    // Validate token code
    if (!trustlineData.tokenCode) {
        errors.push('Token code is required');
    } else if (typeof trustlineData.tokenCode !== 'string') {
        errors.push('Token code must be a string');
    } else if (trustlineData.tokenCode.length < 1 || trustlineData.tokenCode.length > 20) {
        errors.push('Token code must be 1-20 characters long');
    }

    // Validate trust limit (optional, defaults to large number)
    if (trustlineData.trustLimit !== undefined) {
        if (typeof trustlineData.trustLimit !== 'string' && typeof trustlineData.trustLimit !== 'number') {
            errors.push('Trust limit must be a string or number');
        } else {
            const limit = parseFloat(trustlineData.trustLimit);
            if (isNaN(limit) || limit < 0) {
                errors.push('Trust limit must be a positive number');
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate transaction amount
 * @param {string|number} amount - Amount to validate
 * @param {string} currency - Currency code (optional)
 * @returns {Object} Validation result
 */
function validateAmount(amount, currency = 'XRP') {
    const errors = [];
    
    if (amount === undefined || amount === null) {
        errors.push('Amount is required');
        return { isValid: false, errors };
    }

    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount)) {
        errors.push('Amount must be a valid number');
    } else if (numAmount <= 0) {
        errors.push('Amount must be positive');
    } else if (currency === 'XRP' && numAmount < 0.000001) {
        errors.push('XRP amount must be at least 0.000001 (1 drop)');
    } else if (numAmount > 1e17) {
        errors.push('Amount exceeds maximum allowed value');
    }

    return {
        isValid: errors.length === 0,
        errors,
        amount: numAmount
    };
}

/**
 * Validate email format (for notifications)
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with strength score
 */
function validatePassword(password) {
    const errors = [];
    let score = 0;
    
    if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { isValid: false, errors, strength: 'invalid' };
    }

    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    } else {
        score += 1;
    }

    if (password.length >= 12) {
        score += 1;
    }

    if (/[a-z]/.test(password)) {
        score += 1;
    }

    if (/[A-Z]/.test(password)) {
        score += 1;
    }

    if (/[0-9]/.test(password)) {
        score += 1;
    }

    if (/[^A-Za-z0-9]/.test(password)) {
        score += 1;
    }

    const strengthLevels = ['weak', 'fair', 'good', 'strong', 'very strong'];
    const strength = strengthLevels[Math.min(score - 1, 4)] || 'weak';

    if (score < 3) {
        errors.push('Password is too weak. Use a mix of uppercase, lowercase, numbers, and symbols');
    }

    return {
        isValid: errors.length === 0,
        errors,
        strength,
        score
    };
}

/**
 * Sanitize string input
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    return input
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .substring(0, 1000); // Limit length
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL format
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate currency code for XRPL
 * @param {string} currencyCode - Currency code to validate  
 * @returns {Object} Validation result
 */
function validateCurrencyCode(currencyCode) {
    const errors = [];
    
    if (!currencyCode || typeof currencyCode !== 'string') {
        errors.push('Currency code is required');
        return { isValid: false, error: errors[0] };
    }

    const code = currencyCode.trim().toUpperCase();
    
    // XRPL currency codes must be 3 characters and alphanumeric only
    if (code.length !== 3) {
        errors.push('Currency code must be exactly 3 characters');
    } else if (!/^[A-Z]{3}$/.test(code)) {
        errors.push('Currency code must contain only letters A-Z');
    } else if (code === 'XRP') {
        errors.push('Cannot use XRP as currency code');
    }

    return {
        isValid: errors.length === 0,
        error: errors[0] || null,
        currencyCode: code
    };
}

module.exports = {
    isValidAddress,
    isValidSeed,
    validateTokenData,
    validateTrustlineData,
    validateAmount,
    isValidEmail,
    validatePassword,
    sanitizeString,
    isValidUrl,
    validateCurrencyCode // ← Added this line
};
