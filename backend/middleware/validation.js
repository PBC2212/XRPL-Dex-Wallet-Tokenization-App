const { AppError } = require('./errorHandler');

/**
 * Validation middleware for API requests
 * Provides comprehensive input validation and sanitization
 */

// Helper functions for validation
const validators = {
    /**
     * Validate XRPL address format
     */
    isValidXRPLAddress: (address) => {
        return typeof address === 'string' && 
               address.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/);
    },

    /**
     * Validate UUID format
     */
    isValidUUID: (uuid) => {
        return typeof uuid === 'string' && 
               uuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    },

    /**
     * Validate seed phrase format (basic check)
     */
    isValidSeed: (seed) => {
        if (typeof seed !== 'string' || !seed.trim()) return false;
        const trimmed = seed.trim();
        // Basic seed validation - XRPL seeds are typically 29 characters
        return trimmed.length >= 20 && trimmed.length <= 50;
    },

    /**
     * Sanitize string input
     */
    sanitizeString: (str) => {
        if (typeof str !== 'string') return str;
        return str.trim().replace(/[<>]/g, ''); // Remove basic HTML chars
    },

    /**
     * Validate positive integer
     */
    isPositiveInteger: (value) => {
        const num = parseInt(value);
        return !isNaN(num) && num > 0 && num.toString() === value.toString();
    }
};

/**
 * Wallet-specific validation middleware
 */
const validateWalletRequest = {
    /**
     * Validate wallet generation request
     */
    generateWallet: (req, res, next) => {
        try {
            const { userId } = req.body;

            // UserId is optional, but if provided, must be valid
            if (userId !== undefined) {
                if (typeof userId !== 'string' || userId.trim().length === 0) {
                    throw new AppError('UserId must be a non-empty string', 400, 'INVALID_USER_ID');
                }
                req.body.userId = validators.sanitizeString(userId);
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate wallet import request
     */
    importWallet: (req, res, next) => {
        try {
            const { seed, userId } = req.body;

            // Seed is required
            if (!seed) {
                throw new AppError('Seed is required', 400, 'MISSING_SEED');
            }

            if (!validators.isValidSeed(seed)) {
                throw new AppError('Invalid seed format', 400, 'INVALID_SEED_FORMAT');
            }

            // UserId is optional
            if (userId !== undefined) {
                if (typeof userId !== 'string' || userId.trim().length === 0) {
                    throw new AppError('UserId must be a non-empty string', 400, 'INVALID_USER_ID');
                }
                req.body.userId = validators.sanitizeString(userId);
            }

            req.body.seed = seed.trim();
            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate seed validation request
     */
    validateSeed: (req, res, next) => {
        try {
            const { seed } = req.body;

            if (!seed) {
                throw new AppError('Seed is required', 400, 'MISSING_SEED');
            }

            if (typeof seed !== 'string') {
                throw new AppError('Seed must be a string', 400, 'INVALID_SEED_TYPE');
            }

            req.body.seed = seed.trim();
            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate get wallet request
     */
    getWallet: (req, res, next) => {
        try {
            const { walletId } = req.params;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate get wallet by address request
     */
    getWalletByAddress: (req, res, next) => {
        try {
            const { address } = req.params;

            if (!address) {
                throw new AppError('Wallet address is required', 400, 'MISSING_WALLET_ADDRESS');
            }

            if (!validators.isValidXRPLAddress(address)) {
                throw new AppError('Invalid XRPL address format', 400, 'INVALID_ADDRESS_FORMAT');
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate get user wallets request
     */
    getUserWallets: (req, res, next) => {
        try {
            const { userId } = req.params;

            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (typeof userId !== 'string' || userId.trim().length === 0) {
                throw new AppError('Invalid user ID', 400, 'INVALID_USER_ID');
            }

            req.params.userId = validators.sanitizeString(userId);
            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate activate wallet request
     */
    activateWallet: (req, res, next) => {
        try {
            const { walletId } = req.params;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate refresh wallet request
     */
    refreshWallet: (req, res, next) => {
        try {
            const { walletId } = req.params;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate get wallet transactions request
     */
    getWalletTransactions: (req, res, next) => {
        try {
            const { walletId } = req.params;
            const { limit } = req.query;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            // Validate limit if provided
            if (limit !== undefined) {
                const limitNum = parseInt(limit);
                if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                    throw new AppError('Limit must be between 1 and 100', 400, 'INVALID_LIMIT');
                }
                req.query.limit = limitNum;
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate get wallet backup request
     */
    getWalletBackup: (req, res, next) => {
        try {
            const { walletId } = req.params;
            const { confirm } = req.query;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            if (!confirm || confirm !== 'true') {
                throw new AppError('Confirmation required. Add ?confirm=true to URL', 400, 'CONFIRMATION_REQUIRED');
            }

            next();
        } catch (error) {
            next(error);
        }
    },

    /**
     * Validate delete wallet request
     */
    deleteWallet: (req, res, next) => {
        try {
            const { walletId } = req.params;
            const { confirm } = req.body;

            if (!walletId) {
                throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
            }

            if (!validators.isValidUUID(walletId)) {
                throw new AppError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
            }

            if (!confirm || confirm !== 'DELETE') {
                throw new AppError('Confirmation required. Set confirm: "DELETE" in request body', 400, 'CONFIRMATION_REQUIRED');
            }

            next();
        } catch (error) {
            next(error);
        }
    }
};

/**
 * Asset-specific validation middleware (for future use)
 */
const validateAssetRequest = {
    /**
     * Validate asset creation request
     */
    createAsset: (req, res, next) => {
        try {
            const { walletId, assetName, assetType, totalSupply, description } = req.body;

            // Validate required fields
            if (!walletId || !validators.isValidUUID(walletId)) {
                throw new AppError('Valid wallet ID is required', 400, 'INVALID_WALLET_ID');
            }

            if (!assetName || typeof assetName !== 'string' || assetName.trim().length === 0) {
                throw new AppError('Asset name is required', 400, 'MISSING_ASSET_NAME');
            }

            if (!assetType || typeof assetType !== 'string') {
                throw new AppError('Asset type is required', 400, 'MISSING_ASSET_TYPE');
            }

            if (totalSupply !== undefined) {
                const supply = parseFloat(totalSupply);
                if (isNaN(supply) || supply <= 0) {
                    throw new AppError('Total supply must be a positive number', 400, 'INVALID_TOTAL_SUPPLY');
                }
            }

            // Sanitize strings
            req.body.assetName = validators.sanitizeString(assetName);
            req.body.assetType = validators.sanitizeString(assetType);
            if (description) {
                req.body.description = validators.sanitizeString(description);
            }

            next();
        } catch (error) {
            next(error);
        }
    }
};

/**
 * DEX-specific validation middleware (for future use)
 */
const validateDEXRequest = {
    /**
     * Validate DEX offer creation
     */
    createOffer: (req, res, next) => {
        try {
            const { walletId, takerGets, takerPays } = req.body;

            if (!walletId || !validators.isValidUUID(walletId)) {
                throw new AppError('Valid wallet ID is required', 400, 'INVALID_WALLET_ID');
            }

            if (!takerGets || !takerPays) {
                throw new AppError('Both takerGets and takerPays are required', 400, 'MISSING_OFFER_AMOUNTS');
            }

            // Additional validation for offer amounts would go here

            next();
        } catch (error) {
            next(error);
        }
    }
};

/**
 * General request validation middleware
 */
const validateRequest = {
    /**
     * Validate JSON payload
     */
    validateJSON: (req, res, next) => {
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            if (!req.body || Object.keys(req.body).length === 0) {
                return next(new AppError('Request body cannot be empty', 400, 'EMPTY_BODY'));
            }
        }
        next();
    },

    /**
     * Sanitize request data
     */
    sanitizeRequest: (req, res, next) => {
        // Sanitize query parameters
        for (const key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = validators.sanitizeString(req.query[key]);
            }
        }

        // Sanitize body parameters (strings only)
        if (req.body && typeof req.body === 'object') {
            for (const key in req.body) {
                if (typeof req.body[key] === 'string') {
                    req.body[key] = validators.sanitizeString(req.body[key]);
                }
            }
        }

        next();
    }
};

module.exports = {
    validateWalletRequest,
    validateAssetRequest,
    validateDEXRequest,
    validateRequest,
    validators
};