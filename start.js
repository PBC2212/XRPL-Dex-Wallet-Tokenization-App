/**
 * Final Production Startup Script
 * Uses basic HTTP server to avoid Express routing issues
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
process.env.PORT = process.env.PORT || 10000;

console.log('🚀 Starting XRPL Tokenization Platform...');
console.log(`📊 Environment: ${process.env.NODE_ENV}`);
console.log(`🔌 Port: ${process.env.PORT}`);

// Start the basic server (no Express routing issues)
require('./server/basic-server.js');