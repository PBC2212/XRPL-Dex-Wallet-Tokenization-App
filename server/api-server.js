const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

// Import your existing backend modules
const { generateWallet, importWallet, exportKeystore } = require('../src/wallet/wallet-manager');
const TokenIssuer = require('../src/tokenization/token-issuer');
const TrustlineManager = require('../src/trustlines/trustline-manager');
const { connectToXRPL } = require('../src/utils/xrpl-client');
const validators = require('../src/utils/validators');

class XRPLAPIServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.port = process.env.API_PORT || 3001;
        this.clients = new Set();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false, // Allow for development
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP, please try again later.'
        });
        this.app.use('/api/', limiter);

        // Body parsing
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

        // Logging
        this.app.use(morgan('combined'));

        // Health check endpoint (no rate limit)
        this.app.get('/health', (req, res) => {
            res.json({ status: 'OK', timestamp: new Date().toISOString() });
        });
    }

    setupRoutes() {
        const router = express.Router();

        // ================================
        // WALLET MANAGEMENT ROUTES
        // ================================

        // Generate new wallet
        router.post('/wallets', async (req, res) => {
            try {
                console.log('📍 POST /api/wallets - Generate new wallet');
                
                const wallet = await generateWallet();
                
                const response = {
                    success: true,
                    data: {
                        address: wallet.address,
                        publicKey: wallet.publicKey,
                        seed: wallet.seed
                    },
                    message: 'Wallet generated successfully'
                };

                this.broadcastToClients({
                    type: 'WALLET_CREATED',
                    data: { address: wallet.address }
                });

                res.json(response);
            } catch (error) {
                console.error('❌ Error generating wallet:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to generate wallet'
                });
            }
        });

        // Import wallet from seed
        router.post('/wallets/import', async (req, res) => {
            try {
                console.log('📍 POST /api/wallets/import - Import wallet');
                const { seed } = req.body;

                if (!seed) {
                    return res.status(400).json({
                        success: false,
                        error: 'Seed phrase is required',
                        message: 'Please provide a valid seed phrase'
                    });
                }

                const wallet = await importWallet(seed);
                
                res.json({
                    success: true,
                    data: {
                        address: wallet.address,
                        publicKey: wallet.publicKey
                    },
                    message: 'Wallet imported successfully'
                });
            } catch (error) {
                console.error('❌ Error importing wallet:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to import wallet'
                });
            }
        });

        // Export wallet (encrypted keystore)
        router.post('/wallets/export', async (req, res) => {
            try {
                console.log('📍 POST /api/wallets/export - Export wallet');
                const { seed, password } = req.body;

                if (!seed || !password) {
                    return res.status(400).json({
                        success: false,
                        error: 'Seed and password are required',
                        message: 'Please provide both seed phrase and password'
                    });
                }

                const keystore = await exportKeystore(seed, password);
                
                res.json({
                    success: true,
                    data: { keystore },
                    message: 'Wallet exported successfully'
                });
            } catch (error) {
                console.error('❌ Error exporting wallet:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to export wallet'
                });
            }
        });

        // Get account balance
        router.get('/wallets/:address/balance', async (req, res) => {
            try {
                console.log('📍 GET /api/wallets/:address/balance - Get balance');
                const { address } = req.params;

                if (!validators.isValidAddress(address)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid XRPL address',
                        message: 'Please provide a valid XRPL address'
                    });
                }

                const client = await connectToXRPL();
                
                try {
                    const accountInfo = await client.request({
                        command: 'account_info',
                        account: address
                    });

                    const balance = parseFloat(accountInfo.result.account_data.Balance) / 1000000; // Convert drops to XRP

                    res.json({
                        success: true,
                        data: {
                            address,
                            xrpBalance: balance,
                            accountData: accountInfo.result.account_data
                        },
                        message: 'Balance retrieved successfully'
                    });
                } catch (accountError) {
                    // Handle case where account doesn't exist yet (new wallet)
                    if (accountError.data && accountError.data.error === 'actNotFound') {
                        console.log('ℹ️  Account not found (new wallet):', address);
                        res.json({
                            success: true,
                            data: {
                                address,
                                xrpBalance: 0,
                                accountData: null,
                                isNew: true
                            },
                            message: 'New wallet (0 XRP balance)'
                        });
                    } else {
                        throw accountError;
                    }
                }
            } catch (error) {
                console.error('❌ Error getting balance:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve balance'
                });
            }
        });

        // ================================
        // TOKEN MANAGEMENT ROUTES
        // ================================

        // Create new token
        router.post('/tokens', async (req, res) => {
            try {
                console.log('📍 POST /api/tokens - Create token');
                const { 
                    issuerSeed, 
                    tokenCode, 
                    totalSupply, 
                    metadata,
                    transferFee = 0,
                    requireAuth = false 
                } = req.body;

                // Validate required fields
                if (!issuerSeed || !tokenCode || !totalSupply) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields',
                        message: 'issuerSeed, tokenCode, and totalSupply are required'
                    });
                }

                // Validate token data
                const tokenData = { tokenCode, totalSupply, metadata };
                const validation = validators.validateTokenData(tokenData);
                if (!validation.isValid) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid token data',
                        message: validation.errors.join(', ')
                    });
                }

                const result = await TokenIssuer.createToken({
                    issuerSeed,
                    tokenCode,
                    totalSupply: parseInt(totalSupply),
                    metadata,
                    transferFee,
                    requireAuth
                });

                this.broadcastToClients({
                    type: 'TOKEN_CREATED',
                    data: {
                        tokenCode,
                        issuer: result.issuerAddress,
                        totalSupply
                    }
                });

                res.json({
                    success: true,
                    data: result,
                    message: 'Token created successfully'
                });
            } catch (error) {
                console.error('❌ Error creating token:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to create token'
                });
            }
        });

        // Issue tokens to holder
        router.post('/tokens/issue', async (req, res) => {
            try {
                console.log('📍 POST /api/tokens/issue - Issue tokens');
                const { 
                    issuerSeed, 
                    holderAddress, 
                    tokenCode, 
                    amount 
                } = req.body;

                if (!issuerSeed || !holderAddress || !tokenCode || !amount) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields',
                        message: 'issuerSeed, holderAddress, tokenCode, and amount are required'
                    });
                }

                if (!validators.isValidAddress(holderAddress)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid holder address',
                        message: 'Please provide a valid XRPL address'
                    });
                }

                const result = await TokenIssuer.issueToHolder({
                    issuerSeed,
                    holderAddress,
                    tokenCode,
                    amount: parseInt(amount)
                });

                this.broadcastToClients({
                    type: 'TOKENS_ISSUED',
                    data: {
                        tokenCode,
                        holder: holderAddress,
                        amount
                    }
                });

                res.json({
                    success: true,
                    data: result,
                    message: 'Tokens issued successfully'
                });
            } catch (error) {
                console.error('❌ Error issuing tokens:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to issue tokens'
                });
            }
        });

        // ================================
        // TRUSTLINE MANAGEMENT ROUTES
        // ================================

        // Create trustline
        router.post('/trustlines', async (req, res) => {
            try {
                console.log('📍 POST /api/trustlines - Create trustline');
                const { 
                    holderSeed, 
                    issuerAddress, 
                    tokenCode, 
                    trustLimit = '1000000000' 
                } = req.body;

                if (!holderSeed || !issuerAddress || !tokenCode) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields',
                        message: 'holderSeed, issuerAddress, and tokenCode are required'
                    });
                }

                if (!validators.isValidAddress(issuerAddress)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid issuer address',
                        message: 'Please provide a valid XRPL address'
                    });
                }

                const result = await TrustlineManager.createTrustline({
                    holderSeed,
                    issuerAddress,
                    tokenCode,
                    trustLimit
                });

                this.broadcastToClients({
                    type: 'TRUSTLINE_CREATED',
                    data: {
                        tokenCode,
                        issuer: issuerAddress,
                        holder: result.holderAddress
                    }
                });

                res.json({
                    success: true,
                    data: result,
                    message: 'Trustline created successfully'
                });
            } catch (error) {
                console.error('❌ Error creating trustline:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to create trustline'
                });
            }
        });

        // Get account trustlines
        router.get('/trustlines/:address', async (req, res) => {
            try {
                console.log('📍 GET /api/trustlines/:address - Get trustlines');
                const { address } = req.params;

                if (!validators.isValidAddress(address)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid XRPL address',
                        message: 'Please provide a valid XRPL address'
                    });
                }

                const client = await connectToXRPL();
                const response = await client.request({
                    command: 'account_lines',
                    account: address
                });

                res.json({
                    success: true,
                    data: {
                        address,
                        trustlines: response.result.lines
                    },
                    message: 'Trustlines retrieved successfully'
                });
            } catch (error) {
                console.error('❌ Error getting trustlines:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve trustlines'
                });
            }
        });

        // ================================
        // GENERAL QUERY ROUTES
        // ================================

        // Get transaction history
        router.get('/transactions/:address', async (req, res) => {
            try {
                console.log('📍 GET /api/transactions/:address - Get transactions');
                const { address } = req.params;
                const limit = parseInt(req.query.limit) || 20;

                if (!validators.isValidAddress(address)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid XRPL address',
                        message: 'Please provide a valid XRPL address'
                    });
                }

                const client = await connectToXRPL();
                const response = await client.request({
                    command: 'account_tx',
                    account: address,
                    limit: limit
                });

                res.json({
                    success: true,
                    data: {
                        address,
                        transactions: response.result.transactions
                    },
                    message: 'Transaction history retrieved successfully'
                });
            } catch (error) {
                console.error('❌ Error getting transactions:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve transactions'
                });
            }
        });

        // Get network info
        router.get('/network/info', async (req, res) => {
            try {
                console.log('📍 GET /api/network/info - Get network info');
                const client = await connectToXRPL();
                const serverInfo = await client.request({ command: 'server_info' });
                
                res.json({
                    success: true,
                    data: {
                        network: process.env.XRPL_NETWORK || 'TESTNET',
                        serverInfo: serverInfo.result.info
                    },
                    message: 'Network information retrieved successfully'
                });
            } catch (error) {
                console.error('❌ Error getting network info:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    message: 'Failed to retrieve network information'
                });
            }
        });

        // Mount all routes under /api prefix
        this.app.use('/api', router);

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                message: `${req.method} ${req.path} is not a valid API endpoint`
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('🚨 Unhandled API error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An unexpected error occurred'
            });
        });
    }

    setupWebSocket() {
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws, req) => {
            console.log('🔌 New WebSocket connection from:', req.connection.remoteAddress);
            this.clients.add(ws);

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                data: { timestamp: new Date().toISOString() },
                message: 'Connected to XRPL API WebSocket'
            }));

            ws.on('close', () => {
                console.log('❌ WebSocket connection closed');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('🚨 WebSocket error:', error);
                this.clients.delete(ws);
            });
        });
    }

    broadcastToClients(message) {
        const messageStr = JSON.stringify({
            ...message,
            timestamp: new Date().toISOString()
        });

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    async start() {
        try {
            // Test XRPL connection first
            console.log('🔍 Testing XRPL connection...');
            const client = await connectToXRPL();
            console.log('✅ XRPL connection successful');
            
            // Start the server
            this.server.listen(this.port, () => {
                console.log('\n🚀 XRPL API Server Started Successfully!');
                console.log('======================================');
                console.log(`📡 HTTP API: http://localhost:${this.port}`);
                console.log(`🔌 WebSocket: ws://localhost:${this.port}`);
                console.log(`🌍 Network: ${process.env.XRPL_NETWORK || 'TESTNET'}`);
                console.log(`💡 Health Check: http://localhost:${this.port}/health`);
                console.log('======================================');
                console.log('\n📋 Available API Endpoints:');
                console.log('POST   /api/wallets                    - Generate new wallet');
                console.log('POST   /api/wallets/import             - Import wallet from seed');
                console.log('POST   /api/wallets/export             - Export encrypted keystore');
                console.log('GET    /api/wallets/:address/balance   - Get XRP balance');
                console.log('POST   /api/tokens                     - Create new token');
                console.log('POST   /api/tokens/issue               - Issue tokens to holder');
                console.log('POST   /api/trustlines                 - Create trustline');
                console.log('GET    /api/trustlines/:address        - Get account trustlines');
                console.log('GET    /api/transactions/:address      - Get transaction history');
                console.log('GET    /api/network/info               - Get network information');
                console.log('\n🎯 Ready for frontend connections!\n');
            });
        } catch (error) {
            console.error('❌ Failed to start API server:', error.message);
            process.exit(1);
        }
    }

    async stop() {
        console.log('🛑 Shutting down API server...');
        
        // Close WebSocket connections
        this.clients.forEach(client => {
            client.terminate();
        });
        
        // Close HTTP server
        if (this.server) {
            this.server.close(() => {
                console.log('✅ API server stopped successfully');
            });
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received shutdown signal...');
    if (global.apiServer) {
        await global.apiServer.stop();
    }
    process.exit(0);
});

// Start the server if this file is run directly
if (require.main === module) {
    global.apiServer = new XRPLAPIServer();
    global.apiServer.start();
}

module.exports = XRPLAPIServer;