const { Client, Wallet, xrpToDrops, dropsToXrp } = require('xrpl');
const { AppError, logError } = require('../middleware/errorHandler');

class XRPLService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.connectionPromise = null;
    }

    /**
     * Initialize and connect to XRPL
     */
    async initialize() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._connect();
        return this.connectionPromise;
    }

    /**
     * Private method to handle connection logic
     */
    async _connect() {
        try {
            const serverUrl = process.env.XRPL_WEBSOCKET_URL || 'wss://s.altnet.rippletest.net:51233';
            
            console.log(`[XRPL] Connecting to: ${serverUrl}`);
            
            this.client = new Client(serverUrl);
            
            // Set up event listeners
            this.client.on('connected', () => {
                console.log('[XRPL] Connected successfully');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
            });

            this.client.on('disconnected', (code) => {
                console.log(`[XRPL] Disconnected with code: ${code}`);
                this.isConnected = false;
                this._handleDisconnection();
            });

            this.client.on('error', (error) => {
                console.error('[XRPL] Connection error:', error);
                logError(error);
                this.isConnected = false;
            });

            // Connect to XRPL
            await this.client.connect();
            
            // Verify connection
            await this._verifyConnection();
            
            return this.client;
        } catch (error) {
            console.error('[XRPL] Failed to connect:', error.message);
            this.connectionPromise = null;
            throw new AppError('Failed to connect to XRPL network', 503, 'XRPL_CONNECTION_FAILED');
        }
    }

    /**
     * Verify connection is working
     */
    async _verifyConnection() {
        try {
            const serverInfo = await this.client.request({
                command: 'server_info'
            });
            
            console.log(`[XRPL] Connected to ${serverInfo.result.info.network_ledger || 'unknown'} network`);
            console.log(`[XRPL] Server version: ${serverInfo.result.info.build_version}`);
            console.log(`[XRPL] Ledger index: ${serverInfo.result.info.validated_ledger.seq}`);
            
            return true;
        } catch (error) {
            throw new AppError('Failed to verify XRPL connection', 503, 'XRPL_VERIFICATION_FAILED');
        }
    }

    /**
     * Handle disconnection and attempt reconnection
     */
    async _handleDisconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[XRPL] Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

        console.log(`[XRPL] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(async () => {
            try {
                this.connectionPromise = null;
                await this.initialize();
            } catch (error) {
                console.error('[XRPL] Reconnection failed:', error.message);
            }
        }, delay);
    }

    /**
     * Ensure client is connected before operations
     */
    async _ensureConnected() {
        if (!this.client || !this.isConnected) {
            await this.initialize();
        }

        if (!this.isConnected) {
            throw new AppError('XRPL client not connected', 503, 'XRPL_NOT_CONNECTED');
        }
    }

    /**
     * Generate a new XRPL wallet
     */
    generateWallet() {
        try {
            const wallet = Wallet.generate();
            return {
                address: wallet.address,
                publicKey: wallet.publicKey,
                privateKey: wallet.privateKey,
                seed: wallet.seed
            };
        } catch (error) {
            logError(error);
            throw new AppError('Failed to generate wallet', 500, 'WALLET_GENERATION_FAILED');
        }
    }

    /**
     * Create wallet from seed
     */
    walletFromSeed(seed) {
        try {
            const wallet = Wallet.fromSeed(seed);
            return {
                address: wallet.address,
                publicKey: wallet.publicKey,
                privateKey: wallet.privateKey,
                seed: wallet.seed
            };
        } catch (error) {
            logError(error);
            throw new AppError('Invalid seed or failed to create wallet', 400, 'INVALID_SEED');
        }
    }

    /**
     * Get account information
     */
    async getAccountInfo(address) {
        await this._ensureConnected();

        try {
            const accountInfo = await this.client.request({
                command: 'account_info',
                account: address,
                ledger_index: 'validated'
            });

            return {
                address: accountInfo.result.account_data.Account,
                balance: dropsToXrp(accountInfo.result.account_data.Balance),
                sequence: accountInfo.result.account_data.Sequence,
                ownerCount: accountInfo.result.account_data.OwnerCount,
                reserve: dropsToXrp(accountInfo.result.account_data.Reserve || '0'),
                flags: accountInfo.result.account_data.Flags,
                previousTxnID: accountInfo.result.account_data.PreviousTxnID,
                ledgerCurrentIndex: accountInfo.result.ledger_current_index
            };
        } catch (error) {
            if (error.data && error.data.error === 'actNotFound') {
                throw new AppError('Account not found or not activated', 404, 'ACCOUNT_NOT_FOUND');
            }
            logError(error);
            throw new AppError('Failed to get account information', 500, 'ACCOUNT_INFO_FAILED');
        }
    }

    /**
     * Get account balance
     */
    async getBalance(address) {
        const accountInfo = await this.getAccountInfo(address);
        return parseFloat(accountInfo.balance);
    }

    /**
     * Get account trustlines (for tokens)
     */
    async getTrustlines(address) {
        await this._ensureConnected();

        try {
            const response = await this.client.request({
                command: 'account_lines',
                account: address,
                ledger_index: 'validated'
            });

            return response.result.lines.map(line => ({
                currency: line.currency,
                issuer: line.account,
                balance: parseFloat(line.balance),
                limit: parseFloat(line.limit),
                limitPeer: parseFloat(line.limit_peer || '0'),
                quality: line.quality || 0,
                flags: line.flags || 0
            }));
        } catch (error) {
            logError(error);
            throw new AppError('Failed to get trustlines', 500, 'TRUSTLINES_FAILED');
        }
    }

    /**
     * Submit and verify transaction
     */
    async submitTransaction(wallet, transaction) {
        await this._ensureConnected();

        try {
            // Auto-fill transaction
            const prepared = await this.client.autofill(transaction);
            
            // Sign transaction
            const signed = wallet.sign(prepared);
            
            // Submit transaction
            const result = await this.client.submitAndWait(signed.tx_blob);
            
            // Check if transaction was successful
            if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
                throw new AppError(
                    `Transaction failed: ${result.result.meta.TransactionResult}`,
                    400,
                    'TRANSACTION_FAILED'
                );
            }

            return {
                hash: result.result.hash,
                ledgerIndex: result.result.ledger_index,
                transactionResult: result.result.meta.TransactionResult,
                fee: dropsToXrp(prepared.Fee),
                sequence: prepared.Sequence,
                meta: result.result.meta
            };
        } catch (error) {
            logError(error);
            
            // Handle specific XRPL errors
            if (error.message.includes('insufficient funds')) {
                throw new AppError('Insufficient funds for transaction', 400, 'INSUFFICIENT_FUNDS');
            }
            
            if (error.message.includes('sequence')) {
                throw new AppError('Invalid sequence number', 400, 'INVALID_SEQUENCE');
            }
            
            throw new AppError(
                error.message || 'Transaction submission failed',
                400,
                'TRANSACTION_SUBMISSION_FAILED'
            );
        }
    }

    /**
     * Get transaction history for an account
     */
    async getTransactionHistory(address, limit = 20) {
        await this._ensureConnected();

        try {
            const response = await this.client.request({
                command: 'account_tx',
                account: address,
                limit: limit,
                ledger_index_min: -1,
                ledger_index_max: -1
            });

            return response.result.transactions.map(tx => ({
                hash: tx.tx.hash,
                ledgerIndex: tx.tx.ledger_index,
                date: new Date((tx.tx.date + 946684800) * 1000), // Convert Ripple timestamp
                type: tx.tx.TransactionType,
                fee: dropsToXrp(tx.tx.Fee),
                sequence: tx.tx.Sequence,
                account: tx.tx.Account,
                destination: tx.tx.Destination,
                amount: tx.tx.Amount,
                meta: tx.meta
            }));
        } catch (error) {
            logError(error);
            throw new AppError('Failed to get transaction history', 500, 'TRANSACTION_HISTORY_FAILED');
        }
    }

    /**
     * Get current network fee
     */
    async getCurrentFee() {
        await this._ensureConnected();

        try {
            const feeResponse = await this.client.request({
                command: 'fee'
            });

            return {
                baseFee: dropsToXrp(feeResponse.result.drops.base_fee),
                medianFee: dropsToXrp(feeResponse.result.drops.median_fee),
                minimumFee: dropsToXrp(feeResponse.result.drops.minimum_fee),
                openLedgerFee: dropsToXrp(feeResponse.result.drops.open_ledger_fee)
            };
        } catch (error) {
            logError(error);
            throw new AppError('Failed to get network fee', 500, 'FEE_REQUEST_FAILED');
        }
    }

    /**
     * Get server info and health
     */
    async getServerInfo() {
        await this._ensureConnected();

        try {
            const response = await this.client.request({
                command: 'server_info'
            });

            return {
                networkLedger: response.result.info.network_ledger,
                buildVersion: response.result.info.build_version,
                completeLedgers: response.result.info.complete_ledgers,
                validatedLedger: response.result.info.validated_ledger,
                reserveBase: dropsToXrp(response.result.info.validated_ledger.reserve_base_xrp),
                reserveInc: dropsToXrp(response.result.info.validated_ledger.reserve_inc_xrp)
            };
        } catch (error) {
            logError(error);
            throw new AppError('Failed to get server info', 500, 'SERVER_INFO_FAILED');
        }
    }

    /**
     * Gracefully disconnect from XRPL
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            console.log('[XRPL] Disconnecting...');
            await this.client.disconnect();
            this.isConnected = false;
            this.client = null;
            this.connectionPromise = null;
        }
    }
}

// Create singleton instance
const xrplService = new XRPLService();

module.exports = xrplService; 
