/**
 * Simplified Production Startup Script
 */

const path = require('path');
const fs = require('fs');

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

// Start the production server
require('./server/production-server.js');