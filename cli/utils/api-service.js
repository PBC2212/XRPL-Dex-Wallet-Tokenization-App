/**
 * API Service Utility for XRPL CLI
 * Handles all API communications with the backend server
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\cli\utils\api-service.js
 */

const axios = require('axios');
const chalk = require('chalk');

class ApiService {
    constructor(baseUrl = 'http://localhost:3001/api') {
        this.baseUrl = baseUrl;
        this.timeout = 30000; // 30 seconds for RWA transactions
        
        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'XRPL-RWA-CLI/1.0.0'
            }
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                console.log(`🔄 API Request: ${config.method.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                console.log(chalk.red('❌ Request Error:'), error.message);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => {
                console.log(`✅ API Response: ${response.status} ${response.statusText}`);
                return response;
            },
            (error) => {
                const errorMessage = error.response?.data?.message || error.message;
                console.log(chalk.red('❌ API Error:'), errorMessage);
                return Promise.reject(new Error(errorMessage));
            }
        );
    }

    // System Health & Status
    async getSystemHealth() {
        try {
            const response = await this.client.get('/status');
            return response.data;
        } catch (error) {
            throw new Error(`Health check failed: ${error.message}`);
        }
    }

    async getNetworkInfo() {
        try {
            const response = await this.client.get('/network/info');
            return response.data;
        } catch (error) {
            throw new Error(`Network info failed: ${error.message}`);
        }
    }

    // Wallet Management
    async createWallet(options = {}) {
        try {
            const response = await this.client.post('/wallets', {
                name: options.name,
                description: options.description
            });
            return response.data;
        } catch (error) {
            throw new Error(`Wallet creation failed: ${error.message}`);
        }
    }

    async importWallet(seed, options = {}) {
        try {
            const response = await this.client.post('/wallets/import', {
                seed: seed,
                name: options.name,
                description: options.description
            });
            return response.data;
        } catch (error) {
            throw new Error(`Wallet import failed: ${error.message}`);
        }
    }

    async getWalletBalance(address) {
        try {
            const response = await this.client.get(`/wallets/${address}/balance`);
            return response.data;
        } catch (error) {
            throw new Error(`Balance retrieval failed: ${error.message}`);
        }
    }

    async getTrustlines(address) {
        try {
            const response = await this.client.get(`/trustlines/${address}`);
            return response.data;
        } catch (error) {
            throw new Error(`Trustlines retrieval failed: ${error.message}`);
        }
    }

    async getTransactions(address, limit = 20) {
        try {
            const response = await this.client.get(`/transactions/${address}?limit=${limit}`);
            return response.data;
        } catch (error) {
            throw new Error(`Transaction history failed: ${error.message}`);
        }
    }

    async getDashboardData(address) {
        try {
            const response = await this.client.get(`/dashboard/${address}`);
            return response.data;
        } catch (error) {
            throw new Error(`Dashboard data failed: ${error.message}`);
        }
    }

    // Token Management
    async createToken(tokenData) {
        try {
            console.log('🪙 Creating token with data:', tokenData);
            const response = await this.client.post('/tokens', tokenData);
            return response.data;
        } catch (error) {
            throw new Error(`Token creation failed: ${error.message}`);
        }
    }

    async getTokens() {
        try {
            const response = await this.client.get('/tokens');
            return response.data;
        } catch (error) {
            throw new Error(`Token retrieval failed: ${error.message}`);
        }
    }

    // Investment Operations
    async getInvestmentOpportunities() {
        try {
            const response = await this.client.get('/investments/opportunities');
            return response.data;
        } catch (error) {
            throw new Error(`Investment opportunities failed: ${error.message}`);
        }
    }

    async createTrustline(trustlineData) {
        try {
            const response = await this.client.post('/investments/create-trustline', trustlineData);
            return response.data;
        } catch (error) {
            throw new Error(`Trustline creation failed: ${error.message}`);
        }
    }

    async purchaseTokens(purchaseData) {
        try {
            const response = await this.client.post('/investments/purchase', purchaseData);
            return response.data;
        } catch (error) {
            throw new Error(`Token purchase failed: ${error.message}`);
        }
    }

    async getInvestmentPortfolio(address) {
        try {
            const response = await this.client.get(`/investments/portfolio/${address}`);
            return response.data;
        } catch (error) {
            throw new Error(`Portfolio retrieval failed: ${error.message}`);
        }
    }

    // Utility Methods
    formatXRP(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '0 XRP';
        return `${num.toLocaleString(undefined, { 
            minimumFractionDigits: 6, 
            maximumFractionDigits: 6 
        })} XRP`;
    }

    formatTokenAmount(amount, currency = '') {
        const num = parseFloat(amount);
        if (isNaN(num)) return `0 ${currency}`.trim();
        return `${num.toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 6 
        })} ${currency}`.trim();
    }

    truncateAddress(address, start = 6, end = 4) {
        if (!address || address.length <= start + end) return address;
        return `${address.slice(0, start)}...${address.slice(-end)}`;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';
        
        try {
            // Handle different timestamp formats
            let date;
            if (typeof timestamp === 'number') {
                // XRPL timestamp (seconds since 2000-01-01)
                date = new Date((timestamp + 946684800) * 1000);
            } else {
                date = new Date(timestamp);
            }
            
            return date.toLocaleString();
        } catch (error) {
            return 'Invalid Date';
        }
    }

    getTransactionIcon(txType) {
        const icons = {
            'Payment': '💸',
            'TrustSet': '🤝',
            'OfferCreate': '📊',
            'OfferCancel': '❌',
            'AccountSet': '⚙️',
            'RegularKeySet': '🔑',
            'SignerListSet': '📝',
            'DepositPreauth': '🔐',
            'CheckCreate': '📄',
            'CheckCash': '💰',
            'CheckCancel': '🗑️',
            'EscrowCreate': '🔒',
            'EscrowFinish': '✅',
            'EscrowCancel': '❌',
            'PaymentChannelCreate': '🚀',
            'PaymentChannelFund': '💵',
            'PaymentChannelClaim': '💎'
        };
        return icons[txType] || '📋';
    }

    // Error handling helper
    handleApiError(error, operation = 'API operation') {
        console.log(chalk.red(`❌ ${operation} failed:`));
        
        if (error.response) {
            // Server responded with error status
            console.log(chalk.red(`   Status: ${error.response.status}`));
            console.log(chalk.red(`   Message: ${error.response.data?.message || error.message}`));
        } else if (error.request) {
            // Request was made but no response received
            console.log(chalk.red('   No response from server'));
            console.log(chalk.yellow('   Make sure the API server is running'));
        } else {
            // Error in setting up the request
            console.log(chalk.red(`   Error: ${error.message}`));
        }
        
        throw error;
    }

    // Connection test
    async testConnection() {
        try {
            const response = await this.client.get('/status');
            return {
                connected: true,
                status: response.data,
                latency: response.headers['x-response-time'] || 'Unknown'
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }

    // Update base URL
    setBaseUrl(newUrl) {
        this.baseUrl = newUrl;
        this.client.defaults.baseURL = newUrl;
        console.log(`🔄 API URL updated to: ${newUrl}`);
    }

    // Get current configuration
    getConfig() {
        return {
            baseUrl: this.baseUrl,
            timeout: this.timeout
        };
    }
}

module.exports = ApiService;