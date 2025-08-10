/**
 * Simplified Production Server for Render Deployment
 * Focuses on core functionality with robust error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

class ProductionServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || process.env.API_PORT || 10000;
        this.setupBasicMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupBasicMiddleware() {
        // Security and basic middleware
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false
        }));

        this.app.use(cors({
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(morgan('combined'));

        // Serve static files from frontend build
        const frontendBuildPath = path.join(__dirname, '../frontend/build');
        if (fs.existsSync(frontendBuildPath)) {
            console.log('✅ Serving frontend from:', frontendBuildPath);
            this.app.use(express.static(frontendBuildPath));
        } else {
            console.log('⚠️ Frontend build directory not found');
        }
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'OK',
                service: 'XRPL Tokenization Platform',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                network: process.env.XRPL_NETWORK || 'TESTNET',
                uptime: process.uptime(),
                port: this.port,
                environment: process.env.NODE_ENV || 'production'
            });
        });

        // API status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                success: true,
                message: 'API is running',
                timestamp: new Date().toISOString(),
                endpoints: [
                    'GET /health',
                    'GET /api/status',
                    'POST /api/wallets',
                    'POST /api/tokens'
                ]
            });
        });

        // Basic wallet generation endpoint (simplified)
        this.app.post('/api/wallets', (req, res) => {
            try {
                // Generate a mock wallet for now
                const mockWallet = {
                    id: `wallet_${Date.now()}`,
                    address: `r${Math.random().toString(36).substr(2, 25)}`,
                    publicKey: `ED${Math.random().toString(16).substr(2, 64).toUpperCase()}`,
                    network: 'TESTNET',
                    createdAt: new Date().toISOString(),
                    metadata: {
                        name: req.body.name || 'Generated Wallet',
                        description: req.body.description || ''
                    }
                };

                res.json({
                    success: true,
                    data: {
                        ...mockWallet,
                        seed: `s${Math.random().toString(36).substr(2, 28)}`
                    },
                    message: 'Wallet generated successfully (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to generate wallet'
                });
            }
        });

        // Basic token creation endpoint (simplified)
        this.app.post('/api/tokens', (req, res) => {
            try {
                const tokenData = req.body;
                const mockToken = {
                    tokenId: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    currencyCode: tokenData.tokenCode?.toUpperCase() || 'DEMO',
                    issuer: `r${Math.random().toString(36).substr(2, 25)}`,
                    name: tokenData.name || 'Demo Token',
                    symbol: tokenData.symbol || tokenData.tokenCode || 'DEMO',
                    description: tokenData.description || '',
                    decimals: parseInt(tokenData.decimals) || 6,
                    totalSupply: parseInt(tokenData.totalSupply) || 1000,
                    createdAt: new Date().toISOString(),
                    network: 'TESTNET',
                    status: 'CREATED'
                };

                res.json({
                    success: true,
                    tokenId: mockToken.tokenId,
                    tokenInfo: mockToken,
                    message: 'Token created successfully (demo mode)',
                    instructions: {
                        note: 'This is a demo deployment. Full XRPL integration requires additional setup.'
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to create token'
                });
            }
        });

        // Network info endpoint
        this.app.get('/api/network/info', (req, res) => {
            res.json({
                success: true,
                data: {
                    network: 'TESTNET',
                    serverInfo: {
                        validated_ledger: {
                            seq: Math.floor(Math.random() * 1000000) + 80000000,
                            reserve_base_xrp: 10,
                            reserve_inc_xrp: 2
                        }
                    },
                    connected: true,
                    timestamp: new Date().toISOString()
                },
                message: 'Network info retrieved (demo mode)'
            });
        });

        // Catch-all for frontend routing
        this.app.get('*', (req, res) => {
            const frontendIndexPath = path.join(__dirname, '../frontend/build/index.html');
            if (fs.existsSync(frontendIndexPath)) {
                res.sendFile(frontendIndexPath);
            } else {
                res.status(404).json({
                    error: 'Frontend not found',
                    message: 'The frontend application is not available',
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    setupErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('❌ Server Error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An unexpected error occurred',
                timestamp: new Date().toISOString()
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Not found',
                message: `Route ${req.method} ${req.path} not found`,
                timestamp: new Date().toISOString()
            });
        });
    }

    start() {
        try {
            this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`🚀 Production server started successfully!`);
                console.log(`📊 Port: ${this.port}`);
                console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
                console.log(`🔗 Health check: http://localhost:${this.port}/health`);
                console.log(`📱 API status: http://localhost:${this.port}/api/status`);
                console.log(`✅ Server is ready to receive requests`);
            });
        } catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Start the server
const server = new ProductionServer();
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📥 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📥 SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = ProductionServer;