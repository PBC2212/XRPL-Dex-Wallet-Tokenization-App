/**
 * XRPL API Server - Production Ready
 * Enterprise-grade XRPL tokenization and wallet management API
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const compression = require('compression');
require('dotenv').config();

// XRPL modules
const WalletManager = require('../src/wallet/wallet-manager');
// const tokenIssuer = require('../src/tokenization/token-issuer'); // removed old system reference
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
        // this.tokenIssuer = tokenIssuer; // old system removed
        this.trustlineManager = new TrustlineManager();
        this.xrplClient = getXRPLClient();

        this.requestId = 0;

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
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
        // WALLET MANAGEMENT ROUTES
        // ================================

        router.post('/wallets', async (req, res) => {
            try {
                const options = {};
                if (req.body?.name) options.name = req.body.name;
                if (req.body?.description) options.description = req.body.description;
                
                const result = await this.walletManager.generateWallet(options);
                
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
        // TOKEN MANAGEMENT ROUTES - NEW WORKING SYSTEM
        // ================================

        router.post('/tokens', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/tokens - Create token (WORKING SYSTEM)`);
                const userAddress = req.body.metadata?.issuer || 'unknown';
                const result = await WorkingTokenSystem.createToken(req.body, userAddress);
                
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

        // Trustline and other routes remain unchanged...
        // ================================
        // TRUSTLINE MANAGEMENT ROUTES
        // ================================

        // [Trustline routes here...]

        // ================================
        // GENERAL QUERY ROUTES
        // ================================

        // [General query routes here...]

        this.app.use('/api', router);
    }

    setupWebSocket() {
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        // [WebSocket setup code unchanged...]
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
