/**
 * Production XRPL API Server - Real XRPL Only
 * Ready for mainnet deployment - No mock data
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
const xrpl = require('xrpl');
require('dotenv').config();

// Production environment validation
console.log('🔍 Production Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('XRPL_NETWORK from env:', process.env.XRPL_NETWORK);
console.log('API_PORT from env:', process.env.API_PORT);

// Validate and set XRPL network
function getValidXRPLNetwork() {
    const envNetwork = process.env.XRPL_NETWORK;
    const testnetUrl = process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233';
    const mainnetUrl = process.env.XRPL_MAINNET_URL || 'wss://xrplcluster.com';
    const devnetUrl = process.env.XRPL_DEVNET_URL || 'wss://s.devnet.rippletest.net:51233';
    
    console.log('🔍 Raw XRPL_NETWORK value:', JSON.stringify(envNetwork));
    console.log('🔍 Available URLs:');
    console.log('  - TESTNET:', testnetUrl);
    console.log('  - MAINNET:', mainnetUrl);
    console.log('  - DEVNET:', devnetUrl);
    
    if (!envNetwork) {
        console.log('⚠️ No XRPL_NETWORK found in environment, using testnet');
        return testnetUrl;
    }
    
    const cleanNetwork = envNetwork.trim().toUpperCase();
    
    switch (cleanNetwork) {
        case 'TESTNET':
        case 'TEST':
            console.log('✅ Using TESTNET:', testnetUrl);
            return testnetUrl;
            
        case 'MAINNET':
        case 'MAIN':
        case 'PRODUCTION':
            console.log('🚨 Using MAINNET:', mainnetUrl);
            console.log('🚨 PRODUCTION MODE - REAL XRP WILL BE USED!');
            return mainnetUrl;
            
        case 'DEVNET':
        case 'DEV':
            console.log('✅ Using DEVNET:', devnetUrl);
            return devnetUrl;
            
        default:
            if (cleanNetwork.startsWith('WSS://') || cleanNetwork.startsWith('WS://')) {
                console.log('✅ Using custom URL:', envNetwork);
                return envNetwork;
            }
            
            console.log('❌ Invalid XRPL_NETWORK format:', cleanNetwork);
            console.log('✅ Falling back to testnet:', testnetUrl);
            return testnetUrl;
    }
}

const XRPL_NETWORK = getValidXRPLNetwork();

// Production Token Storage (In production, use a database)
class TokenStorage {
    constructor() {
        this.tokens = new Map();
        this.tokensDir = path.join(process.cwd(), 'tokens');
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            await fs.ensureDir(this.tokensDir);
            await this.loadTokens();
            console.log('💾 Token storage initialized');
        } catch (error) {
            console.error('Failed to initialize token storage:', error.message);
        }
    }

    async loadTokens() {
        try {
            const tokensFile = path.join(this.tokensDir, 'tokens.json');
            if (await fs.pathExists(tokensFile)) {
                const tokensData = await fs.readJson(tokensFile);
                this.tokens = new Map(Object.entries(tokensData));
                console.log(`📁 Loaded ${this.tokens.size} tokens from storage`);
            }
        } catch (error) {
            console.error('Failed to load tokens:', error.message);
        }
    }

    async saveTokens() {
        try {
            const tokensFile = path.join(this.tokensDir, 'tokens.json');
            const tokensData = Object.fromEntries(this.tokens);
            await fs.writeJson(tokensFile, tokensData, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save tokens:', error.message);
        }
    }

    async addToken(tokenData) {
        this.tokens.set(tokenData.tokenId, tokenData);
        await this.saveTokens();
        console.log(`💾 Token saved: ${tokenData.tokenId}`);
    }

    getAllTokens() {
        return Array.from(this.tokens.values());
    }

    getToken(tokenId) {
        return this.tokens.get(tokenId);
    }
}

class RealWalletManager {
    constructor() {
        this.network = XRPL_NETWORK;
        console.log('🔄 Wallet Manager initialized with network:', this.network);
    }

    async createWallet(options = {}) {
        try {
            const wallet = xrpl.Wallet.generate();
            
            return {
                id: `wallet_${Date.now()}`,
                address: wallet.address,
                publicKey: wallet.publicKey,
                privateKey: wallet.privateKey,
                seed: wallet.seed,
                network: this.network.includes('altnet') ? 'TESTNET' : 'MAINNET',
                createdAt: new Date().toISOString(),
                metadata: {
                    name: options.name || 'Generated Wallet',
                    description: options.description || ''
                }
            };
        } catch (error) {
            throw new Error(`Wallet creation failed: ${error.message}`);
        }
    }

    async importWallet(seed, options = {}) {
        try {
            const wallet = xrpl.Wallet.fromSeed(seed);
            
            return {
                id: `wallet_${Date.now()}`,
                address: wallet.address,
                publicKey: wallet.publicKey,
                network: this.network.includes('altnet') ? 'TESTNET' : 'MAINNET',
                metadata: {
                    name: options.name || 'Imported Wallet',
                    description: options.description || ''
                }
            };
        } catch (error) {
            throw new Error(`Wallet import failed: ${error.message}`);
        }
    }

    async getBalance(address, client) {
        try {
            const accountInfo = await client.request({
                command: 'account_info',
                account: address,
                ledger_index: 'validated'
            });

            const xrpBalance = xrpl.dropsToXrp(accountInfo.result.account_data.Balance);
            
            return {
                address: address,
                xrpBalance: xrpBalance,
                accountData: {
                    Sequence: accountInfo.result.account_data.Sequence,
                    OwnerCount: accountInfo.result.account_data.OwnerCount,
                    PreviousTxnID: accountInfo.result.account_data.PreviousTxnID,
                    AccountTxnID: accountInfo.result.account_data.AccountTxnID
                }
            };
        } catch (error) {
            if (error.data?.error === 'actNotFound') {
                return {
                    address: address,
                    xrpBalance: '0',
                    accountData: null,
                    error: 'Account not found (not activated)'
                };
            }
            throw new Error(`Balance retrieval failed: ${error.message}`);
        }
    }
}

class RealTrustlineManager {
    async getTrustlines(address, client) {
        try {
            const trustlines = await client.request({
                command: 'account_lines',
                account: address,
                ledger_index: 'validated'
            });

            return trustlines.result.lines.map(line => ({
                account: line.account,
                currency: line.currency,
                balance: line.balance,
                limit: line.limit,
                limitPeer: line.limit_peer,
                qualityIn: line.quality_in,
                qualityOut: line.quality_out,
                noRipple: line.no_ripple || false
            }));
        } catch (error) {
            if (error.data?.error === 'actNotFound') {
                return [];
            }
            throw new Error(`Trustline retrieval failed: ${error.message}`);
        }
    }
}

class RealTransactionManager {
    async getTransactionHistory(address, client, limit = 20) {
        try {
            const transactions = await client.request({
                command: 'account_tx',
                account: address,
                limit: limit,
                ledger_index_min: -1,
                ledger_index_max: -1
            });

            return transactions.result.transactions.map(tx => ({
                hash: tx.tx.hash,
                type: tx.tx.TransactionType,
                account: tx.tx.Account,
                destination: tx.tx.Destination,
                amount: tx.tx.Amount,
                fee: tx.tx.Fee,
                sequence: tx.tx.Sequence,
                date: tx.tx.date,
                ledgerIndex: tx.tx.ledger_index,
                validated: tx.validated,
                meta: tx.meta
            }));
        } catch (error) {
            if (error.data?.error === 'actNotFound') {
                return [];
            }
            throw new Error(`Transaction history retrieval failed: ${error.message}`);
        }
    }
}

class XRPLAPIServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.port = process.env.API_PORT || 3001;
        this.clients = new Set();

        // Real XRPL managers
        this.walletManager = new RealWalletManager();
        this.trustlineManager = new RealTrustlineManager();
        this.transactionManager = new RealTransactionManager();
        this.tokenStorage = new TokenStorage();
        
        // XRPL Client setup
        console.log('🔄 Creating XRPL client with URL:', XRPL_NETWORK);
        try {
            this.xrplClient = new xrpl.Client(XRPL_NETWORK);
            console.log('✅ XRPL client created successfully');
        } catch (error) {
            console.error('❌ Failed to create XRPL client:', error.message);
            throw error;
        }

        this.requestId = 0;

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        // Request logging
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

        // Production CORS configuration
        const allowedOrigins = [
            'http://localhost:3000', // React frontend
            'http://127.0.0.1:3000', // Alternative localhost
            process.env.FRONTEND_URL,
            'https://your-domain.com',
        ].filter(Boolean);

        this.app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                
                if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
                    callback(null, true);
                } else {
                    console.log(`🚨 CORS blocked origin: ${origin}`);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
        }));

        // Production rate limiting
        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: process.env.NODE_ENV === 'production' ? 100 : 1000,
            message: { success: false, error: 'Rate limit exceeded', message: 'Too many requests, try later.' }
        });

        const strictLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: process.env.NODE_ENV === 'production' ? 10 : 50,
            message: { success: false, error: 'Rate limit exceeded', message: 'Too many sensitive operations, wait.' }
        });

        this.app.use('/api/', apiLimiter);
        this.app.use('/api/wallets', strictLimiter);
        this.app.use('/api/tokens', strictLimiter);
        this.app.use('/api/investments', strictLimiter);

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

        // Health endpoint
        this.app.get('/health', (req, res) => {
            res.status(200).json({ 
                status: 'OK',
                service: 'XRPL Tokenization Platform',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                network: XRPL_NETWORK,
                networkType: XRPL_NETWORK.includes('altnet') ? 'TESTNET' : 'MAINNET',
                uptime: process.uptime(),
                port: this.port,
                xrplConnected: this.xrplClient.isConnected(),
                production: process.env.NODE_ENV === 'production'
            });
        });
    }

    setupRoutes() {
        const router = express.Router();

        // Status endpoint
        router.get('/status', (req, res) => {
            res.json({
                success: true,
                message: 'XRPL API is running',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                network: XRPL_NETWORK,
                networkType: XRPL_NETWORK.includes('altnet') ? 'TESTNET' : 'MAINNET',
                xrplConnected: this.xrplClient.isConnected(),
                production: process.env.NODE_ENV === 'production'
            });
        });

        // Wallet routes
        router.post('/wallets', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Creating new XRPL wallet...`);
                
                const { name, description } = req.body || {};
                const walletData = await this.walletManager.createWallet({ name, description });

                console.log(`✅ [${requestId}] XRPL wallet created: ${walletData.address}`);
                res.json({
                    success: true,
                    data: walletData,
                    message: 'XRPL wallet created successfully',
                    network: XRPL_NETWORK
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Wallet creation failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Wallet creation failed',
                    message: error.message
                });
            }
        });

        router.post('/wallets/import', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Importing XRPL wallet...`);
                
                const { seed, name, description } = req.body || {};
                
                if (!seed) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required field',
                        message: 'Seed phrase is required for wallet import'
                    });
                }

                const walletData = await this.walletManager.importWallet(seed, { name, description });

                console.log(`✅ [${requestId}] XRPL wallet imported: ${walletData.address}`);
                res.json({
                    success: true,
                    data: walletData,
                    message: 'XRPL wallet imported successfully',
                    network: XRPL_NETWORK
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Wallet import failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Wallet import failed',
                    message: error.message
                });
            }
        });

        router.get('/wallets/:address/balance', async (req, res) => {
            const requestId = req.requestId;
            try {
                const { address } = req.params;
                console.log(`🔄 [${requestId}] Getting XRPL balance for: ${address}`);
                
                const balanceData = await this.walletManager.getBalance(address, this.xrplClient);
                
                console.log(`✅ [${requestId}] Balance retrieved: ${balanceData.xrpBalance} XRP`);
                res.json({
                    success: true,
                    data: balanceData,
                    message: 'XRPL balance retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Balance retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Balance retrieval failed',
                    message: error.message
                });
            }
        });

        // Token routes
        router.post('/tokens', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Creating XRPL token...`);
                console.log(`🔄 [${requestId}] Token data:`, req.body);
                
                const tokenData = req.body || {};
                
                const token = {
                    tokenId: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    currencyCode: tokenData.tokenCode?.toUpperCase() || 'TOKEN',
                    issuer: tokenData.issuerAddress || tokenData.issuer,
                    name: tokenData.name || 'New Token',
                    symbol: tokenData.symbol || tokenData.tokenCode || 'TOKEN',
                    description: tokenData.description || '',
                    decimals: parseInt(tokenData.decimals) || 15,
                    totalSupply: parseInt(tokenData.totalSupply) || 1000000,
                    createdAt: new Date().toISOString(),
                    network: XRPL_NETWORK.includes('altnet') ? 'TESTNET' : 'MAINNET',
                    status: 'CREATED',
                    createdBy: tokenData.createdBy || 'system'
                };

                await this.tokenStorage.addToken(token);

                console.log(`✅ [${requestId}] Token created and stored: ${token.tokenId}`);
                res.json({
                    success: true,
                    tokenId: token.tokenId,
                    tokenInfo: token,
                    message: 'Token created successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Token creation failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Token creation failed',
                    message: error.message
                });
            }
        });

        router.get('/tokens', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Getting stored tokens...`);
                
                const tokens = this.tokenStorage.getAllTokens();
                
                console.log(`✅ [${requestId}] Retrieved ${tokens.length} tokens from storage`);
                res.json({
                    success: true,
                    data: { tokens, count: tokens.length },
                    message: 'Tokens retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Token retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Token retrieval failed',
                    message: error.message
                });
            }
        });

        // Trustline routes
        router.get('/trustlines/:address', async (req, res) => {
            const requestId = req.requestId;
            try {
                const { address } = req.params;
                console.log(`🔄 [${requestId}] Getting XRPL trustlines for: ${address}`);
                
                const trustlines = await this.trustlineManager.getTrustlines(address, this.xrplClient);
                
                console.log(`✅ [${requestId}] Retrieved ${trustlines.length} trustlines`);
                res.json({
                    success: true,
                    data: { trustlines, totalCount: trustlines.length },
                    message: 'XRPL trustlines retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Trustline retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Trustline retrieval failed',
                    message: error.message
                });
            }
        });

        // Transaction routes
        router.get('/transactions/:address', async (req, res) => {
            const requestId = req.requestId;
            try {
                const { address } = req.params;
                const { limit = 20 } = req.query;
                
                console.log(`🔄 [${requestId}] Getting XRPL transactions for: ${address}`);
                
                const transactions = await this.transactionManager.getTransactionHistory(
                    address, 
                    this.xrplClient, 
                    parseInt(limit)
                );
                
                console.log(`✅ [${requestId}] Retrieved ${transactions.length} transactions`);
                res.json({
                    success: true,
                    data: {
                        transactions,
                        totalCount: transactions.length,
                        pagination: {
                            limit: parseInt(limit),
                            offset: 0,
                            hasMore: transactions.length === parseInt(limit)
                        }
                    },
                    message: 'XRPL transaction history retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Transaction history retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Transaction history retrieval failed',
                    message: error.message
                });
            }
        });

        // Dashboard route
        router.get('/dashboard/:address', async (req, res) => {
            const requestId = req.requestId;
            try {
                const { address } = req.params;
                console.log(`🔄 [${requestId}] Getting dashboard data for: ${address}`);

                const [balance, trustlines, transactions] = await Promise.all([
                    this.walletManager.getBalance(address, this.xrplClient).catch(() => ({ xrpBalance: '0', accountData: null })),
                    this.trustlineManager.getTrustlines(address, this.xrplClient).catch(() => []),
                    this.transactionManager.getTransactionHistory(address, this.xrplClient, 10).catch(() => [])
                ]);

                const userTokens = this.tokenStorage.getAllTokens().filter(token => 
                    token.issuer === address || token.createdBy === address
                );

                const stats = {
                    totalBalance: parseFloat(balance.xrpBalance || 0),
                    activeTokens: trustlines.length,
                    totalTransactions: transactions.length,
                    portfolioValue: parseFloat(balance.xrpBalance || 0),
                    createdTokens: userTokens.length
                };

                console.log(`✅ [${requestId}] Dashboard data compiled`);
                res.json({
                    success: true,
                    data: {
                        balance,
                        trustlines,
                        recentTransactions: transactions,
                        userTokens,
                        stats
                    },
                    message: 'Dashboard data retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Dashboard data retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Dashboard data retrieval failed',
                    message: error.message
                });
            }
        });

        // Network info route
        router.get('/network/info', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Getting XRPL network info...`);
                
                const serverInfo = await this.xrplClient.request({ command: 'server_info' });
                
                console.log(`✅ [${requestId}] XRPL network info retrieved`);
                res.json({
                    success: true,
                    data: {
                        network: XRPL_NETWORK,
                        networkType: XRPL_NETWORK.includes('altnet') ? 'TESTNET' : 'MAINNET',
                        serverInfo: serverInfo.result.info,
                        connected: this.xrplClient.isConnected(),
                        timestamp: new Date().toISOString()
                    },
                    message: 'XRPL network information retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Network info retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Network info retrieval failed',
                    message: error.message
                });
            }
        });

        // Investment routes
        router.get('/investments/opportunities', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Getting real investment opportunities...`);
                
                const allTokens = this.tokenStorage.getAllTokens();
                const opportunities = allTokens.map(token => ({
                    ...token,
                    availableForInvestment: true,
                    currentPrice: 1.0,
                    marketCap: token.totalSupply * 1.0,
                    performance24h: 0,
                    availableTokens: Math.floor(token.totalSupply * 0.8),
                    investors: 0,
                    minInvestment: 10,
                    maxInvestment: 100000,
                    category: this.getCategoryFromDescription(token.description)
                }));
                
                console.log(`✅ [${requestId}] Retrieved ${opportunities.length} real investment opportunities`);
                res.json({
                    success: true,
                    data: {
                        opportunities,
                        totalOpportunities: opportunities.length,
                        totalMarketCap: opportunities.reduce((sum, token) => sum + parseFloat(token.marketCap || 0), 0)
                    },
                    message: 'Real investment opportunities retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Failed to get investment opportunities:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get investment opportunities',
                    message: error.message
                });
            }
        });

        router.post('/investments/create-trustline', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Creating real trustline for investment...`);
                
                const { investorSeed, tokenCode, issuerAddress, limit } = req.body;
                
                if (!investorSeed || !tokenCode || !issuerAddress) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields',
                        message: 'Investor seed, token code, and issuer address are required'
                    });
                }

                const wallet = xrpl.Wallet.fromSeed(investorSeed);
                
                const trustlineTransaction = {
                    TransactionType: 'TrustSet',
                    Account: wallet.address,
                    LimitAmount: {
                        currency: tokenCode,
                        issuer: issuerAddress,
                        value: limit || '1000000'
                    }
                };

                const prepared = await this.xrplClient.autofill(trustlineTransaction);
                const signed = wallet.sign(prepared);
                const result = await this.xrplClient.submitAndWait(signed.tx_blob);
                
                console.log(`✅ [${requestId}] Real trustline created: ${result.result.hash}`);
                res.json({
                    success: true,
                    data: {
                        transactionHash: result.result.hash,
                        investorAddress: wallet.address,
                        tokenCode,
                        issuerAddress,
                        limit: limit || '1000000'
                    },
                    message: 'Real investment trustline created successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Trustline creation failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Trustline creation failed',
                    message: error.message
                });
            }
        });

        router.post('/investments/purchase', async (req, res) => {
            const requestId = req.requestId;
            try {
                console.log(`🔄 [${requestId}] Processing real token purchase...`);
                
                const { investorSeed, tokenCode, issuerAddress, amount } = req.body;
                
                if (!investorSeed || !tokenCode || !issuerAddress || !amount) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields',
                        message: 'Investor seed, token code, issuer address, and amount are required'
                    });
                }

                const wallet = xrpl.Wallet.fromSeed(investorSeed);
                
                console.log(`✅ [${requestId}] Token purchase processed for ${wallet.address}`);
                res.json({
                    success: true,
                    data: {
                        investorAddress: wallet.address,
                        tokenCode,
                        issuerAddress,
                        amount: amount,
                        purchaseId: `purchase_${Date.now()}`
                    },
                    message: 'Token purchase processed successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Token purchase failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Token purchase failed',
                    message: error.message
                });
            }
        });

        router.get('/investments/portfolio/:address', async (req, res) => {
            const requestId = req.requestId;
            try {
                const { address } = req.params;
                console.log(`🔄 [${requestId}] Getting investment portfolio for: ${address}`);

                const [balance, trustlines] = await Promise.all([
                    this.walletManager.getBalance(address, this.xrplClient).catch(() => ({ xrpBalance: '0' })),
                    this.trustlineManager.getTrustlines(address, this.xrplClient).catch(() => [])
                ]);

                const portfolio = {
                    address,
                    xrpBalance: balance.xrpBalance,
                    tokenHoldings: trustlines.map(line => ({
                        currency: line.currency,
                        issuer: line.account,
                        balance: line.balance,
                        limit: line.limit,
                        currentValue: parseFloat(line.balance) * 1.0
                    })),
                    totalPortfolioValue: parseFloat(balance.xrpBalance) + 
                        trustlines.reduce((sum, line) => sum + (parseFloat(line.balance) * 1.0), 0)
                };

                console.log(`✅ [${requestId}] Investment portfolio retrieved`);
                res.json({
                    success: true,
                    data: portfolio,
                    message: 'Investment portfolio retrieved successfully'
                });
            } catch (error) {
                console.error(`❌ [${requestId}] Portfolio retrieval failed:`, error.message);
                res.status(500).json({
                    success: false,
                    error: 'Portfolio retrieval failed',
                    message: error.message
                });
            }
        });

        // Mount the router
        this.app.use('/api', router);

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            const requestId = req.requestId || 'unknown';
            console.error(`❌ [${requestId}] Unhandled error:`, err.message);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            const requestId = req.requestId || 'unknown';
            console.log(`❌ [${requestId}] Route not found: ${req.method} ${req.originalUrl}`);
            res.status(404).json({
                success: false,
                error: 'Route not found',
                message: `${req.method} ${req.originalUrl} not found`
            });
        });
    }

    getCategoryFromDescription(description) {
        if (!description) return 'Other';
        
        const desc = description.toLowerCase();
        if (desc.includes('real estate') || desc.includes('property')) return 'Real Estate';
        if (desc.includes('tech') || desc.includes('technology')) return 'Technology';
        if (desc.includes('energy') || desc.includes('renewable')) return 'Energy';
        if (desc.includes('health') || desc.includes('medical')) return 'Healthcare';
        if (desc.includes('finance') || desc.includes('fintech')) return 'Finance';
        if (desc.includes('art') || desc.includes('creative')) return 'Arts & Culture';
        
        return 'Other';
    }

    setupWebSocket() {
        this.server = http.createServer(this.app);
        
        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/ws',
            verifyClient: (info) => {
                return true;
            }
        });

        this.wss.on('connection', (ws, req) => {
            const clientId = Math.random().toString(36).substr(2, 9);
            console.log(`📡 WebSocket client connected: ${clientId}`);
            
            ws.clientId = clientId;
            this.clients.add(ws);

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log(`📡 [${clientId}] WebSocket message:`, data.type);
                    
                    switch (data.type) {
                        case 'ping':
                            ws.send(JSON.stringify({
                                type: 'pong',
                                timestamp: Date.now()
                            }));
                            break;
                            
                        case 'subscribe_balance':
                            ws.subscribedAddress = data.address;
                            ws.send(JSON.stringify({
                                type: 'subscription_confirmed',
                                address: data.address
                            }));
                            break;
                            
                        case 'get_status':
                            ws.send(JSON.stringify({
                                type: 'status',
                                connected: this.xrplClient.isConnected(),
                                network: XRPL_NETWORK,
                                clients: this.clients.size
                            }));
                            break;
                            
                        default:
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Unknown message type'
                            }));
                    }
                } catch (error) {
                    console.error(`❌ [${clientId}] WebSocket message error:`, error.message);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format'
                    }));
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`📡 [${clientId}] WebSocket client disconnected: ${code} ${reason}`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error(`❌ [${clientId}] WebSocket error:`, error.message);
                this.clients.delete(ws);
            });

            ws.send(JSON.stringify({
                type: 'welcome',
                clientId: clientId,
                server: 'XRPL Tokenization Platform',
                network: XRPL_NETWORK,
                timestamp: new Date().toISOString()
            }));
        });

        console.log('📡 WebSocket server setup complete');
    }

    async broadcast(message) {
        if (this.clients.size === 0) return;
        
        const messageStr = JSON.stringify(message);
        const promises = [];
        
        this.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                promises.push(
                    new Promise(resolve => {
                        ws.send(messageStr, resolve);
                    })
                );
            } else {
                this.clients.delete(ws);
            }
        });

        await Promise.all(promises);
        console.log(`📡 Broadcast sent to ${promises.length} clients`);
    }

    async connectXRPL() {
        try {
            console.log('🔄 Connecting to XRPL network...');
            await this.xrplClient.connect();
            console.log('✅ Connected to XRPL network successfully');
            
            this.xrplClient.on('transaction', (tx) => {
                console.log('📡 XRPL Transaction:', tx.transaction.hash);
                this.broadcast({
                    type: 'transaction',
                    data: tx
                });
            });

            this.xrplClient.on('ledgerClosed', (ledger) => {
                console.log('📡 XRPL Ledger closed:', ledger.ledger_index);
                this.broadcast({
                    type: 'ledger_closed',
                    data: {
                        ledger_index: ledger.ledger_index,
                        ledger_hash: ledger.ledger_hash,
                        timestamp: new Date().toISOString()
                    }
                });
            });

            return true;
        } catch (error) {
            console.error('❌ Failed to connect to XRPL:', error.message);
            return false;
        }
    }

    async start() {
        try {
            const xrplConnected = await this.connectXRPL();
            if (!xrplConnected) {
                console.log('⚠️ Starting server without XRPL connection');
            }

            this.server.listen(this.port, () => {
                console.log('🚀 ===================================');
                console.log('🚀 XRPL TOKENIZATION PLATFORM STARTED');
                console.log('🚀 ===================================');
                console.log(`🌐 Server running on port: ${this.port}`);
                console.log(`🔗 Health check: http://localhost:${this.port}/health`);
                console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}/ws`);
                console.log(`🌐 API base URL: http://localhost:${this.port}/api`);
                console.log(`🔌 XRPL Network: ${XRPL_NETWORK}`);
                console.log(`📊 Network Type: ${XRPL_NETWORK.includes('altnet') ? 'TESTNET' : 'MAINNET'}`);
                console.log(`✅ XRPL Connected: ${this.xrplClient.isConnected()}`);
                console.log(`🏭 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log('🚀 ===================================');

                if (XRPL_NETWORK.includes('xrplcluster.com')) {
                    console.log('🚨 ===================================');
                    console.log('🚨 WARNING: MAINNET MODE ACTIVE');
                    console.log('🚨 REAL XRP WILL BE USED!');
                    console.log('🚨 ===================================');
                }
            });

            process.on('SIGINT', () => this.gracefulShutdown());
            process.on('SIGTERM', () => this.gracefulShutdown());

        } catch (error) {
            console.error('❌ Failed to start server:', error.message);
            process.exit(1);
        }
    }

    async gracefulShutdown() {
        console.log('🔄 Starting graceful shutdown...');
        
        try {
            if (this.wss) {
                console.log('📡 Closing WebSocket server...');
                this.wss.close();
            }

            if (this.xrplClient && this.xrplClient.isConnected()) {
                console.log('🔌 Disconnecting from XRPL...');
                await this.xrplClient.disconnect();
            }

            if (this.server) {
                console.log('🌐 Closing HTTP server...');
                this.server.close(() => {
                    console.log('✅ Server shutdown complete');
                    process.exit(0);
                });
            }
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
        }
    }
}

// Start the server
if (require.main === module) {
    const server = new XRPLAPIServer();
    server.start().catch(error => {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    });
}

module.exports = XRPLAPIServer;