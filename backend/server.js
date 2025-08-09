/**
 * XRPL API Server - Production Ready
 * Enterprise-grade XRPL tokenization and wallet management API
 * Ready for deployment to Render and beyond! 🚀
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Import your XRPL modules
const WalletManager = require('../src/wallet/wallet-manager');
const TokenIssuer = require('../src/tokenization/token-issuer');
const TrustlineManager = require('../src/trustlines/trustline-manager');
const { connectToXRPL, getXRPLClient } = require('../src/utils/xrpl-client');
const validators = require('../src/utils/validators');

class XRPLAPIServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.port = process.env.API_PORT || 3001;
        this.clients = new Set();
        
        // Initialize managers
        this.walletManager = new WalletManager();
        this.tokenIssuer = new TokenIssuer();
        this.trustlineManager = new TrustlineManager();
        this.xrplClient = getXRPLClient();
        
        // Request tracking
        this.requestId = 0;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        // Request ID middleware for tracking
        this.app.use((req, res, next) => {
            req.requestId = ++this.requestId;
            req.startTime = Date.now();
            console.log(`🔄 [${req.requestId}] ${req.method} ${req.path} - Started`);
            next();
        });

        // Compression for production
        this.app.use(compression());

        // Security middleware - Production hardened
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    connectSrc: ["'self'", "wss:", "ws:"],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // CORS configuration for production
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'https://your-app.onrender.com',
            'https://your-domain.com'
        ];

        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, etc.)
                if (!origin) return callback(null, true);
                
                if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
        }));

        // Rate limiting - Production grade
        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: process.env.NODE_ENV === 'production' ? 100 : 1000,
            message: {
                success: false,
                error: 'Rate limit exceeded',
                message: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });

        const strictLimiter = rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: 10, // For sensitive operations
            message: {
                success: false,
                error: 'Rate limit exceeded',
                message: 'Too many sensitive operations, please wait.'
            }
        });

        this.app.use('/api/', apiLimiter);
        this.app.use('/api/wallets', strictLimiter);
        this.app.use('/api/tokens', strictLimiter);

        // Body parsing with limits
        this.app.use(bodyParser.json({ 
            limit: '10mb',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

        // Logging - Production ready
        this.app.use(morgan(process.env.NODE_ENV === 'production' 
            ? 'combined' 
            : 'dev'
        ));

        // Health check endpoint (no rate limit)
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'OK', 
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                network: process.env.XRPL_NETWORK || 'testnet',
                uptime: process.uptime()
            });
        });

        // Metrics endpoint
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

        // Response helper
        const sendResponse = (req, res, data, message = 'Success', statusCode = 200) => {
            const duration = Date.now() - req.startTime;
            console.log(`✅ [${req.requestId}] ${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
            
            res.status(statusCode).json({
                success: statusCode < 400,
                data: data,
                message: message,
                requestId: req.requestId,
                timestamp: new Date().toISOString()
            });
        };

        const sendError = (req, res, error, message = 'Error occurred', statusCode = 500) => {
            const duration = Date.now() - req.startTime;
            console.error(`❌ [${req.requestId}] ${req.method} ${req.path} - ${statusCode} (${duration}ms): ${error}`);
            
            res.status(statusCode).json({
                success: false,
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error,
                message: message,
                requestId: req.requestId,
                timestamp: new Date().toISOString()
            });
        };

        // ================================
        // WALLET MANAGEMENT ROUTES
        // ================================

        // Generate new wallet
        router.post('/wallets', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/wallets - Generate new wallet`);
                
                const { name, description } = req.body;
                const options = {};
                if (name) options.name = name;
                if (description) options.description = description;
                
                const result = await this.walletManager.generateWallet(options);
                
                const responseData = {
                    id: result.walletInfo.id,
                    address: result.walletInfo.address,
                    publicKey: result.walletInfo.publicKey,
                    seed: result.sensitive.seed, // Include in response (frontend will handle security)
                    network: result.walletInfo.network,
                    metadata: result.walletInfo.metadata
                };

                this.broadcastToClients({
                    type: 'WALLET_CREATED',
                    data: { 
                        address: result.walletInfo.address,
                        name: result.walletInfo.metadata.name
                    }
                });

                sendResponse(req, res, responseData, 'Wallet generated successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to generate wallet');
            }
        });

        // Import wallet from seed
        router.post('/wallets/import', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/wallets/import - Import wallet`);
                const { seed, name, description } = req.body;

                if (!seed) {
                    return sendError(req, res, 'Seed phrase is required', 'Missing required field', 400);
                }

                const options = {};
                if (name) options.name = name;
                if (description) options.description = description;

                const result = await this.walletManager.importWallet(seed, options);
                
                const responseData = {
                    id: result.walletInfo.id,
                    address: result.walletInfo.address,
                    publicKey: result.walletInfo.publicKey,
                    network: result.walletInfo.network,
                    metadata: result.walletInfo.metadata
                };

                sendResponse(req, res, responseData, 'Wallet imported successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to import wallet');
            }
        });

        // Export wallet (encrypted keystore)
        router.post('/wallets/export', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/wallets/export - Export wallet`);
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

        // List wallets
        router.get('/wallets', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/wallets - List wallets`);
                
                const wallets = this.walletManager.listWallets();
                
                sendResponse(req, res, { wallets, count: wallets.length }, 'Wallets retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to list wallets');
            }
        });

        // Get account balance
        router.get('/wallets/:address/balance', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/wallets/:address/balance - Get balance`);
                const { address } = req.params;

                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                try {
                    const balance = await this.xrplClient.getXRPBalance(address);
                    const accountInfo = await this.xrplClient.getAccountInfo(address);

                    sendResponse(req, res, {
                        address,
                        xrpBalance: balance,
                        accountData: accountInfo
                    }, 'Balance retrieved successfully');
                } catch (accountError) {
                    if (accountError.message.includes('Account not found')) {
                        sendResponse(req, res, {
                            address,
                            xrpBalance: '0',
                            accountData: null,
                            isNew: true
                        }, 'New wallet (0 XRP balance)');
                    } else {
                        throw accountError;
                    }
                }
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve balance');
            }
        });

        // ================================
        // TOKEN MANAGEMENT ROUTES
        // ================================

        // Create new token
        router.post('/tokens', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/tokens - Create token`);
                const { 
                    issuerWalletId,
                    currencyCode,
                    name,
                    symbol,
                    description,
                    decimals,
                    totalSupply,
                    settings
                } = req.body;

                if (!issuerWalletId || !currencyCode) {
                    return sendError(req, res, 'Issuer wallet ID and currency code are required', 'Missing required fields', 400);
                }

                const tokenData = {
                    currencyCode,
                    name,
                    symbol,
                    description,
                    decimals,
                    totalSupply,
                    settings
                };

                const issuerWallet = this.walletManager.getXRPLWallet(issuerWalletId);
                const result = await this.tokenIssuer.createToken(tokenData, issuerWallet);

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

        // Issue tokens
        router.post('/tokens/issue', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/tokens/issue - Issue tokens`);
                const { 
                    tokenId,
                    destinationAddress,
                    amount,
                    issuerWalletId,
                    memo
                } = req.body;

                if (!tokenId || !destinationAddress || !amount || !issuerWalletId) {
                    return sendError(req, res, 'Missing required fields', 'Validation error', 400);
                }

                if (!validators.isValidAddress(destinationAddress)) {
                    return sendError(req, res, 'Invalid destination address', 'Validation error', 400);
                }

                const issuerWallet = this.walletManager.getXRPLWallet(issuerWalletId);
                const options = {};
                if (memo) options.memo = memo;

                const result = await this.tokenIssuer.issueTokens(
                    tokenId, 
                    destinationAddress, 
                    amount, 
                    issuerWallet, 
                    options
                );

                this.broadcastToClients({
                    type: 'TOKENS_ISSUED',
                    data: {
                        tokenId,
                        destination: destinationAddress,
                        amount,
                        currency: result.currency
                    }
                });

                sendResponse(req, res, result, 'Tokens issued successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to issue tokens');
            }
        });

        // Burn tokens
        router.post('/tokens/burn', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/tokens/burn - Burn tokens`);
                const { 
                    tokenId,
                    amount,
                    holderWalletId,
                    issuerAddress
                } = req.body;

                if (!tokenId || !amount || !holderWalletId || !issuerAddress) {
                    return sendError(req, res, 'Missing required fields', 'Validation error', 400);
                }

                const holderWallet = this.walletManager.getXRPLWallet(holderWalletId);
                const result = await this.tokenIssuer.burnTokens(tokenId, amount, holderWallet, issuerAddress);

                this.broadcastToClients({
                    type: 'TOKENS_BURNED',
                    data: {
                        tokenId,
                        amount,
                        currency: result.currency
                    }
                });

                sendResponse(req, res, result, 'Tokens burned successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to burn tokens');
            }
        });

        // Get token info
        router.get('/tokens/:tokenId', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/tokens/:tokenId - Get token info`);
                const { tokenId } = req.params;

                const tokenInfo = this.tokenIssuer.getTokenInfo(tokenId);
                
                if (!tokenInfo) {
                    return sendError(req, res, 'Token not found', 'Not found', 404);
                }

                sendResponse(req, res, tokenInfo, 'Token information retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to get token info');
            }
        });

        // List tokens
        router.get('/tokens', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/tokens - List tokens`);
                
                const tokens = this.tokenIssuer.listTokens();
                
                sendResponse(req, res, { tokens, count: tokens.length }, 'Tokens retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to list tokens');
            }
        });

        // ================================
        // TRUSTLINE MANAGEMENT ROUTES
        // ================================

        // Create trustline
        router.post('/trustlines', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] POST /api/trustlines - Create trustline`);
                const { 
                    userWalletId,
                    currencyCode,
                    issuerAddress,
                    limitAmount,
                    memo
                } = req.body;

                if (!userWalletId || !currencyCode || !issuerAddress || !limitAmount) {
                    return sendError(req, res, 'Missing required fields', 'Validation error', 400);
                }

                if (!validators.isValidAddress(issuerAddress)) {
                    return sendError(req, res, 'Invalid issuer address', 'Validation error', 400);
                }

                const trustlineData = {
                    currencyCode,
                    issuerAddress,
                    limitAmount,
                    memo
                };

                const userWallet = this.walletManager.getXRPLWallet(userWalletId);
                const result = await this.trustlineManager.createTrustline(trustlineData, userWallet);

                this.broadcastToClients({
                    type: 'TRUSTLINE_CREATED',
                    data: {
                        currencyCode,
                        issuer: issuerAddress,
                        account: result.trustline.account
                    }
                });

                sendResponse(req, res, result, 'Trustline created successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to create trustline');
            }
        });

        // Modify trustline
        router.put('/trustlines', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] PUT /api/trustlines - Modify trustline`);
                const { 
                    userWalletId,
                    currencyCode,
                    issuerAddress,
                    newLimit
                } = req.body;

                if (!userWalletId || !currencyCode || !issuerAddress || !newLimit) {
                    return sendError(req, res, 'Missing required fields', 'Validation error', 400);
                }

                const modifyData = {
                    currencyCode,
                    issuerAddress,
                    newLimit
                };

                const userWallet = this.walletManager.getXRPLWallet(userWalletId);
                const result = await this.trustlineManager.modifyTrustline(modifyData, userWallet);

                sendResponse(req, res, result, 'Trustline modified successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to modify trustline');
            }
        });

        // Remove trustline
        router.delete('/trustlines', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] DELETE /api/trustlines - Remove trustline`);
                const { 
                    userWalletId,
                    currencyCode,
                    issuerAddress
                } = req.body;

                if (!userWalletId || !currencyCode || !issuerAddress) {
                    return sendError(req, res, 'Missing required fields', 'Validation error', 400);
                }

                const removeData = {
                    currencyCode,
                    issuerAddress
                };

                const userWallet = this.walletManager.getXRPLWallet(userWalletId);
                const result = await this.trustlineManager.removeTrustline(removeData, userWallet);

                sendResponse(req, res, result, 'Trustline removed successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to remove trustline');
            }
        });

        // Get account trustlines
        router.get('/trustlines/:address', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/trustlines/:address - Get trustlines`);
                const { address } = req.params;
                const { currency, issuer } = req.query;

                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                const options = {};
                if (currency) options.currency = currency;
                if (issuer) options.issuer = issuer;

                const result = await this.trustlineManager.getAllTrustlines(address, options);

                sendResponse(req, res, result, 'Trustlines retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve trustlines');
            }
        });

        // Check trustline capability
        router.get('/trustlines/:address/capability', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/trustlines/:address/capability - Check capability`);
                const { address } = req.params;

                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                const capability = await this.trustlineManager.checkTrustlineCapability(address);

                sendResponse(req, res, capability, 'Trustline capability checked successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to check trustline capability');
            }
        });

        // Get trustline stats
        router.get('/trustlines/:address/stats', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/trustlines/:address/stats - Get stats`);
                const { address } = req.params;

                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                const stats = await this.trustlineManager.getTrustlineStats(address);

                sendResponse(req, res, stats, 'Trustline stats retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to get trustline stats');
            }
        });

        // ================================
        // GENERAL QUERY ROUTES
        // ================================

        // Get transaction history
        router.get('/transactions/:address', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/transactions/:address - Get transactions`);
                const { address } = req.params;
                const limit = parseInt(req.query.limit) || 20;

                if (!validators.isValidAddress(address)) {
                    return sendError(req, res, 'Invalid XRPL address', 'Validation error', 400);
                }

                const client = await this.xrplClient.getClient();
                const response = await client.request({
                    command: 'account_tx',
                    account: address,
                    limit: Math.min(limit, 100) // Cap at 100 for performance
                });

                sendResponse(req, res, {
                    address,
                    transactions: response.result.transactions,
                    count: response.result.transactions.length
                }, 'Transaction history retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve transactions');
            }
        });

        // Get network info
        router.get('/network/info', async (req, res) => {
            try {
                console.log(`📍 [${req.requestId}] GET /api/network/info - Get network info`);
                const client = await this.xrplClient.getClient();
                const serverInfo = await client.request({ command: 'server_info' });
                
                sendResponse(req, res, {
                    network: process.env.XRPL_NETWORK || 'testnet',
                    serverInfo: serverInfo.result.info,
                    apiVersion: process.env.npm_package_version || '1.0.0'
                }, 'Network information retrieved successfully');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to retrieve network information');
            }
        });

        // Validate address
        router.post('/validate/address', (req, res) => {
            try {
                const { address } = req.body;
                
                if (!address) {
                    return sendError(req, res, 'Address is required', 'Missing field', 400);
                }

                const isValid = validators.isValidAddress(address);
                
                sendResponse(req, res, {
                    address,
                    isValid,
                    format: isValid ? 'XRPL Classic Address' : 'Invalid'
                }, 'Address validation completed');
            } catch (error) {
                sendError(req, res, error.message, 'Failed to validate address');
            }
        });

        // Mount all routes under /api prefix
        this.app.use('/api', router);

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                message: `${req.method} ${req.path} is not a valid API endpoint`,
                timestamp: new Date().toISOString()
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('🚨 Unhandled API error:', error);
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
                message: 'An unexpected error occurred',
                requestId: req.requestId || 'unknown',
                timestamp: new Date().toISOString()
            });
        });
    }

    setupWebSocket() {
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ 
            server: this.server,
            perMessageDeflate: {
                zlibDeflateOptions: {
                    level: 3,
                    chunkSize: 1024,
                },
                threshold: 1024,
                concurrencyLimit: 10,
                memLevel: 7
            }
        });

        this.wss.on('connection', (ws, req) => {
            const clientId = uuidv4();
            console.log(`🔌 New WebSocket connection: ${clientId} from ${req.connection.remoteAddress}`);
            
            ws.clientId = clientId;
            this.clients.add(ws);

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                data: { 
                    clientId: clientId,
                    timestamp: new Date().toISOString(),
                    server: 'XRPL API Server',
                    version: process.env.npm_package_version || '1.0.0'
                },
                message: 'Connected to XRPL API WebSocket'
            }));

            // Heartbeat
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log(`📨 WebSocket message from ${clientId}:`, data.type || 'unknown');
                    
                    // Handle ping messages
                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({
                            type: 'pong',
                            timestamp: new Date().toISOString()
                        }));
                    }
                } catch (error) {
                    console.error(`❌ Invalid WebSocket message from ${clientId}:`, error.message);
                }
            });

            ws.on('close', () => {
                console.log(`❌ WebSocket connection closed: ${clientId}`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error(`🚨 WebSocket error from ${clientId}:`, error.message);
                this.clients.delete(ws);
            });
        });

        // Heartbeat interval
        const heartbeat = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log(`💔 Terminating dead connection: ${ws.clientId}`);
                    this.clients.delete(ws);
                    return ws.terminate();
                }
                
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(heartbeat);
        });
    }

    broadcastToClients(message) {
        if (this.clients.size === 0) return;

        const messageStr = JSON.stringify({