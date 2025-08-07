const dexService = require('../services/dexService');

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

class DEXController {
    /**
     * Create a new offer on XRPL DEX
     * POST /api/dex/offer
     */
    createOffer = asyncHandler(async (req, res) => {
        const { walletId, takerGets, takerPays, expiration } = req.body;

        // Validate required fields
        if (!walletId || !takerGets || !takerPays) {
            return errorResponse(res, 'Missing required fields: walletId, takerGets, takerPays', 400, 'MISSING_REQUIRED_FIELDS');
        }

        // Validate takerGets format
        if (!this.validateAmount(takerGets)) {
            return errorResponse(res, 'Invalid takerGets format', 400, 'INVALID_TAKER_GETS');
        }

        // Validate takerPays format
        if (!this.validateAmount(takerPays)) {
            return errorResponse(res, 'Invalid takerPays format', 400, 'INVALID_TAKER_PAYS');
        }

        // Validate expiration if provided
        if (expiration && new Date(expiration) <= new Date()) {
            return errorResponse(res, 'Expiration must be in the future', 400, 'INVALID_EXPIRATION');
        }

        try {
            const result = await dexService.createOffer(walletId, takerGets, takerPays, expiration);
            successResponse(res, result, 'Offer created successfully', 201);
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            if (error.message.includes('not activated')) {
                return errorResponse(res, 'Wallet must be activated', 400, 'WALLET_NOT_ACTIVATED');
            }
            if (error.message.includes('insufficient')) {
                return errorResponse(res, 'Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
            }
            return errorResponse(res, error.message, 500, 'OFFER_CREATION_FAILED');
        }
    });

    /**
     * Cancel an existing offer
     * DELETE /api/dex/offer/:walletId/:offerSequence
     */
    cancelOffer = asyncHandler(async (req, res) => {
        const { walletId, offerSequence } = req.params;

        if (!walletId || !offerSequence) {
            return errorResponse(res, 'Wallet ID and offer sequence are required', 400, 'MISSING_PARAMETERS');
        }

        // Validate offer sequence is a number
        const sequence = parseInt(offerSequence);
        if (isNaN(sequence) || sequence <= 0) {
            return errorResponse(res, 'Offer sequence must be a positive number', 400, 'INVALID_OFFER_SEQUENCE');
        }

        try {
            const result = await dexService.cancelOffer(walletId, sequence);
            successResponse(res, result, 'Offer cancelled successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet or offer not found', 404, 'NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'OFFER_CANCELLATION_FAILED');
        }
    });

    /**
     * Get order book for a trading pair
     * GET /api/dex/orderbook
     */
    getOrderBook = asyncHandler(async (req, res) => {
        const { 
            takerGetsCurrency, 
            takerGetsIssuer, 
            takerPaysCurrency, 
            takerPaysIssuer,
            limit 
        } = req.query;

        // Validate required parameters
        if (!takerGetsCurrency || !takerPaysCurrency) {
            return errorResponse(res, 'Both takerGetsCurrency and takerPaysCurrency are required', 400, 'MISSING_CURRENCIES');
        }

        // Build amount objects
        const takerGets = {
            currency: takerGetsCurrency
        };
        if (takerGetsCurrency !== 'XRP' && takerGetsIssuer) {
            takerGets.issuer = takerGetsIssuer;
        }

        const takerPays = {
            currency: takerPaysCurrency
        };
        if (takerPaysCurrency !== 'XRP' && takerPaysIssuer) {
            takerPays.issuer = takerPaysIssuer;
        }

        // Validate limit
        let orderLimit = 20;
        if (limit) {
            orderLimit = parseInt(limit);
            if (isNaN(orderLimit) || orderLimit < 1 || orderLimit > 100) {
                return errorResponse(res, 'Limit must be between 1 and 100', 400, 'INVALID_LIMIT');
            }
        }

        try {
            const result = await dexService.getOrderBook(takerGets, takerPays, orderLimit);
            successResponse(res, result, 'Order book retrieved successfully');
        } catch (error) {
            return errorResponse(res, error.message, 500, 'ORDER_BOOK_RETRIEVAL_FAILED');
        }
    });

    /**
     * Execute a market order
     * POST /api/dex/market-order
     */
    executeMarketOrder = asyncHandler(async (req, res) => {
        const { walletId, takerGets, takerPays } = req.body;

        // Validate required fields
        if (!walletId || !takerGets || !takerPays) {
            return errorResponse(res, 'Missing required fields: walletId, takerGets, takerPays', 400, 'MISSING_REQUIRED_FIELDS');
        }

        // Validate amounts
        if (!this.validateAmount(takerGets) || !this.validateAmount(takerPays)) {
            return errorResponse(res, 'Invalid amount format', 400, 'INVALID_AMOUNT_FORMAT');
        }

        try {
            const result = await dexService.executeMarketOrder(walletId, takerGets, takerPays);
            successResponse(res, result, 'Market order executed successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            if (error.message.includes('insufficient')) {
                return errorResponse(res, 'Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
            }
            return errorResponse(res, error.message, 500, 'MARKET_ORDER_FAILED');
        }
    });

    /**
     * Get wallet offers
     * GET /api/dex/offers/:walletId
     */
    getWalletOffers = asyncHandler(async (req, res) => {
        const { walletId } = req.params;

        if (!walletId) {
            return errorResponse(res, 'Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        try {
            const result = await dexService.getWalletOffers(walletId);
            successResponse(res, result, 'Wallet offers retrieved successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'OFFERS_RETRIEVAL_FAILED');
        }
    });

    /**
     * Get trading pair information
     * GET /api/dex/pair/:currency1/:issuer1/:currency2/:issuer2
     */
    getTradingPairInfo = asyncHandler(async (req, res) => {
        const { currency1, issuer1, currency2, issuer2 } = req.params;

        if (!currency1 || !currency2) {
            return errorResponse(res, 'Both currencies are required', 400, 'MISSING_CURRENCIES');
        }

        // Handle XRP (no issuer needed)
        const actualIssuer1 = currency1 === 'XRP' ? null : issuer1;
        const actualIssuer2 = currency2 === 'XRP' ? null : issuer2;

        if ((currency1 !== 'XRP' && !actualIssuer1) || (currency2 !== 'XRP' && !actualIssuer2)) {
            return errorResponse(res, 'Issuer address required for non-XRP currencies', 400, 'MISSING_ISSUER');
        }

        try {
            const result = await dexService.getTradingPairInfo(
                currency1,
                actualIssuer1,
                currency2,
                actualIssuer2
            );
            successResponse(res, result, 'Trading pair info retrieved successfully');
        } catch (error) {
            return errorResponse(res, error.message, 500, 'PAIR_INFO_RETRIEVAL_FAILED');
        }
    });

    /**
     * Get wallet trade history
     * GET /api/dex/trades/:walletId
     */
    getWalletTradeHistory = asyncHandler(async (req, res) => {
        const { walletId } = req.params;
        const { limit } = req.query;

        if (!walletId) {
            return errorResponse(res, 'Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        // Validate limit
        let tradeLimit = 20;
        if (limit) {
            tradeLimit = parseInt(limit);
            if (isNaN(tradeLimit) || tradeLimit < 1 || tradeLimit > 100) {
                return errorResponse(res, 'Limit must be between 1 and 100', 400, 'INVALID_LIMIT');
            }
        }

        try {
            const result = await dexService.getWalletTradeHistory(walletId, tradeLimit);
            successResponse(res, result, 'Trade history retrieved successfully');
        } catch (error) {
            if (error.message.includes('not found')) {
                return errorResponse(res, 'Wallet not found', 404, 'WALLET_NOT_FOUND');
            }
            return errorResponse(res, error.message, 500, 'TRADE_HISTORY_RETRIEVAL_FAILED');
        }
    });

    /**
     * Get DEX statistics
     * GET /api/dex/stats
     */
    getDEXStats = asyncHandler(async (req, res) => {
        try {
            const stats = dexService.getDEXStats();
            successResponse(res, stats, 'DEX statistics retrieved successfully');
        } catch (error) {
            return errorResponse(res, error.message, 500, 'STATS_RETRIEVAL_FAILED');
        }
    });

    /**
     * Health check for DEX service
     * GET /api/dex/health
     */
    healthCheck = asyncHandler(async (req, res) => {
        try {
            const stats = dexService.getDEXStats();
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
                service: 'DEX Service',
                status: 'healthy',
                xrplConnection: xrplStatus,
                dexStats: stats,
                features: [
                    'Order Creation',
                    'Order Cancellation',
                    'Market Orders',
                    'Order Books',
                    'Trade History',
                    'Atomic Swaps'
                ]
            }, 'DEX service is healthy');

        } catch (error) {
            return errorResponse(res, 'DEX service health check failed', 500, 'HEALTH_CHECK_FAILED');
        }
    });

    /**
     * Validate amount format
     */
    validateAmount(amount) {
        // XRP amount (string or number)
        if (typeof amount === 'string' || typeof amount === 'number') {
            const num = parseFloat(amount);
            return !isNaN(num) && num > 0;
        }

        // Token amount (object)
        if (typeof amount === 'object' && amount.currency && amount.value) {
            const value = parseFloat(amount.value);
            if (isNaN(value) || value <= 0) return false;
            
            // Non-XRP tokens need issuer
            if (amount.currency !== 'XRP' && !amount.issuer) return false;
            
            return true;
        }

        return false;
    }
}

module.exports = new DEXController(); 
