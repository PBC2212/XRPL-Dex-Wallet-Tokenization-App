/**
 * Production Startup Script for XRPL Tokenization Platform
 * Handles environment configuration and server initialization with error handling
 */

const path = require('path');
const fs = require('fs');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Don't exit immediately, try to keep running
    setTimeout(() => {
        console.log('🔄 Attempting to continue...');
    }, 1000);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit immediately, try to keep running
    setTimeout(() => {
        console.log('🔄 Attempting to continue...');
    }, 1000);
});

try {
    // Load production environment variables
    const envPath = path.join(__dirname, '.env.production');
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log('✅ Production environment loaded');
    } else {
        // Fall back to regular .env file
        require('dotenv').config();
        console.log('⚠️ Using development environment in production');
    }

    // Set production defaults with better error handling
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    process.env.API_PORT = process.env.PORT || process.env.API_PORT || 10000;

    // Security: Generate runtime encryption key if not provided
    if (!process.env.WALLET_ENCRYPTION_KEY) {
        const crypto = require('crypto');
        process.env.WALLET_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
        console.log('🔒 Generated runtime encryption key');
    }

    console.log('🚀 Starting XRPL Tokenization Platform...');
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🌐 Network: ${process.env.XRPL_NETWORK}`);
    console.log(`🔌 Port: ${process.env.API_PORT}`);

    // Add a small delay to ensure all environment is loaded
    setTimeout(() => {
        try {
            // Start the enhanced API server
            console.log('🔄 Loading API server...');
            require('./server/api-server.js');
        } catch (serverError) {
            console.error('❌ Failed to start API server:', serverError);
            console.error('Stack:', serverError.stack);
            
            // Try to start a basic fallback server
            console.log('🔄 Starting fallback server...');
            startFallbackServer();
        }
    }, 1000);

} catch (error) {
    console.error('❌ Startup error:', error);
    console.error('Stack:', error.stack);
    
    // Start fallback server
    startFallbackServer();
}

/**
 * Fallback server in case main server fails
 */
function startFallbackServer() {
    console.log('🆘 Starting minimal fallback server...');
    
    try {
        const express = require('express');
        const app = express();
        const port = process.env.PORT || process.env.API_PORT || 10000;

        app.use(express.json());

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({ 
                status: 'Fallback Server Running',
                timestamp: new Date().toISOString(),
                message: 'Main server failed, running in fallback mode'
            });
        });

        // Basic error page
        app.get('*', (req, res) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Server is starting up, please try again in a moment',
                timestamp: new Date().toISOString()
            });
        });

        app.listen(port, () => {
            console.log(`🆘 Fallback server running on port ${port}`);
            console.log('📋 Check /health endpoint for status');
        });

    } catch (fallbackError) {
        console.error('❌ Even fallback server failed:', fallbackError);
        // Keep the process alive
        setInterval(() => {
            console.log('💓 Process still alive, waiting for restart...');
        }, 30000);
    }
}