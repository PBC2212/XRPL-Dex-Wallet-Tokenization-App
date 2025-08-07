const walletService = require('../services/walletService');
const { asyncHandler, successResponse, AppError } = require('../middleware/errorHandler');

class WalletController {
    /**
     * Generate a new XRPL wallet
     * POST /api/wallet/generate
     */
    generateWallet = asyncHandler(async (req, res) => {
        const { userId } = req.body;

        const wallet = await walletService.generateWallet(userId);

        successResponse(res, wallet, 'Wallet generated successfully', 201);
    });

    /**
     * Import wallet from seed
     * POST /api/wallet/import
     */
    importWallet = asyncHandler(async (req, res) => {
        const { seed, userId } = req.body;

        // Validate seed
        if (!seed || typeof seed !== 'string' || seed.trim().length === 0) {
            throw new AppError('Valid seed is required', 400, 'INVALID_SEED');
        }

        const wallet = await walletService.importWallet(seed.trim(), userId);

        successResponse(res, wallet, 'Wallet imported successfully', 201);
    });

    /**
     * Get wallet by ID
     * GET /api/wallet/:walletId
     */
    getWallet = asyncHandler(async (req, res) => {
        const { walletId } = req.params;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        const wallet = await walletService.getWallet(walletId);

        successResponse(res, wallet, 'Wallet retrieved successfully');
    });

    /**
     * Get wallet by address
     * GET /api/wallet/address/:address
     */
    getWalletByAddress = asyncHandler(async (req, res) => {
        const { address } = req.params;

        if (!address) {
            throw new AppError('Wallet address is required', 400, 'MISSING_WALLET_ADDRESS');
        }

        // Basic XRPL address validation
        if (!address.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/)) {
            throw new AppError('Invalid XRPL address format', 400, 'INVALID_ADDRESS_FORMAT');
        }

        const wallet = await walletService.getWalletByAddress(address);

        successResponse(res, wallet, 'Wallet retrieved successfully');
    });

    /**
     * Get all wallets for a user
     * GET /api/wallet/user/:userId
     */
    getUserWallets = asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (!userId) {
            throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
        }

        const wallets = await walletService.getUserWallets(userId);

        successResponse(res, {
            count: wallets.length,
            wallets
        }, 'User wallets retrieved successfully');
    });

    /**
     * Activate wallet by checking if it's funded
     * POST /api/wallet/:walletId/activate
     */
    activateWallet = asyncHandler(async (req, res) => {
        const { walletId } = req.params;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        const result = await walletService.activateWallet(walletId);

        successResponse(res, result, 'Wallet activation status updated');
    });

    /**
     * Get wallet transaction history
     * GET /api/wallet/:walletId/transactions
     */
    getWalletTransactions = asyncHandler(async (req, res) => {
        const { walletId } = req.params;
        const { limit } = req.query;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        // Validate limit parameter
        let transactionLimit = 20; // default
        if (limit) {
            transactionLimit = parseInt(limit);
            if (isNaN(transactionLimit) || transactionLimit < 1 || transactionLimit > 100) {
                throw new AppError('Limit must be between 1 and 100', 400, 'INVALID_LIMIT');
            }
        }

        const transactions = await walletService.getWalletTransactions(walletId, transactionLimit);

        successResponse(res, {
            count: transactions.length,
            limit: transactionLimit,
            transactions
        }, 'Transaction history retrieved successfully');
    });

    /**
     * Refresh wallet data
     * POST /api/wallet/:walletId/refresh
     */
    refreshWallet = asyncHandler(async (req, res) => {
        const { walletId } = req.params;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        const wallet = await walletService.refreshWallet(walletId);

        successResponse(res, wallet, 'Wallet data refreshed successfully');
    });

    /**
     * Delete wallet
     * DELETE /api/wallet/:walletId
     */
    deleteWallet = asyncHandler(async (req, res) => {
        const { walletId } = req.params;
        const { confirm } = req.body;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        // Require confirmation for wallet deletion
        if (!confirm || confirm !== 'DELETE') {
            throw new AppError('Confirmation required. Set confirm: "DELETE" in request body', 400, 'CONFIRMATION_REQUIRED');
        }

        const result = await walletService.deleteWallet(walletId);

        successResponse(res, result, 'Wallet deleted successfully');
    });

    /**
     * Get wallet statistics
     * GET /api/wallet/stats
     */
    getWalletStats = asyncHandler(async (req, res) => {
        const stats = walletService.getWalletStats();

        successResponse(res, stats, 'Wallet statistics retrieved successfully');
    });

    /**
     * Validate wallet seed
     * POST /api/wallet/validate-seed
     */
    validateSeed = asyncHandler(async (req, res) => {
        const { seed } = req.body;

        if (!seed || typeof seed !== 'string') {
            throw new AppError('Seed is required', 400, 'MISSING_SEED');
        }

        try {
            // Try to create wallet from seed to validate
            const walletData = require('../services/xrplService').walletFromSeed(seed.trim());
            
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
    });

    /**
     * Get wallet backup info (seed and keys for user backup)
     * GET /api/wallet/:walletId/backup
     */
    getWalletBackup = asyncHandler(async (req, res) => {
        const { walletId } = req.params;
        const { confirm } = req.query;

        if (!walletId) {
            throw new AppError('Wallet ID is required', 400, 'MISSING_WALLET_ID');
        }

        // Require confirmation to view sensitive data
        if (!confirm || confirm !== 'true') {
            throw new AppError('Confirmation required. Add ?confirm=true to URL', 400, 'CONFIRMATION_REQUIRED');
        }

        const wallet = await walletService.getWallet(walletId);

        // Get the full wallet data including seed
        const fullWallet = walletService.wallets.get(walletId);
        
        if (!fullWallet) {
            throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');
        }

        successResponse(res, {
            address: fullWallet.address,
            publicKey: fullWallet.publicKey,
            seed: fullWallet.seed,
            warning: 'Store this seed securely. Anyone with this seed can access your wallet.',
            createdAt: fullWallet.createdAt
        }, 'Wallet backup data retrieved successfully');
    });

    /**
     * Health check for wallet service
     * GET /api/wallet/health
     */
    healthCheck = asyncHandler(async (req, res) => {
        const stats = walletService.getWalletStats();
        const xrplService = require('../services/xrplService');
        
        try {
            // Try to get server info to check XRPL connection
            const serverInfo = await xrplService.getServerInfo();
            
            successResponse(res, {
                service: 'Wallet Service',
                status: 'healthy',
                xrplConnection: 'connected',
                walletStats: stats,
                serverInfo: {
                    network: serverInfo.networkLedger,
                    version: serverInfo.buildVersion,
                    reserveBase: serverInfo.reserveBase,
                    reserveInc: serverInfo.reserveInc
                }
            }, 'Wallet service is healthy');
        } catch (error) {
            successResponse(res, {
                service: 'Wallet Service',
                status: 'degraded',
                xrplConnection: 'disconnected',
                walletStats: stats,
                error: error.message
            }, 'Wallet service is running but XRPL connection issues detected', 200);
        }
    });
}

module.exports = new WalletController(); 
