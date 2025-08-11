/**
 * Production Startup Script for XRPL Tokenization Platform
 * Starts the full XRPL API server with investment portal
 */

const path = require('path');

// Load environment variables
try {
    require('dotenv').config();
    console.log('✅ Environment loaded');
} catch (error) {
    console.log('⚠️ No .env file found, using system environment');
}

// Set production defaults
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.API_PORT = process.env.API_PORT || process.env.PORT || 3001;

console.log('🚀 Starting XRPL Tokenization Platform...');
console.log(`📊 Environment: ${process.env.NODE_ENV}`);
console.log(`🔌 Port: ${process.env.API_PORT}`);
console.log(`🌐 XRPL Network: ${process.env.XRPL_NETWORK || 'TESTNET'}`);

// Production error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    if (global.apiServer) {
        global.apiServer.stop();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    if (global.apiServer) {
        global.apiServer.stop();
    }
    process.exit(0);
});

// Start the production XRPL API server (with investment portal)
try {
    console.log('🔥 Starting production XRPL API server...');
    require('./server/api-server.js');
} catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
}