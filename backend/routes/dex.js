const express = require('express');
const router = express.Router();
const dexController = require('../controllers/dexController');

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
 * @route   POST /api/dex/offer
 * @desc    Create a new offer on XRPL DEX
 * @access  Public
 * @body    { walletId, takerGets, takerPays, expiration? }
 */
router.post('/offer', validateInput, dexController.createOffer);

/**
 * @route   POST /api/dex/market-order
 * @desc    Execute a market order (immediate trade)
 * @access  Public
 * @body    { walletId, takerGets, takerPays }
 */
router.post('/market-order', validateInput, dexController.executeMarketOrder);

/**
 * @route   GET /api/dex/stats
 * @desc    Get DEX statistics
 * @access  Public
 */
router.get('/stats', dexController.getDEXStats);

/**
 * @route   GET /api/dex/health
 * @desc    Health check for DEX service
 * @access  Public
 */
router.get('/health', dexController.healthCheck);

/**
 * @route   GET /api/dex/orderbook
 * @desc    Get order book for a trading pair
 * @access  Public
 * @query   takerGetsCurrency, takerGetsIssuer?, takerPaysCurrency, takerPaysIssuer?, limit?
 */
router.get('/orderbook', dexController.getOrderBook);

/**
 * @route   GET /api/dex/offers/:walletId
 * @desc    Get all offers for a specific wallet
 * @access  Public
 * @param   walletId - Wallet identifier
 */
router.get('/offers/:walletId', dexController.getWalletOffers);

/**
 * @route   GET /api/dex/trades/:walletId
 * @desc    Get trade history for a wallet
 * @access  Public
 * @param   walletId - Wallet identifier
 * @query   limit - Number of trades to return (1-100, default: 20)
 */
router.get('/trades/:walletId', dexController.getWalletTradeHistory);

/**
 * @route   GET /api/dex/pair/:currency1/:issuer1/:currency2/:issuer2
 * @desc    Get trading pair information and market data
 * @access  Public
 * @param   currency1 - First currency code (e.g., XRP, USD, RWA)
 * @param   issuer1 - First currency issuer (use 'XRP' for XRP)
 * @param   currency2 - Second currency code
 * @param   issuer2 - Second currency issuer (use 'XRP' for XRP)
 */
router.get('/pair/:currency1/:issuer1/:currency2/:issuer2', dexController.getTradingPairInfo);

/**
 * @route   DELETE /api/dex/offer/:walletId/:offerSequence
 * @desc    Cancel an existing offer
 * @access  Public
 * @param   walletId - Wallet identifier
 * @param   offerSequence - XRPL offer sequence number
 */
router.delete('/offer/:walletId/:offerSequence', dexController.cancelOffer);

module.exports = router; 
