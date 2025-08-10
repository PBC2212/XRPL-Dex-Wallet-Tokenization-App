/**
 * Basic HTTP Server for Render Deployment
 * Minimal dependencies to avoid routing issues
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

class BasicServer {
    constructor() {
        this.port = process.env.PORT || process.env.API_PORT || 10000;
        this.server = null;
    }

    // Simple CORS headers
    setCORSHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    // Send JSON response
    sendJSON(res, statusCode, data) {
        this.setCORSHeaders(res);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    // Send file
    sendFile(res, filePath, contentType = 'text/html') {
        try {
            if (fs.existsSync(filePath)) {
                this.setCORSHeaders(res);
                const content = fs.readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } else {
                this.sendJSON(res, 404, { error: 'File not found', path: filePath });
            }
        } catch (error) {
            this.sendJSON(res, 500, { error: 'Server error', message: error.message });
        }
    }

    // Parse request body
    parseBody(req, callback) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const parsed = body ? JSON.parse(body) : {};
                callback(null, parsed);
            } catch (error) {
                callback(error, null);
            }
        });
    }

    // Handle requests
    handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const method = req.method;
        const pathname = parsedUrl.pathname;

        console.log(`${method} ${pathname}`);

        // Handle OPTIONS requests
        if (method === 'OPTIONS') {
            this.setCORSHeaders(res);
            res.writeHead(200);
            res.end();
            return;
        }

        // API Routes
        if (pathname === '/health') {
            this.sendJSON(res, 200, {
                status: 'OK',
                service: 'XRPL Tokenization Platform',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                network: process.env.XRPL_NETWORK || 'TESTNET',
                uptime: process.uptime(),
                port: this.port,
                environment: process.env.NODE_ENV || 'production'
            });
            return;
        }

        if (pathname === '/api/status') {
            this.sendJSON(res, 200, {
                success: true,
                message: 'API is running',
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (pathname === '/api/wallets' && method === 'POST') {
            this.parseBody(req, (err, body) => {
                if (err) {
                    this.sendJSON(res, 400, { success: false, error: 'Invalid JSON' });
                    return;
                }

                const mockWallet = {
                    id: `wallet_${Date.now()}`,
                    address: `r${Math.random().toString(36).substr(2, 25)}`,
                    publicKey: `ED${Math.random().toString(16).substr(2, 64).toUpperCase()}`,
                    network: 'TESTNET',
                    createdAt: new Date().toISOString(),
                    metadata: {
                        name: body.name || 'Generated Wallet',
                        description: body.description || ''
                    }
                };

                this.sendJSON(res, 200, {
                    success: true,
                    data: {
                        ...mockWallet,
                        seed: `s${Math.random().toString(36).substr(2, 28)}`
                    },
                    message: 'Wallet generated successfully (demo mode)'
                });
            });
            return;
        }

        if (pathname === '/api/wallets/import' && method === 'POST') {
            this.parseBody(req, (err, body) => {
                if (err) {
                    this.sendJSON(res, 400, { success: false, error: 'Invalid JSON' });
                    return;
                }

                if (!body.seed) {
                    this.sendJSON(res, 400, {
                        success: false,
                        error: 'Seed phrase is required',
                        message: 'Missing required field'
                    });
                    return;
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

                this.sendJSON(res, 200, {
                    success: true,
                    data: mockWallet,
                    message: 'Wallet imported successfully (demo mode)'
                });
            });
            return;
        }

        if (pathname.startsWith('/api/wallets/') && pathname.endsWith('/balance') && method === 'GET') {
            const address = pathname.split('/')[3];
            this.sendJSON(res, 200, {
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
            return;
        }

        if (pathname === '/api/tokens' && method === 'POST') {
            this.parseBody(req, (err, body) => {
                if (err) {
                    this.sendJSON(res, 400, { success: false, error: 'Invalid JSON' });
                    return;
                }

                const mockToken = {
                    tokenId: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    currencyCode: body.tokenCode?.toUpperCase() || 'DEMO',
                    issuer: `r${Math.random().toString(36).substr(2, 25)}`,
                    name: body.name || 'Demo Token',
                    symbol: body.symbol || body.tokenCode || 'DEMO',
                    description: body.description || '',
                    decimals: parseInt(body.decimals) || 6,
                    totalSupply: parseInt(body.totalSupply) || 1000,
                    createdAt: new Date().toISOString(),
                    network: 'TESTNET',
                    status: 'CREATED'
                };

                this.sendJSON(res, 200, {
                    success: true,
                    tokenId: mockToken.tokenId,
                    tokenInfo: mockToken,
                    message: 'Token created successfully (demo mode)'
                });
            });
            return;
        }

        if (pathname === '/api/tokens' && method === 'GET') {
            this.sendJSON(res, 200, {
                success: true,
                data: {
                    tokens: [],
                    count: 0
                },
                message: 'Tokens retrieved successfully (demo mode)'
            });
            return;
        }

        if (pathname === '/api/network/info' && method === 'GET') {
            this.sendJSON(res, 200, {
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
            return;
        }

        if (pathname.startsWith('/api/dashboard/') && method === 'GET') {
            const address = pathname.split('/')[3];
            this.sendJSON(res, 200, {
                success: true,
                data: {
                    balance: {
                        xrpBalance: (Math.random() * 1000).toFixed(6),
                        accountData: null
                    },
                    trustlines: [],
                    recentTransactions: [],
                    userTokens: [],
                    stats: {
                        totalBalance: parseFloat((Math.random() * 1000).toFixed(6)),
                        activeTokens: 0,
                        totalTransactions: 0,
                        portfolioValue: 0,
                        createdTokens: 0
                    }
                },
                message: 'Dashboard data retrieved (demo mode)'
            });
            return;
        }

        if (pathname.startsWith('/api/transactions/') && method === 'GET') {
            this.sendJSON(res, 200, {
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
            return;
        }

        if (pathname.startsWith('/api/trustlines/') && method === 'GET') {
            this.sendJSON(res, 200, {
                success: true,
                data: {
                    trustlines: [],
                    totalCount: 0
                },
                message: 'Trustlines retrieved (demo mode)'
            });
            return;
        }

        // Serve frontend files
        const frontendBuildPath = path.join(__dirname, '../frontend/build');
        
        // Serve static files
        if (pathname.startsWith('/static/')) {
            const staticPath = path.join(frontendBuildPath, pathname);
            if (fs.existsSync(staticPath)) {
                let contentType = 'text/plain';
                if (pathname.endsWith('.js')) contentType = 'application/javascript';
                else if (pathname.endsWith('.css')) contentType = 'text/css';
                else if (pathname.endsWith('.html')) contentType = 'text/html';
                else if (pathname.endsWith('.png')) contentType = 'image/png';
                else if (pathname.endsWith('.jpg')) contentType = 'image/jpeg';
                else if (pathname.endsWith('.ico')) contentType = 'image/x-icon';

                this.sendFile(res, staticPath, contentType);
                return;
            }
        }

        // Serve index.html for all other routes (React routing)
        const indexPath = path.join(frontendBuildPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            this.sendFile(res, indexPath, 'text/html');
        } else {
            this.sendJSON(res, 404, {
                error: 'Frontend not found',
                message: 'The frontend application is not available',
                buildPath: frontendBuildPath,
                indexPath: indexPath,
                timestamp: new Date().toISOString()
            });
        }
    }

    start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`🚀 Basic server started successfully!`);
            console.log(`📊 Port: ${this.port}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
            console.log(`🔗 Health check: http://localhost:${this.port}/health`);
            console.log(`✅ Server is ready to receive requests`);
        });

        this.server.on('error', (error) => {
            console.error('❌ Server error:', error);
        });
    }
}

// Start the server
const server = new BasicServer();
server.start();

module.exports = BasicServer;