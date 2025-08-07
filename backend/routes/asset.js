const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');

// Basic input validation middleware
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
 * @route   POST /api/asset/create
 * @desc    Create a new Real-World Asset
 * @access  Public
 * @body    { name, description?, assetType, value, location?, ownerWalletId, documents?, metadata? }
 */
router.post('/create', validateInput, assetController.createAsset);

/**
 * @route   GET /api/asset/stats
 * @desc    Get tokenized asset statistics
 * @access  Public
 */
router.get('/stats', assetController.getAssetStats);

/**
 * @route   GET /api/asset/health
 * @desc    Health check for asset service
 * @access  Public
 */
router.get('/health', assetController.healthCheck);

/**
 * @route   POST /api/asset/transfer
 * @desc    Transfer tokens between wallets
 * @access  Public
 * @body    { fromWalletId, toAddress, currencyCode, issuerAddress, amount }
 */
router.post('/transfer', validateInput, assetController.transferTokens);

/**
 * @route   GET /api/asset/wallet/:walletId
 * @desc    Get all assets for a specific wallet
 * @access  Public
 * @param   walletId - Wallet identifier
 */
router.get('/wallet/:walletId', assetController.getWalletAssets);

/**
 * @route   GET /api/asset/balance/:walletId/:currencyCode/:issuerAddress
 * @desc    Get token balance for a wallet
 * @access  Public
 * @param   walletId - Wallet identifier
 * @param   currencyCode - Token currency code (3 chars)
 * @param   issuerAddress - Token issuer XRPL address
 */
router.get('/balance/:walletId/:currencyCode/:issuerAddress', assetController.getTokenBalance);

/**
 * @route   GET /api/asset/:assetId
 * @desc    Get asset details by asset ID
 * @access  Public
 * @param   assetId - Asset identifier
 */
router.get('/:assetId', assetController.getAsset);

/**
 * @route   POST /api/asset/:assetId/tokenize
 * @desc    Tokenize a Real-World Asset on XRPL
 * @access  Public
 * @param   assetId - Asset identifier
 * @body    { currencyCode?, totalSupply? }
 */
router.post('/:assetId/tokenize', validateInput, assetController.tokenizeAsset);

/**
 * @route   POST /api/asset/:assetId/redeem
 * @desc    Redeem tokens to release underlying asset
 * @access  Public
 * @param   assetId - Asset identifier
 * @body    { walletId, tokenAmount }
 */
router.post('/:assetId/redeem', validateInput, assetController.redeemAsset);

module.exports = router; 
