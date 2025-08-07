const assetService = require('../services/assetService');

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Success response helper
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

// Error response helper
const errorResponse = (res, message, statusCode = 400, code = null) => {
    res.status(statusCode).json({
        success: false,
        message,
        data: null,
        code,
        timestamp: new Date().toISOString()
    });
};

class AssetController {
    /**
     * Create a new Real-World Asset
     * POST /api/asset/create
     */
    createAsset = asyncHandler(async (req, res) => {
        const {
            name,
            description,
            assetType,
            value,
            location,
            ownerWalletId,
            documents,
            metadata
        } = req.body;

        // Validate required fields
        if (!name || !assetType || !value || !ownerWalletId) {
            return errorResponse(res, 'Missing required fields: name, assetType, value, ownerWalletId', 400, 'MISSING_REQUIRED_FIELDS');
        }

        // Validate value is positive number
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue <= 0) {
            return errorResponse(res, 'Asset value must be a positive number', 400, 'INVALID_VALUE');
        }

        // Validate asset type
        const validAssetTypes = ['real_estate', 'vehicle', 'artwork', 'commodity', 'equipment', 'other'];
        if (!validAssetTypes.includes(assetType.toLowerCase())) {
            return errorResponse(res, `Invalid asset type. Must be one of: ${validAssetTypes.join(', ')}`, 400, 'INVALID_ASSET_TYPE');
        }

        try {
            const asset = await assetService.createAsset({
                name: name.trim(),
                description: description?.trim(),
                assetType: assetType.toLowerCase(),
                value: numericValue,
                location: location?.trim(),
                ownerWalletId: ownerWalletId.trim(),
                documents: documents || [],
                metadata: metadata || {}
            });

            successResponse(res, asset, 'Asset created successfully', 201);
        } catch (error) {
            return errorResponse(res, error.message, 500, 'ASSET_CREATION_FAILED');
        }
    });

    /**
     * Get asset by ID
     * GET /api/asset/:assetId
     */
    getAsset = asyncHandler(async (req, res) => {
        const { assetId } = req.params;

        if (!assetId) {
            return errorResponse(res, 'Asset ID is required', 400, 'MISSING_ASSET_ID');
        }

        try {
            const asset = await assetService.getAsset(assetId);
            successResponse(res, asset, 'Asset retrieved successfully');
        } catch (error) {
            if (error.message === 'Asset not found') {
                return errorResponse(res, 'Asset not found', 404, 'ASSET_NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'ASSET_RETRIEVAL_FAILED');
        }
    });

    /**
     * Tokenize an asset
     * POST /api/asset/:assetId/tokenize
     */
    tokenizeAsset = asyncHandler(async (req, res) => {
        const { assetId } = req.params;
        const { currencyCode, totalSupply } = req.body;

        if (!assetId) {
            return errorResponse(res, 'Asset ID is required', 400, 'MISSING_ASSET_ID');
        }

        // Validate currency code if provided
        if (currencyCode && (typeof currencyCode !== 'string' || currencyCode.length !== 3)) {
            return errorResponse(res, 'Currency code must be exactly 3 characters', 400, 'INVALID_CURRENCY_CODE');
        }

        // Validate total supply if provided
        if (totalSupply && (isNaN(parseFloat(totalSupply)) || parseFloat(totalSupply) <= 0)) {
            return errorResponse(res, 'Total supply must be a positive number', 400, 'INVALID_TOTAL_SUPPLY');
        }

        try {
            const tokenizationParams = {};
            if (currencyCode) tokenizationParams.currencyCode = currencyCode.toUpperCase();
            if (totalSupply) tokenizationParams.totalSupply = parseFloat(totalSupply);

            const result = await assetService.tokenizeAsset(assetId, tokenizationParams);
            successResponse(res, result, 'Asset tokenized successfully', 200);
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Asset not found', 404, 'ASSET_NOT_FOUND');
            }
            if (error.message.includes('already tokenized')) {
                return errorResponse(res, 'Asset is already tokenized', 409, 'ASSET_ALREADY_TOKENIZED');
            }
            if (error.message.includes('not activated')) {
                return errorResponse(res, 'Owner wallet must be activated', 400, 'WALLET_NOT_ACTIVATED');
            }
            return errorResponse(res, error.message, 500, 'TOKENIZATION_FAILED');
        }
    });

    /**
     * Transfer tokens
     * POST /api/asset/transfer
     */
    transferTokens = asyncHandler(async (req, res) => {
        const {
            fromWalletId,
            toAddress,
            currencyCode,
            issuerAddress,
            amount
        } = req.body;

        // Validate required fields
        if (!fromWalletId || !toAddress || !currencyCode || !issuerAddress || !amount) {
            return errorResponse(res, 'Missing required fields: fromWalletId, toAddress, currencyCode, issuerAddress, amount', 400, 'MISSING_REQUIRED_FIELDS');
        }

        // Validate amount
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return errorResponse(res, 'Amount must be a positive number', 400, 'INVALID_AMOUNT');
        }

        // Validate XRPL address format
        if (!toAddress.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/)) {
            return errorResponse(res, 'Invalid XRPL address format', 400, 'INVALID_ADDRESS_FORMAT');
        }

        try {
            const result = await assetService.transferTokens(
                fromWalletId,
                toAddress,
                currencyCode.toUpperCase(),
                issuerAddress,
                numericAmount
            );

            successResponse(res, result, 'Tokens transferred successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            if (error.message.includes('insufficient')) {
                return errorResponse(res, 'Insufficient token balance', 400, 'INSUFFICIENT_BALANCE');
            }
            return errorResponse(res, error.message, 500, 'TRANSFER_FAILED');
        }
    });

    /**
     * Get token balance
     * GET /api/asset/balance/:walletId/:currencyCode/:issuerAddress
     */
    getTokenBalance = asyncHandler(async (req, res) => {
        const { walletId, currencyCode, issuerAddress } = req.params;

        if (!walletId || !currencyCode || !issuerAddress) {
            return errorResponse(res, 'Wallet ID, currency code, and issuer address are required', 400, 'MISSING_PARAMETERS');
        }

        try {
            const balance = await assetService.getTokenBalance(
                walletId,
                currencyCode.toUpperCase(),
                issuerAddress
            );

            successResponse(res, balance, 'Token balance retrieved successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'BALANCE_RETRIEVAL_FAILED');
        }
    });

    /**
     * Redeem asset tokens
     * POST /api/asset/:assetId/redeem
     */
    redeemAsset = asyncHandler(async (req, res) => {
        const { assetId } = req.params;
        const { walletId, tokenAmount } = req.body;

        if (!assetId) {
            return errorResponse(res, 'Asset ID is required', 400, 'MISSING_ASSET_ID');
        }

        if (!walletId || !tokenAmount) {
            return errorResponse(res, 'Wallet ID and token amount are required', 400, 'MISSING_REQUIRED_FIELDS');
        }

        // Validate token amount
        const numericAmount = parseFloat(tokenAmount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return errorResponse(res, 'Token amount must be a positive number', 400, 'INVALID_TOKEN_AMOUNT');
        }

        try {
            const result = await assetService.redeemAsset(assetId, walletId, numericAmount);
            successResponse(res, result, 'Asset redeemed successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Asset not found or not tokenized', 404, 'ASSET_NOT_FOUND');
            }
            if (error.message.includes('insufficient')) {
                return errorResponse(res, 'Insufficient token balance for redemption', 400, 'INSUFFICIENT_TOKENS');
            }
            return errorResponse(res, error.message, 500, 'REDEMPTION_FAILED');
        }
    });

    /**
     * Get all assets for a wallet
     * GET /api/asset/wallet/:walletId
     */
    getWalletAssets = asyncHandler(async (req, res) => {
        const { walletId } = req.params;

        if (!walletId) {
            return errorResponse(res, 'Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        try {
            const result = await assetService.getWalletAssets(walletId);
            successResponse(res, result, 'Wallet assets retrieved successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'ASSET_RETRIEVAL_FAILED');
        }
    });

    /**
     * Get tokenized asset statistics
     * GET /api/asset/stats
     */
    getAssetStats = asyncHandler(async (req, res) => {
        try {
            const stats = assetService.getTokenizedAssetStats();
            successResponse(res, stats, 'Asset statistics retrieved successfully');
        } catch (error) {
            return errorResponse(res, error.message, 500, 'STATS_RETRIEVAL_FAILED');
        }
    });

    /**
     * Health check for asset service
     * GET /api/asset/health
     */
    healthCheck = asyncHandler(async (req, res) => {
        try {
            const stats = assetService.getTokenizedAssetStats();
            const xrplService = require('../services/xrplService');
            
            let xrplStatus = 'unknown';
            try {
                await xrplService.initialize();
                await xrplService.getServerInfo();
                xrplStatus = 'connected';
            } catch (error) {
                xrplStatus = 'disconnected';
            }

            successResponse(res, {
                service: 'Asset Service',
                status: 'healthy',
                xrplConnection: xrplStatus,
                assetStats: stats,
                features: [
                    'Asset Creation',
                    'Asset Tokenization',
                    'Token Transfer',
                    'Token Redemption',
                    'Balance Tracking'
                ]
            }, 'Asset service is healthy');

        } catch (error) {
            return errorResponse(res, 'Asset service health check failed', 500, 'HEALTH_CHECK_FAILED');
        }
    });
}

module.exports = new AssetController(); 
