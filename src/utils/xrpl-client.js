/**
 * XRPL Client Utilities
 * Production-ready XRPL network client with connection management
 */

const xrpl = require('xrpl');
const XRPL_CONFIG = require('../../config/xrpl-config');
require('dotenv').config();

class XRPLClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.networkType = process.env.XRPL_NETWORK || XRPL_CONFIG.DEFAULT_NETWORK;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
    }

    /**
     * Get the appropriate network URL based on environment
     * @returns {string} WebSocket URL for XRPL network
     */
    getNetworkUrl() {
        switch (this.networkType.toUpperCase()) {
            case 'MAINNET':
                return process.env.XRPL_MAINNET_URL || XRPL_CONFIG.NETWORKS.MAINNET;
            case 'TESTNET':
                return process.env.XRPL_TESTNET_URL || XRPL_CONFIG.NETWORKS.TESTNET;
            case 'DEVNET':
                return process.env.XRPL_DEVNET_URL || XRPL_CONFIG.NETWORKS.DEVNET;
            default:
                console.warn(`Unknown network type: ${this.networkType}, defaulting to TESTNET`);
                return process.env.XRPL_TESTNET_URL || XRPL_CONFIG.NETWORKS.TESTNET;
        }
    }

    /**
     * Connect to XRPL network with retry logic
     * @returns {Promise<xrpl.Client>} Connected XRPL client
     */
    async connect() {
        if (this.isConnected && this.client) {
            return this.client;
        }

        const networkUrl = this.getNetworkUrl();
        console.log(`Connecting to XRPL ${this.networkType}: ${networkUrl}`);

        try {
            this.client = new xrpl.Client(networkUrl, {
                timeout: (process.env.XRPL_TRANSACTION_TIMEOUT || XRPL_CONFIG.TRANSACTION.TIMEOUT) * 1000,
                connectionTimeout: 10000,
                requestTimeout: 5000
            });

            // Set up event listeners
            this.setupEventListeners();

            await this.client.connect();
            this.isConnected = true;
            this.connectionAttempts = 0;

            console.log(`✅ Connected to XRPL ${this.networkType} successfully`);
            
            // Log network info
            const serverInfo = await this.client.request({
                command: 'server_info'
            });
            
            console.log(`📊 Network Info:`);
            console.log(`   Ledger Index: ${serverInfo.result.info.validated_ledger.seq}`);
            console.log(`   Base Reserve: ${serverInfo.result.info.validated_ledger.reserve_base_xrp} XRP`);
            console.log(`   Owner Reserve: ${serverInfo.result.info.validated_ledger.reserve_inc_xrp} XRP`);

            return this.client;

        } catch (error) {
            this.connectionAttempts++;
            console.error(`❌ Connection attempt ${this.connectionAttempts} failed:`, error.message);

            if (this.connectionAttempts < this.maxRetries) {
                console.log(`🔄 Retrying connection in 2 seconds...`);
                await this.delay(2000);
                return this.connect();
            } else {
                throw new Error(`${XRPL_CONFIG.ERRORS.NETWORK_CONNECTION}: ${error.message}`);
            }
        }
    }

    /**
     * Set up client event listeners for connection monitoring
     */
    setupEventListeners() {
        if (!this.client) return;

        this.client.on('connected', () => {
            console.log('🔗 XRPL Client connected');
            this.isConnected = true;
        });

        this.client.on('disconnected', (code) => {
            console.log('🔌 XRPL Client disconnected:', code);
            this.isConnected = false;
        });

        this.client.on('error', (error) => {
            console.error('🚨 XRPL Client error:', error);
            this.isConnected = false;
        });

        this.client.on('ledgerClosed', (ledger) => {
            if (process.env.DEBUG_MODE === 'true') {
                console.log(`📒 Ledger closed: ${ledger.ledger_index} (${ledger.ledger_hash.substring(0, 8)}...)`);
            }
        });
    }

    /**
     * Disconnect from XRPL network
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            try {
                await this.client.disconnect();
                console.log('✅ Disconnected from XRPL network');
            } catch (error) {
                console.error('❌ Error during disconnection:', error.message);
            }
        }
        this.client = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
    }

    /**
     * Get current client instance
     * @returns {xrpl.Client|null}
     */
    getClient() {
        return this.client;
    }

    /**
     * Check if client is connected
     * @returns {boolean}
     */
    isClientConnected() {
        return this.isConnected && this.client && this.client.isConnected();
    }

    /**
     * Get current network type
     * @returns {string}
     */
    getNetworkType() {
        return this.networkType;
    }

    /**
     * Submit and wait for transaction validation
     * @param {Object} transaction - Prepared transaction
     * @param {xrpl.Wallet} wallet - Wallet to sign transaction
     * @returns {Promise<Object>} Transaction result
     */
    async submitAndWait(transaction, wallet) {
        if (!this.isClientConnected()) {
            await this.connect();
        }

        try {
            console.log('📤 Submitting transaction:', transaction.TransactionType);
            
            const result = await this.client.submitAndWait(transaction, {
                wallet: wallet,
                autofill: true,
                fail_hard: true
            });

            if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
                throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
            }

            console.log('✅ Transaction validated:', result.result.hash);
            return result;

        } catch (error) {
            console.error('❌ Transaction submission failed:', error.message);
            throw error;
        }
    }

    /**
     * Get account info with error handling
     * @param {string} address - XRP address
     * @returns {Promise<Object>} Account information
     */
    async getAccountInfo(address) {
        if (!this.isClientConnected()) {
            await this.connect();
        }

        try {
            const response = await this.client.request({
                command: 'account_info',
                account: address,
                ledger_index: 'validated'
            });

            return response.result.account_data;
        } catch (error) {
            if (error.data && error.data.error === 'actNotFound') {
                throw new Error(`Account not found: ${address}`);
            }
            throw error;
        }
    }

    /**
     * Get account balance in XRP
     * @param {string} address - XRP address
     * @returns {Promise<string>} Balance in XRP
     */
    async getXRPBalance(address) {
        try {
            const accountInfo = await this.getAccountInfo(address);
            return xrpl.dropsToXrp(accountInfo.Balance);
        } catch (error) {
            throw new Error(`Failed to get XRP balance: ${error.message}`);
        }
    }

    /**
     * Get account trustlines
     * @param {string} address - XRP address
     * @returns {Promise<Array>} Array of trustlines
     */
    async getTrustlines(address) {
        if (!this.isClientConnected()) {
            await this.connect();
        }

        try {
            const response = await this.client.request({
                command: 'account_lines',
                account: address,
                ledger_index: 'validated'
            });

            return response.result.lines || [];
        } catch (error) {
            throw new Error(`Failed to get trustlines: ${error.message}`);
        }
    }

    /**
     * Utility function to add delay
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current ledger index
     * @returns {Promise<number>}
     */
    async getCurrentLedgerIndex() {
        if (!this.isClientConnected()) {
            await this.connect();
        }

        try {
            const response = await this.client.request({
                command: 'ledger_current'
            });
            return response.result.ledger_current_index;
        } catch (error) {
            throw new Error(`Failed to get current ledger: ${error.message}`);
        }
    }

    /**
     * Prepare transaction with proper fee and sequence
     * @param {Object} transaction - Base transaction object
     * @param {string} account - Account address
     * @returns {Promise<Object>} Prepared transaction
     */
    async prepareTransaction(transaction, account) {
        if (!this.isClientConnected()) {
            await this.connect();
        }

        const prepared = { ...transaction };

        // Set account if not provided
        if (!prepared.Account) {
            prepared.Account = account;
        }

        // Set fee if not provided
        if (!prepared.Fee) {
            prepared.Fee = process.env.XRPL_DEFAULT_FEE || XRPL_CONFIG.TRANSACTION.DEFAULT_FEE;
        }

        // Set LastLedgerSequence for transaction expiry
        if (!prepared.LastLedgerSequence) {
            const currentLedger = await this.getCurrentLedgerIndex();
            prepared.LastLedgerSequence = currentLedger + (XRPL_CONFIG.TRANSACTION.LAST_LEDGER_OFFSET || 75);
        }

        return prepared;
    }
}

// Singleton instance
let clientInstance = null;

/**
 * Get singleton XRPL client instance
 * @returns {XRPLClient}
 */
function getXRPLClient() {
    if (!clientInstance) {
        clientInstance = new XRPLClient();
    }
    return clientInstance;
}

/**
 * Connect to XRPL using singleton instance
 * @returns {Promise<xrpl.Client>} Connected XRPL client
 */
async function connectToXRPL() {
    const client = getXRPLClient();
    return await client.connect();
}

module.exports = {
    XRPLClient,
    getXRPLClient,
    connectToXRPL
};