const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const crypto = require('crypto');

/**
 * Authentication and authorization middleware
 * Provides API key validation, JWT token verification, and access control
 */

class AuthService {
    constructor() {
        // In-memory API key storage (for production, use database)
        this.apiKeys = new Map();
        this.sessions = new Map();
        
        // Generate a default API key for development
        if (process.env.NODE_ENV === 'development') {
            const devApiKey = 'dev_api_key_12345';
            this.apiKeys.set(devApiKey, {
                id: 'dev-key-1',
                name: 'Development API Key',
                permissions: ['*'], // Full access
                createdAt: new Date().toISOString(),
                lastUsed: null,
                usageCount: 0,
                isActive: true
            });
            console.log(`[AUTH] Development API Key: ${devApiKey}`);
        }
    }

    /**
     * Generate a new API key
     */
    generateApiKey(name = 'API Key', permissions = ['read']) {
        const apiKey = `rwa_${crypto.randomBytes(16).toString('hex')}`;
        const keyData = {
            id: crypto.randomUUID(),
            name,
            permissions,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            isActive: true
        };

        this.apiKeys.set(apiKey, keyData);
        return { apiKey, ...keyData };
    }

    /**
     * Validate API key
     */
    validateApiKey(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        
        if (!keyData) {
            return { valid: false, error: 'Invalid API key' };
        }

        if (!keyData.isActive) {
            return { valid: false, error: 'API key is inactive' };
        }

        // Update usage statistics
        keyData.lastUsed = new Date().toISOString();
        keyData.usageCount++;
        this.apiKeys.set(apiKey, keyData);

        return { valid: true, keyData };
    }

    /**
     * Check if API key has required permission
     */
    hasPermission(keyData, requiredPermission) {
        if (!keyData.permissions) return false;
        
        // Check for wildcard permission
        if (keyData.permissions.includes('*')) return true;
        
        // Check for specific permission
        return keyData.permissions.includes(requiredPermission);
    }

    /**
     * Create JWT token
     */
    createToken(payload, expiresIn = '24h') {
        const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
        return jwt.sign(payload, secret, { expiresIn });
    }

    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
            return jwt.verify(token, secret);
        } catch (error) {
            throw new AppError('Invalid or expired token', 401, 'TOKEN_INVALID');
        }
    }

    /**
     * Get API key statistics
     */
    getApiKeyStats() {
        const keys = Array.from(this.apiKeys.values());
        return {
            totalKeys: keys.length,
            activeKeys: keys.filter(k => k.isActive).length,
            inactiveKeys: keys.filter(k => !k.isActive).length,
            totalUsage: keys.reduce((sum, k) => sum + k.usageCount, 0)
        };
    }
}

// Create singleton auth service
const authService = new AuthService();

/**
 * Middleware to validate API key from header or query parameter
 */
const validateApiKey = (req, res, next) => {
    try {
        // Get API key from header or query parameter
        const apiKey = req.headers['x-api-key'] || 
                      req.headers['authorization']?.replace('Bearer ', '') ||
                      req.query.apiKey;

        if (!apiKey) {
            throw new AppError('API key is required', 401, 'API_KEY_REQUIRED');
        }

        // Validate API key
        const validation = authService.validateApiKey(apiKey);
        
        if (!validation.valid) {
            throw new AppError(validation.error, 401, 'API_KEY_INVALID');
        }

        // Attach key data to request for use in controllers
        req.apiKey = validation.keyData;
        req.apiKeyString = apiKey;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Optional API key validation (doesn't fail if no key provided)
 */
const optionalApiKey = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || 
                      req.headers['authorization']?.replace('Bearer ', '') ||
                      req.query.apiKey;

        if (apiKey) {
            const validation = authService.validateApiKey(apiKey);
            if (validation.valid) {
                req.apiKey = validation.keyData;
                req.apiKeyString = apiKey;
            }
        }

        next();
    } catch (error) {
        // Don't fail for optional validation
        next();
    }
};

/**
 * Middleware to check specific permissions
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        try {
            if (!req.apiKey) {
                throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
            }

            if (!authService.hasPermission(req.apiKey, permission)) {
                throw new AppError(`Permission '${permission}' required`, 403, 'PERMISSION_DENIED');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * JWT token validation middleware
 */
const validateJWT = (req, res, next) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '') ||
                     req.headers['x-auth-token'];

        if (!token) {
            throw new AppError('Access token is required', 401, 'TOKEN_REQUIRED');
        }

        const decoded = authService.verifyToken(token);
        req.user = decoded;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Rate limiting by API key
 */
const rateLimitByApiKey = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    const requestCounts = new Map();

    return (req, res, next) => {
        try {
            const identifier = req.apiKeyString || req.ip;
            const now = Date.now();
            const windowStart = now - windowMs;

            // Clean old entries
            for (const [key, data] of requestCounts.entries()) {
                if (data.lastReset < windowStart) {
                    requestCounts.delete(key);
                }
            }

            // Get current count
            let requestData = requestCounts.get(identifier);
            
            if (!requestData || requestData.lastReset < windowStart) {
                requestData = {
                    count: 0,
                    lastReset: now
                };
            }

            requestData.count++;
            requestCounts.set(identifier, requestData);

            // Check limit
            if (requestData.count > maxRequests) {
                throw new AppError(
                    `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000 / 60} minutes.`,
                    429,
                    'RATE_LIMIT_EXCEEDED'
                );
            }

            // Add rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests,
                'X-RateLimit-Remaining': Math.max(0, maxRequests - requestData.count),
                'X-RateLimit-Reset': new Date(requestData.lastReset + windowMs).toISOString()
            });

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Request logging middleware
 */
const logRequest = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const apiKeyId = req.apiKey?.id || 'none';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    console.log(`[${timestamp}] ${req.method} ${req.url} - API Key: ${apiKeyId} - IP: ${req.ip} - User-Agent: ${userAgent}`);
    
    next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
    // Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-API-Version': '1.0.0'
    });

    // Remove server header
    res.removeHeader('X-Powered-By');

    next();
};

/**
 * CORS preflight handler
 */
const handleCORS = (req, res, next) => {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).json({
            success: true,
            message: 'CORS preflight successful',
            data: null,
            timestamp: new Date().toISOString()
        });
        return;
    }
    
    next();
};

/**
 * Development authentication bypass (use with caution)
 */
const devAuthBypass = (req, res, next) => {
    if (process.env.NODE_ENV === 'development' && req.headers['x-dev-bypass'] === 'true') {
        req.apiKey = {
            id: 'dev-bypass',
            name: 'Development Bypass',
            permissions: ['*'],
            isActive: true
        };
        console.log('[AUTH] Development bypass enabled for request');
    }
    
    next();
};

module.exports = {
    authService,
    validateApiKey,
    optionalApiKey,
    requirePermission,
    validateJWT,
    rateLimitByApiKey,
    logRequest,
    securityHeaders,
    handleCORS,
    devAuthBypass
}; 
