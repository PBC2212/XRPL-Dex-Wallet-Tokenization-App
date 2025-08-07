const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Import routes
const healthRoutes = require('./routes/health');
const walletRoutes = require('./routes/wallet');
const assetRoutes = require('./routes/asset');
const dexRoutes = require('./routes/dex');

// Routes
app.use('/health', healthRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/asset', assetRoutes);
app.use('/api/dex', dexRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'RWA Tokenization Platform API - XRPL Integration',
        data: {
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            network: process.env.XRPL_NETWORK || 'testnet',
            endpoints: {
                health: '/health',
                wallet: '/api/wallet',
                asset: '/api/asset',
                dex: '/api/dex'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Simple 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        data: null,
        timestamp: new Date().toISOString()
    });
});

// Simple error handler
app.use((error, req, res, next) => {
    console.error('Error:', error.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        data: null,
        timestamp: new Date().toISOString()
    });
});

// Start server
const server = app.listen(PORT, HOST, () => {
    console.log(`
🚀 RWA Tokenization Platform Server Started
📍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 Network: ${process.env.XRPL_NETWORK || 'testnet'}
🏠 Host: ${HOST}:${PORT}
📊 API Endpoints:
   - Health: http://${HOST}:${PORT}/health
   - Wallet: http://${HOST}:${PORT}/api/wallet
   - Asset: http://${HOST}:${PORT}/api/asset
   - DEX: http://${HOST}:${PORT}/api/dex
   
🔧 Features Available:
   ✅ Wallet Generation & Management
   ✅ Asset Creation & Tokenization
   ✅ Token Transfers & Redemption
   ✅ DEX Trading & Order Books
   ✅ Atomic Swaps & Market Orders
   ✅ XRPL Integration (~$0.0002 fees)
   ✅ Health Monitoring

⚡ Complete RWA Tokenization Platform Ready!
🌐 Ready for Render deployment
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

module.exports = app;