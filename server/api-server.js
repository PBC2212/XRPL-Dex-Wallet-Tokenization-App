/**
 * XRPL API Server - Enhanced with Transaction History
 * Maintains full backward compatibility with existing wallet and token functionality
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const compression = require('compression');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

// XRPL modules
const WalletManager = require('../src/wallet/wallet-manager');
const TrustlineManager = require('../src/trustlines/trustline-manager');
const { getXRPLClient } = require('../src/utils/xrpl-client');
const validators = require('../src/utils/validators');

// Import the working system
const WorkingTokenSystem = require('../src/tokenization/working-token-system');

class XRPLAPIServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.port = process.env.API_PORT || 3001;
        this.clients = new Set();

        this.walletManager = new WalletManager();
        this.trustlineManager = new TrustlineManager();
        this.xrplClient = getXRPLClient();

        // NEW: Transaction history storage
        this.transactionHistory = new Map(); // walletAddress -> transactions[]
        this.transactionsDir = path.join(process.cwd(), 'transactions');
        this.initializeTransactionHistory();

        this.requestId = 0;

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    /**
     * NEW: Initialize transaction history system
     */
    async initializeTransactionHistory() {
        try {
            await fs.ensureDir(this.transactionsDir);
            await this.loadTransactionHistory();
            console.log('📋 Transaction history system initialized');
        } catch (error) {
            console.error('Failed to initialize transaction history:', error.message);
        }
    }

    /**
     * NEW: Load transaction history from disk
     */
    async loadTransactionHistory() {
        try {
            const files = await fs.readdir(this.transactionsDir);
            const transactionFiles = files.filter(file => file.endsWith('.json'));

            for (const file of transactionFiles) {
                try {
                    const filePath = path.join(this.transactionsDir, file);
                    const transactions = await fs.readJson(filePath);
                    const address = file.replace('.json', '');
                    this.transactionHistory.set(address, transactions);
                } catch (error) {
                    console.error(`Failed to load transactions for ${file}:`, error.message);
                }
            }

            if (this.transactionHistory.size > 0) {
                console.log(`📁 Loaded transaction history for ${this.transactionHistory.size} addresses`);
            }
        } catch (error) {
            // Directory might not exist yet, that's okay
        }
    }

    /**
     * NEW: Save transaction history to disk
     */
    async saveTransactionHistory(address, transactions) {
        try {
            const filePath = path.join(this.transactionsDir, `${address}.json`);
            await fs.writeJson(filePath, transactions, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save transaction history:', error.message);
        }
    }

    /**
     * NEW: Add transaction to history
     */
    async addTransaction(address, transaction) {
        if (!this.transactionHistory.has(address)) {
            this.transactionHistory.set(address, []);
        }

        const transactions = this.transactionHistory.get(address);
        transactions.unshift({
            ...transaction,
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        });

        // Keep only last 100 transactions per address
        if (transactions.length > 100) {
            transactions.splice(100);
        }

        this.transactionHistory.set(address, transactions);
        await this.saveTransactionHistory(address, transactions);

        // Broadcast to connected clients
        this.broadcastToClients({
            type: 'TRANSACTION_ADDED',
            data: { address, transaction: transactions[0] }
        });
    }

    setupMiddleware() {
        this.app.use((req, res, next) => {
            req.requestId = ++this.requestId;
            req.startTime = Date.now();
            console.log(`🔄 [${req.requestId}] ${req.method} ${req.path} - Started`);
            next();
        });

        this.app.use(compression());
        this.app.use(helmet({
            contentSecurityPolicy: false,
            hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
        }));

        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'https://your-app.onrender.com',
            'https://your-domain.com'
        ];

        this.app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
        }));

        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: process.env.NODE_ENV === 'production' ? 100 : 1000,
            message: { success: false, error: 'Rate limit exceeded', message: 'Too many requests, try later.' }
        });

        const strictLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 10,
            message: { success: false, error: 'Rate limit exceeded', message: 'Too many sensitive operations, wait.' }
        });

        this.app.use('/api/', apiLimiter);
        this.app.use('/api/wallets', strictLimiter);
        this.app.use('/api/tokens', strictLimiter);

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'OK',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                network: process.env.XRPL_NETWORK || 'testnet',
                uptime: process.uptime()
            });
        });

        this.app.get('/metrics', (req, res) => {
            res.json({
                activeConnections: this.clients.size,
                totalRequests: this.requestId,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            });
        });
    }

    setupRoutes() {
        const router = express.Router();

        const sendResponse = (req, res, data, message = 'Success', statusCode = 200) => {
            console.log(`✅ [${req.requestId}] ${req.method} ${req.path} - ${statusCode} (${Date.now() - req.startTime}ms)`);
            res.status(statusCode).json({
                success: statusCode < 400,
                data,
                message,
                requestId: req.requestId,
                timestamp: new Date().toISOString()
            });
        };

        const sendError = (req, res, error, message = 'Error occurred', statusCode = 500) => {
            console.error(`❌ [${req.requestId}] ${req.method} ${req.path} - ${statusCode} (${Date.now() - req.startTime}ms): ${error}`);
            res.status(statusCode).json({
                success: false,
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error,
                message,
                requestId: req.requestId,
                timestamp: new Date().toISOString()
            });
        };

        // ================================
        // WALLET MANAGEMENT ROUTES (ENHANCED)
        // ================================

        router.post('/wallets', async (req, res) => {
            try {
                const options = {};
                if (req.body?.name) options.name = req.body.name;
                if (req.body?.description) options.description = req.body.description;
                
                const result = await this.walletManager.generateWallet(options);
                
                // NEW: Add to transaction history
                await this.addTransaction(result.walletInfo.address, {
                    type: 'WALLET_CREATED',
                    description: 'Wallet created successfully',
                    details: {
                        walletId: result.walletInfo.id,
                        address: result.walletInfo.address,
                        name: result.walletInfo.metadata.name
                    },
                    status: 'SUCCESS'
                });

                this.broadcastToClients({
                    type: 'WALLET_CREATED',
                    data: { 
                        address: result.walletInfo.address,
                        name: result.walletInfo.metadata.name
                    }
                });

                sendResponse(req, res, {
                    id: result.walletInfo.id,
                    address: result.walletInfo.address,
                    publicKey: result.walletInfo.publicKey,
                    seed: result.sensitive.seed,
                    network: result.walletInfo.network,
                    metadata: result.walletInfo.metadata
                }, 'Wallet generated successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to generate wallet');
            }
        });

        router.post('/wallets/import', async (req, res) => {
            try {
                const { seed, name, description } = req.body;
                if (!seed) {
                    return sendError(req, res, 'Seed phrase is required', 'Missing required field', 400);
                }

                const options = {};
                if (name) options.name = name;
                if (description) options.description = description;

                const result = await this.walletManager.importWallet(seed, options);
                
                // NEW: Add to transaction history
                await this.addTransaction(result.walletInfo.address, {
                    type: 'WALLET_IMPORTED',
                    description: 'Wallet imported successfully',
                    details: {
                        walletId: result.walletInfo.id,
                        address: result.walletInfo.address,
                        name: result.walletInfo.metadata.name
                    },
                    status: 'SUCCESS'
                });
                
                sendResponse(req, res, {
                    id: result.walletInfo.id,
                    address: result.walletInfo.address,
                    publicKey: result.walletInfo.publicKey,
                    network: result.walletInfo.network,
                    metadata: result.walletInfo.metadata
                }, 'Wallet imported successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to import wallet');
            }
        });

        router.post('/wallets/export', async (req, res) => {
            try {
                const { walletId, password, filename } = req.body;
                if (!walletId || !password) {
                    return sendError(req, res, 'Wallet ID and password are required', 'Missing required fields', 400);
                }
                const result = await this.walletManager.exportKeystore(walletId, password, filename);
                sendResponse(req, res, result, 'Wallet exported successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to export wallet');
            }
        });

        router.get('/wallets', async (req, res) => {
            try {
                const wallets = this.walletManager.listWallets();
                sendResponse(req, res, { wallets, count: wallets.length }, 'Wallets retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to list wallets');
            }
        });

        router.get('/wallets/:address/balance', async (req, res) => {
            try {
                const { address } = req.params;
                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }
                try {
                    const balance = await this.xrplClient.getXRPBalance(address);
                    const accountInfo = await this.xrplClient.getAccountInfo(address);
                    sendResponse(req, res, { address, xrpBalance: balance, accountData: accountInfo }, 'Balance retrieved successfully');
                } catch (accountError) {
                    if (accountError.message.includes('Account not found')) {
                        sendResponse(req, res, { address, xrpBalance: '0', accountData: null, isNew: true }, 'New wallet (0 XRP balance)');
                    } else throw accountError;
                }
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve balance');
            }
        });

        // ================================
        // TOKEN MANAGEMENT ROUTES (ENHANCED)
        // ================================

        router.post('/tokens', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/tokens - Create token`);
                const userAddress = req.body.metadata?.issuer || req.body.issuerAddress || 'unknown';
                const result = await WorkingTokenSystem.createToken(req.body, userAddress);
                
                // NEW: Add to transaction history for the user who created the token
                if (userAddress !== 'unknown') {
                    await this.addTransaction(userAddress, {
                        type: 'TOKEN_CREATED',
                        description: `Token ${result.tokenInfo.currencyCode} created`,
                        details: {
                            tokenId: result.tokenId,
                            currencyCode: result.tokenInfo.currencyCode,
                            name: result.tokenInfo.name,
                            totalSupply: result.tokenInfo.totalSupply,
                            issuer: result.tokenInfo.issuer
                        },
                        status: 'SUCCESS'
                    });
                }

                this.broadcastToClients({
                    type: 'TOKEN_CREATED',
                    data: {
                        tokenId: result.tokenId,
                        currencyCode: result.tokenInfo.currencyCode,
                        issuer: result.tokenInfo.issuer
                    }
                });

                sendResponse(req, res, result, 'Token created successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to create token');
            }
        });

        router.get('/tokens/:tokenId', async (req, res) => {
            try {
                const tokenInfo = WorkingTokenSystem.getToken(req.params.tokenId);
                if (!tokenInfo) {
                    return sendError(req, res, 'Token not found', 'Not found', 404);
                }
                sendResponse(req, res, tokenInfo, 'Token retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to get token');
            }
        });

        router.get('/tokens', async (req, res) => {
            try {
                const tokens = WorkingTokenSystem.listTokens();
                sendResponse(req, res, { tokens, count: tokens.length }, 'Tokens retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to list tokens');
            }
        });

        // ================================
        // NEW: TRANSACTION HISTORY ROUTES
        // ================================

        router.get('/transactions/:address', async (req, res) => {
            try {
                const { address } = req.params;
                const { limit = 20, offset = 0 } = req.query;
                
                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                // Get local transaction history
                const localTransactions = this.transactionHistory.get(address) || [];
                
                // Apply pagination
                const startIndex = parseInt(offset);
                const endIndex = startIndex + parseInt(limit);
                const paginatedTransactions = localTransactions.slice(startIndex, endIndex);

                sendResponse(req, res, {
                    transactions: paginatedTransactions,
                    totalCount: localTransactions.length,
                    localCount: localTransactions.length,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        hasMore: localTransactions.length > endIndex
                    }
                }, 'Transactions retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve transactions');
            }
        });

        // ================================
        // NEW: DASHBOARD DATA ROUTE
        // ================================

        router.get('/dashboard/:address', async (req, res) => {
            try {
                const { address } = req.params;
                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                // Get balance
                let balance = { xrpBalance: '0', accountData: null };
                try {
                    const xrpBalance = await this.xrplClient.getXRPBalance(address);
                    const accountData = await this.xrplClient.getAccountInfo(address);
                    balance = { xrpBalance, accountData };
                } catch (error) {
                    // Account not found is okay
                }

                // Get trustlines
                let trustlines = [];
                try {
                    const trustlineResult = await this.trustlineManager.getAllTrustlines(address);
                    trustlines = trustlineResult.trustlines || [];
                } catch (error) {
                    // No trustlines is okay
                }

                // Get recent transactions
                const recentTransactions = (this.transactionHistory.get(address) || []).slice(0, 5);

                // Get user's created tokens
                const userTokens = WorkingTokenSystem.getTokensByUser(address);

                // Calculate stats
                const stats = {
                    totalBalance: parseFloat(balance.xrpBalance || 0),
                    activeTokens: trustlines.filter(tl => parseFloat(tl.balance || 0) > 0).length,
                    totalTransactions: (this.transactionHistory.get(address) || []).length,
                    portfolioValue: parseFloat(balance.xrpBalance || 0) * 0.5, // Mock portfolio value
                    createdTokens: userTokens.length
                };

                const dashboardData = {
                    balance,
                    trustlines,
                    recentTransactions,
                    userTokens,
                    stats
                };

                sendResponse(req, res, dashboardData, 'Dashboard data retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve dashboard data');
            }
        });

        // ================================
        // TRUSTLINE MANAGEMENT ROUTES
        // ================================

        router.get('/trustlines/:address', async (req, res) => {
            try {
                const { address } = req.params;
                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                const result = await this.trustlineManager.getAllTrustlines(address);
                sendResponse(req, res, result, 'Trustlines retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve trustlines');
            }
        });

        // ================================
        // NETWORK INFO ROUTES
        // ================================

        router.get('/network/info', async (req, res) => {
            try {
                const serverInfo = await this.xrplClient.getClient().request({
                    command: 'server_info'
                });

                const networkInfo = {
                    network: this.xrplClient.getNetworkType().toUpperCase(),
                    serverInfo: {
                        validated_ledger: {
                            seq: serverInfo.result.info.validated_ledger.seq,
                            hash: serverInfo.result.info.validated_ledger.hash,
                            reserve_base_xrp: serverInfo.result.info.validated_ledger.reserve_base_xrp,
                            reserve_inc_xrp: serverInfo.result.info.validated_ledger.reserve_inc_xrp
                        },
                        build_version: serverInfo.result.info.build_version,
                        complete_ledgers: serverInfo.result.info.complete_ledgers
                    },
                    connected: this.xrplClient.isClientConnected(),
                    timestamp: new Date().toISOString()
                };

                sendResponse(req, res, networkInfo, 'Network info retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve network info');
            }
        });

        this.app.use('/api', router);
    }

    setupWebSocket() {
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/ws'
        });

        this.wss.on('connection', (ws, req) => {
            console.log(`🔌 WebSocket client connected from ${req.socket.remoteAddress}`);
            this.clients.add(ws);

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log('📨 WebSocket message received:', data.type);
                    
                    ws.send(JSON.stringify({
                        type: 'ACK',
                        message: 'Message received',
                        timestamp: new Date().toISOString()
                    }));
                } catch (error) {
                    console.error('❌ WebSocket message error:', error.message);
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`🔌 WebSocket client disconnected: ${code} ${reason}`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('🚨 WebSocket error:', error.message);
                this.clients.delete(ws);
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'CONNECTED',
                message: 'Connected to XRPL API WebSocket',
                timestamp: new Date().toISOString()
            }));
        });
    }

    broadcastToClients(message) {
        if (this.clients.size === 0) return;
        const messageStr = JSON.stringify({ ...message, timestamp: new Date().toISOString() });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try { client.send(messageStr); }
                catch (error) { this.clients.delete(client); }
            } else this.clients.delete(client);
        });
    }

    async start() {
        try {
            await this.xrplClient.connect();
            this.server.listen(this.port, () => {
                console.log(`🚀 XRPL API Server listening on port ${this.port}`);
                console.log(`🌐 WebSocket endpoint: ws://localhost:${this.port}/ws`);
                console.log(`📋 Transaction history enabled`);
            });
        } catch (error) {
            console.error('❌ Failed to start API server:', error.message);
            process.exit(1);
        }
    }

    async stop() {
        this.clients.forEach(client => client.terminate());
        if (this.server) {
            this.server.close(() => {
                console.log('✅ API server stopped successfully');
            });
        }
    }
}

if (require.main === module) {
    global.apiServer = new XRPLAPIServer();
    global.apiServer.start();
}

module.exports = XRPLAPIServer;