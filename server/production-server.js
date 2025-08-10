/**
 * Fixed Production Server for Render Deployment
 * Simplified routing to avoid path-to-regexp issues
 */

const express = require('express');
const cors = require('cors');
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
        // Basic CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Serve static files from frontend build
        const frontendBuildPath = path.join(__dirname, '../frontend/build');
        if (fs.existsSync(frontendBuildPath)) {
            console.log('✅ Serving frontend from:', frontendBuildPath);
            this.app.use(express.static(frontendBuildPath));
        } else {
            console.log('⚠️ Frontend build directory not found at:', frontendBuildPath);
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

        // Basic wallet generation endpoint
        this.app.post('/api/wallets', (req, res) => {
            try {
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

        // Wallet import endpoint
        this.app.post('/api/wallets/import', (req, res) => {
            try {
                const { seed } = req.body;
                if (!seed) {
                    return res.status(400).json({
                        success: false,
                        error: 'Seed phrase is required',
                        message: 'Missing required field'
                    });
                }

                const mockWallet = {
                    id: `wallet_${Date.now()}`,
                    address: `r${Math.random().toString(36).substr(2, 25)}`,
                    publicKey: `ED${Math.random().toString(16).substr(2, 64).toUpperCase()}`,
                    network: 'TESTNET',
                    metadata: {
                        name: 'Imported Wallet',
                        description: 'Imported from seed'
                    }
                };

                res.json({
                    success: true,
                    data: mockWallet,
                    message: 'Wallet imported successfully (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to import wallet'
                });
            }
        });

        // Wallet balance endpoint
        this.app.get('/api/wallets/:address/balance', (req, res) => {
            try {
                const { address } = req.params;
                res.json({
                    success: true,
                    data: {
                        address: address,
                        xrpBalance: (Math.random() * 1000).toFixed(6),
                        accountData: {
                            Sequence: Math.floor(Math.random() * 100) + 1,
                            OwnerCount: Math.floor(Math.random() * 10)
                        }
                    },
                    message: 'Balance retrieved successfully (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve balance'
                });
            }
        });

        // Token creation endpoint
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
                    message: 'Token created successfully (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to create token'
                });
            }
        });

        // Tokens list endpoint
        this.app.get('/api/tokens', (req, res) => {
            try {
                const mockTokens = [
                    {
                        tokenId: 'token_demo_1',
                        currencyCode: 'DEMO',
                        name: 'Demo Token',
                        totalSupply: 1000000,
                        createdAt: new Date().toISOString(),
                        issuer: 'rDemoIssuer123456789'
                    }
                ];

                res.json({
                    success: true,
                    data: {
                        tokens: mockTokens,
                        count: mockTokens.length
                    },
                    message: 'Tokens retrieved successfully (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve tokens'
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

        // Dashboard endpoint
        this.app.get('/api/dashboard/:address', (req, res) => {
            try {
                const { address } = req.params;
                const mockDashboard = {
                    balance: {
                        xrpBalance: (Math.random() * 1000).toFixed(6),
                        accountData: {
                            Sequence: Math.floor(Math.random() * 100) + 1,
                            OwnerCount: Math.floor(Math.random() * 10)
                        }
                    },
                    trustlines: [],
                    recentTransactions: [],
                    userTokens: [],
                    stats: {
                        totalBalance: parseFloat((Math.random() * 1000).toFixed(6)),
                        activeTokens: 0,
                        totalTransactions: 0,
                        portfolioValue: parseFloat((Math.random() * 500).toFixed(2)),
                        createdTokens: 0
                    }
                };

                res.json({
                    success: true,
                    data: mockDashboard,
                    message: 'Dashboard data retrieved (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve dashboard data'
                });
            }
        });

        // Transactions endpoint
        this.app.get('/api/transactions/:address', (req, res) => {
            try {
                res.json({
                    success: true,
                    data: {
                        transactions: [],
                        totalCount: 0,
                        pagination: {
                            limit: 20,
                            offset: 0,
                            hasMore: false
                        }
                    },
                    message: 'Transactions retrieved (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve transactions'
                });
            }
        });

        // Trustlines endpoint
        this.app.get('/api/trustlines/:address', (req, res) => {
            try {
                res.json({
                    success: true,
                    data: {
                        trustlines: [],
                        totalCount: 0
                    },
                    message: 'Trustlines retrieved (demo mode)'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve trustlines'
                });
            }
        });

        // Frontend routing - MUST BE LAST
        this.app.get('*', (req, res) => {
            const frontendIndexPath = path.join(__dirname, '../frontend/build/index.html');
            if (fs.existsSync(frontendIndexPath)) {
                res.sendFile(frontendIndexPath);
            } else {
                res.status(404).json({
                    error: 'Frontend not found',
                    message: 'The frontend application is not available',
                    buildPath: frontendIndexPath,
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

module.exports = ProductionServer;