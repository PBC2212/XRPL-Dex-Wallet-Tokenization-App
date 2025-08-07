const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');
const xrplService = require('../services/xrplService');

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

// Basic input validation
const validateInput = (req, res, next) => {
    // Basic sanitization
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        }
    }
    next();
};

/**
 * @route   POST /api/wallet/generate
 * @desc    Generate a new XRPL wallet
 * @access  Public
 */
router.post('/generate', validateInput, asyncHandler(async (req, res) => {
    const { userId } = req.body;

    const wallet = await walletService.generateWallet(userId);
    successResponse(res, wallet, 'Wallet generated successfully', 201);
}));

/**
 * @route   POST /api/wallet/import
 * @desc    Import wallet from seed phrase
 * @access  Public
 */
router.post('/import', validateInput, asyncHandler(async (req, res) => {
    const { seed, userId } = req.body;

    if (!seed || typeof seed !== 'string' || seed.trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Valid seed is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    const wallet = await walletService.importWallet(seed.trim(), userId);
    successResponse(res, wallet, 'Wallet imported successfully', 201);
}));

/**
 * @route   POST /api/wallet/validate-seed
 * @desc    Validate a seed phrase without importing
 * @access  Public
 */
router.post('/validate-seed', validateInput, asyncHandler(async (req, res) => {
    const { seed } = req.body;

    if (!seed || typeof seed !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Seed is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    try {
        const walletData = xrplService.walletFromSeed(seed.trim());
        successResponse(res, {
            isValid: true,
            address: walletData.address,
            publicKey: walletData.publicKey
        }, 'Seed is valid');
    } catch (error) {
        successResponse(res, {
            isValid: false,
            error: 'Invalid seed format'
        }, 'Seed validation completed');
    }
}));

/**
 * @route   GET /api/wallet/stats
 * @desc    Get wallet statistics
 * @access  Public
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = walletService.getWalletStats();
    successResponse(res, stats, 'Wallet statistics retrieved successfully');
}));

/**
 * @route   GET /api/wallet/health
 * @desc    Health check for wallet service
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
    try {
        const stats = walletService.getWalletStats();
        
        // Try to get XRPL server info
        let xrplStatus;
        try {
            await xrplService.initialize();
            const serverInfo = await xrplService.getServerInfo();
            xrplStatus = {
                status: 'connected',
                network: serverInfo.networkLedger,
                version: serverInfo.buildVersion
            };
        } catch (error) {
            xrplStatus = {
                status: 'disconnected',
                error: error.message
            };
        }

        successResponse(res, {
            service: 'Wallet Service',
            status: 'healthy',
            walletStats: stats,
            xrplConnection: xrplStatus
        }, 'Wallet service is healthy');

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Wallet service health check failed',
            data: { error: error.message },
            timestamp: new Date().toISOString()
        });
    }
}));

/**
 * @route   GET /api/wallet/:walletId
 * @desc    Get wallet details by wallet ID
 * @access  Public
 */
router.get('/:walletId', asyncHandler(async (req, res) => {
    const { walletId } = req.params;

    if (!walletId) {
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    const wallet = await walletService.getWallet(walletId);
    successResponse(res, wallet, 'Wallet retrieved successfully');
}));

/**
 * @route   POST /api/wallet/:walletId/activate
 * @desc    Check and update wallet activation status
 * @access  Public
 */
router.post('/:walletId/activate', asyncHandler(async (req, res) => {
    const { walletId } = req.params;

    if (!walletId) {
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    const result = await walletService.activateWallet(walletId);
    successResponse(res, result, 'Wallet activation status updated');
}));

/**
 * @route   POST /api/wallet/:walletId/refresh
 * @desc    Refresh wallet data from XRPL network
 * @access  Public
 */
router.post('/:walletId/refresh', asyncHandler(async (req, res) => {
    const { walletId } = req.params;

    if (!walletId) {
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    const wallet = await walletService.refreshWallet(walletId);
    successResponse(res, wallet, 'Wallet data refreshed successfully');
}));

/**
 * @route   GET /api/wallet/:walletId/transactions
 * @desc    Get wallet transaction history
 * @access  Public
 */
router.get('/:walletId/transactions', asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { limit } = req.query;

    if (!walletId) {
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    let transactionLimit = 20;
    if (limit) {
        transactionLimit = parseInt(limit);
        if (isNaN(transactionLimit) || transactionLimit < 1 || transactionLimit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 100',
                data: null,
                timestamp: new Date().toISOString()
            });
        }
    }

    const transactions = await walletService.getWalletTransactions(walletId, transactionLimit);
    successResponse(res, {
        count: transactions.length,
        limit: transactionLimit,
        transactions
    }, 'Transaction history retrieved successfully');
}));

/**
 * @route   GET /api/wallet/:walletId/backup
 * @desc    Get wallet backup information (seed and keys)
 * @access  Private (requires confirmation)
 */
router.get('/:walletId/backup', asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { confirm } = req.query;

    if (!walletId) {
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    if (!confirm || confirm !== 'true') {
        return res.status(400).json({
            success: false,
            message: 'Confirmation required. Add ?confirm=true to URL',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    const wallet = await walletService.getWallet(walletId);
    const fullWallet = walletService.wallets.get(walletId);
    
    if (!fullWallet) {
        return res.status(404).json({
            success: false,
            message: 'Wallet not found',
            data: null,
            timestamp: new Date().toISOString()
        });
    }

    successResponse(res, {
        address: fullWallet.address,
        publicKey: fullWallet.publicKey,
        seed: fullWallet.seed,
        warning: 'Store this seed securely. Anyone with this seed can access your wallet.',
        createdAt: fullWallet.createdAt
    }, 'Wallet backup data retrieved successfully');
}));

module.exports = router;