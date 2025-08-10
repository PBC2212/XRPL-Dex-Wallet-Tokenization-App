/**
 * Production Startup Script for XRPL Tokenization Platform
 * Handles environment configuration and server initialization
 */

const path = require('path');
const fs = require('fs');

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

// Set production defaults
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.API_PORT = process.env.PORT || process.env.API_PORT || 3001;

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

// Start the enhanced API server (the one we've been working with)
require('./server/api-server.js');