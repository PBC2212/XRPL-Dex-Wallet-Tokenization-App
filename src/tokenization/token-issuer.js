/**
 * XRPL Token Issuer
 * Production-ready IOU token creation and management on XRPL
 */

const xrpl = require('xrpl');
const crypto = require('crypto');
const XRPL_CONFIG = require('../../config/xrpl-config');
const XRPLValidators = require('../utils/validators');
const { getXRPLClient } = require('../utils/xrpl-client');
require('dotenv').config();

class TokenIssuer {
    constructor() {
        this.issuedTokens = new Map(); // Track issued tokens
        this.client = getXRPLClient();
    }

    /**
     * Create and issue a new IOU token on XRPL
     * @param {Object} tokenData - Token creation parameters
     * @param {xrpl.Wallet} issuerWallet - Issuer wallet
     * @returns {Promise<Object>} Token creation result
     */
    async createToken(tokenData, issuerWallet) {
        try {
            console.log('🪙 Creating new IOU token on XRPL...');

            // Validate token data
            const validation = XRPLValidators.validateTokenData(tokenData);
            if (!validation.isValid) {
                throw new Error(`Token validation failed: ${validation.errors.join(', ')}`);
            }

            const validated = validation.validated;

            // Check issuer account exists and has sufficient reserves
            await this.validateIssuerAccount(issuerWallet.classicAddress);

            // Prepare token metadata
            const tokenMetadata = {
                tokenId: this.generateTokenId(),
                currencyCode: validated.currencyCode,
                issuer: issuerWallet.classicAddress,
                name: tokenData.name || `Token ${validated.currencyCode}`,
                symbol: tokenData.symbol || validated.currencyCode,
                decimals: tokenData.decimals || parseInt(process.env.DEFAULT_TOKEN_DECIMALS) || XRPL_CONFIG.TOKEN.DEFAULT_PRECISION,
                totalSupply: tokenData.totalSupply || '0',
                description: tokenData.description || '',
                metadata: validated.metadata || {},
                ipfsHash: validated.ipfsHash || null,
                createdAt: new Date().toISOString(),
                network: this.client.getNetworkType()
            };

            // Set up issuer account settings (if not already configured)
            await this.configureIssuerAccount(issuerWallet, tokenData.settings || {});

            // Create memo with token metadata
            const memo = await this.createTokenMemo(tokenMetadata);

            // Store token information
            this.issuedTokens.set(tokenMetadata.tokenId, tokenMetadata);

            console.log('✅ Token created successfully');
            console.log(`   Token ID: ${tokenMetadata.tokenId}`);
            console.log(`   Currency: ${tokenMetadata.currencyCode}`);
            console.log(`   Issuer: ${tokenMetadata.issuer}`);

            return {
                success: true,
                tokenId: tokenMetadata.tokenId,
                tokenInfo: tokenMetadata,
                memo: memo
            };

        } catch (error) {
            console.error('❌ Token creation failed:', error.message);
            throw new Error(`Token creation failed: ${error.message}`);
        }
    }

    /**
     * Issue tokens to a specific account (requires existing trustline)
     * @param {string} tokenId - Token ID
     * @param {string} destinationAddress - Recipient address
     * @param {string} amount - Amount to issue
     * @param {xrpl.Wallet} issuerWallet - Issuer wallet
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Issuance result
     */
    async issueTokens(tokenId, destinationAddress, amount, issuerWallet, options = {}) {
        try {
            console.log(`💸 Issuing tokens: ${amount} ${tokenId}`);

            // Get token information
            const tokenInfo = this.issuedTokens.get(tokenId);
            if (!tokenInfo) {
                throw new Error('Token not found');
            }

            // Validate destination address
            const addressValidation = XRPLValidators.validateAddress(destinationAddress);
            if (!addressValidation.isValid) {
                throw new Error(`Invalid destination address: ${addressValidation.error}`);
            }

            // Validate amount
            const amountValidation = XRPLValidators.validateAmount(amount, 'IOU');
            if (!amountValidation.isValid) {
                throw new Error(`Invalid amount: ${amountValidation.error}`);
            }

            // Check if trustline exists
            const trustlineExists = await this.checkTrustlineExists(
                destinationAddress,
                tokenInfo.currencyCode,
                issuerWallet.classicAddress
            );

            if (!trustlineExists) {
                throw new Error(`No trustline found for ${destinationAddress} to ${tokenInfo.currencyCode}`);
            }

            // Prepare payment transaction
            const payment = {
                TransactionType: 'Payment',
                Account: issuerWallet.classicAddress,
                Destination: destinationAddress,
                Amount: {
                    currency: tokenInfo.currencyCode,
                    value: amountValidation.amount,
                    issuer: issuerWallet.classicAddress
                },
                DestinationTag: options.destinationTag || undefined,
                Memos: options.memo ? [this.createMemoObject(options.memo)] : undefined
            };

            // Submit transaction
            const result = await this.client.submitAndWait(payment, issuerWallet);

            // Update token supply tracking
            this.updateTokenSupply(tokenId, amount, 'issued');

            console.log('✅ Tokens issued successfully');
            console.log(`   Amount: ${amount} ${tokenInfo.currencyCode}`);
            console.log(`   To: ${destinationAddress}`);
            console.log(`   TX Hash: ${result.result.hash}`);

            return {
                success: true,
                transactionHash: result.result.hash,
                amount: amount,
                currency: tokenInfo.currencyCode,
                destination: destinationAddress,
                issuer: issuerWallet.classicAddress
            };

        } catch (error) {
            console.error('❌ Token issuance failed:', error.message);
            throw new Error(`Token issuance failed: ${error.message}`);
        }
    }

    /**
     * Configure issuer account settings for token management
     * @param {xrpl.Wallet} issuerWallet - Issuer wallet
     * @param {Object} settings - Account settings
     * @returns {Promise<Object>} Configuration result
     */
    async configureIssuerAccount(issuerWallet, settings = {}) {
        try {
            console.log('⚙️ Configuring issuer account settings...');

            const transactions = [];

            // Set Default Ripple flag if specified
            if (settings.defaultRipple !== undefined) {
                const accountSet = {
                    TransactionType: 'AccountSet',
                    Account: issuerWallet.classicAddress,
                    SetFlag: settings.defaultRipple ? xrpl.AccountSetAsfFlags.asfDefaultRipple : undefined,
                    ClearFlag: !settings.defaultRipple ? xrpl.AccountSetAsfFlags.asfDefaultRipple : undefined
                };
                transactions.push(accountSet);
            }

            // Set Require Auth flag if specified
            if (settings.requireAuth !== undefined) {
                const accountSet = {
                    TransactionType: 'AccountSet',
                    Account: issuerWallet.classicAddress,
                    SetFlag: settings.requireAuth ? xrpl.AccountSetAsfFlags.asfRequireAuth : undefined,
                    ClearFlag: !settings.requireAuth ? xrpl.AccountSetAsfFlags.asfRequireAuth : undefined
                };
                transactions.push(accountSet);
            }

            // Set Transfer Rate if specified (for token transaction fees)
            if (settings.transferRate !== undefined) {
                const accountSet = {
                    TransactionType: 'AccountSet',
                    Account: issuerWallet.classicAddress,
                    TransferRate: settings.transferRate
                };
                transactions.push(accountSet);
            }

            // Set Domain if specified
            if (settings.domain) {
                const domain = Buffer.from(settings.domain, 'utf8').toString('hex').toUpperCase();
                const accountSet = {
                    TransactionType: 'AccountSet',
                    Account: issuerWallet.classicAddress,
                    Domain: domain
                };
                transactions.push(accountSet);
            }

            // Submit configuration transactions
            const results = [];
            for (const tx of transactions) {
                const result = await this.client.submitAndWait(tx, issuerWallet);
                results.push(result.result.hash);
                console.log(`✅ Account setting applied: ${result.result.hash}`);
            }

            return {
                success: true,
                transactionHashes: results,
                settingsApplied: Object.keys(settings).length
            };

        } catch (error) {
            console.error('❌ Account configuration failed:', error.message);
            throw new Error(`Account configuration failed: ${error.message}`);
        }
    }

    /**
     * Create token memo with metadata
     * @param {Object} tokenMetadata - Token metadata
     * @returns {Object} Memo object
     */
    async createTokenMemo(tokenMetadata) {
        const memoData = {
            type: 'token_creation',
            tokenId: tokenMetadata.tokenId,
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            decimals: tokenMetadata.decimals,
            ipfsHash: tokenMetadata.ipfsHash,
            createdAt: tokenMetadata.createdAt
        };

        const memoString = JSON.stringify(memoData);
        const validation = XRPLValidators.validateMemo(memoString);
        
        if (!validation.isValid) {
            console.warn('Memo too large, using basic metadata');
            const basicMemo = {
                type: 'token_creation',
                tokenId: tokenMetadata.tokenId,
                symbol: tokenMetadata.symbol
            };
            return this.createMemoObject(JSON.stringify(basicMemo));
        }

        return this.createMemoObject(memoString);
    }

    /**
     * Create XRPL memo object
     * @param {string} data - Memo data
     * @param {string} type - Memo type
     * @param {string} format - Memo format
     * @returns {Object} XRPL memo object
     */
    createMemoObject(data, type = 'application/json', format = 'text/plain') {
        return {
            Memo: {
                MemoType: Buffer.from(type, 'utf8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(data, 'utf8').toString('hex').toUpperCase(),
                MemoFormat: Buffer.from(format, 'utf8').toString('hex').toUpperCase()
            }
        };
    }

    /**
     * Check if trustline exists between accounts
     * @param {string} accountAddress - Account address
     * @param {string} currencyCode - Currency code
     * @param {string} issuerAddress - Issuer address
     * @returns {Promise<boolean>} Trustline existence
     */
    async checkTrustlineExists(accountAddress, currencyCode, issuerAddress) {
        try {
            const trustlines = await this.client.getTrustlines(accountAddress);
            
            return trustlines.some(line => 
                line.currency === currencyCode && 
                line.account === issuerAddress
            );
        } catch (error) {
            console.error('Failed to check trustline:', error.message);
            return false;
        }
    }

    /**
     * Validate issuer account
     * @param {string} issuerAddress - Issuer address
     * @returns {Promise<void>}
     */
    async validateIssuerAccount(issuerAddress) {
        try {
            // Check account exists
            const accountInfo = await this.client.getAccountInfo(issuerAddress);
            
            // Check XRP balance for reserves
            const balance = parseFloat(xrpl.dropsToXrp(accountInfo.Balance));
            const requiredReserve = parseFloat(xrpl.dropsToXrp(
                process.env.XRPL_ACCOUNT_RESERVE || XRPL_CONFIG.RESERVES.ACCOUNT_RESERVE
            ));

            if (balance < requiredReserve) {
                throw new Error(`Insufficient XRP balance. Required: ${requiredReserve} XRP, Available: ${balance} XRP`);
            }

            console.log(`✅ Issuer account validated - Balance: ${balance} XRP`);

        } catch (error) {
            if (error.message.includes('Account not found')) {
                throw new Error('Issuer account does not exist or is not activated');
            }
            throw error;
        }
    }

    /**
     * Get token information
     * @param {string} tokenId - Token ID
     * @returns {Object|null} Token information
     */
    getTokenInfo(tokenId) {
        return this.issuedTokens.get(tokenId);
    }

    /**
     * List all issued tokens
     * @returns {Array} Array of token information
     */
    listTokens() {
        return Array.from(this.issuedTokens.values());
    }

    /**
     * Update token supply tracking
     * @param {string} tokenId - Token ID
     * @param {string} amount - Amount
     * @param {string} operation - Operation type (issued, burned)
     */
    updateTokenSupply(tokenId, amount, operation) {
        const tokenInfo = this.issuedTokens.get(tokenId);
        if (tokenInfo) {
            const currentSupply = parseFloat(tokenInfo.totalSupply || '0');
            const changeAmount = parseFloat(amount);
            
            if (operation === 'issued') {
                tokenInfo.totalSupply = (currentSupply + changeAmount).toString();
            } else if (operation === 'burned') {
                tokenInfo.totalSupply = Math.max(0, currentSupply - changeAmount).toString();
            }
            
            tokenInfo.lastUpdated = new Date().toISOString();
            this.issuedTokens.set(tokenId, tokenInfo);
        }
    }

    /**
     * Generate unique token ID
     * @returns {string} Unique token ID
     */
    generateTokenId() {
        return `token_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Burn tokens (remove from circulation)
     * @param {string} tokenId - Token ID
     * @param {string} amount - Amount to burn
     * @param {xrpl.Wallet} holderWallet - Token holder wallet
     * @param {string} issuerAddress - Issuer address
     * @returns {Promise<Object>} Burn result
     */
    async burnTokens(tokenId, amount, holderWallet, issuerAddress) {
        try {
            console.log(`🔥 Burning tokens: ${amount} ${tokenId}`);

            const tokenInfo = this.issuedTokens.get(tokenId);
            if (!tokenInfo) {
                throw new Error('Token not found');
            }

            // Validate amount
            const amountValidation = XRPLValidators.validateAmount(amount, 'IOU');
            if (!amountValidation.isValid) {
                throw new Error(`Invalid amount: ${amountValidation.error}`);
            }

            // Send tokens back to issuer (burns them)
            const payment = {
                TransactionType: 'Payment',
                Account: holderWallet.classicAddress,
                Destination: issuerAddress,
                Amount: {
                    currency: tokenInfo.currencyCode,
                    value: amountValidation.amount,
                    issuer: issuerAddress
                }
            };

            const result = await this.client.submitAndWait(payment, holderWallet);

            // Update supply tracking
            this.updateTokenSupply(tokenId, amount, 'burned');

            console.log('✅ Tokens burned successfully');
            console.log(`   TX Hash: ${result.result.hash}`);

            return {
                success: true,
                transactionHash: result.result.hash,
                amount: amount,
                currency: tokenInfo.currencyCode
            };

        } catch (error) {
            console.error('❌ Token burning failed:', error.message);
            throw error;
        }
    }

    /**
     * Get token balance for an account
     * @param {string} accountAddress - Account address
     * @param {string} currencyCode - Currency code
     * @param {string} issuerAddress - Issuer address
     * @returns {Promise<string>} Token balance
     */
    async getTokenBalance(accountAddress, currencyCode, issuerAddress) {
        try {
            const trustlines = await this.client.getTrustlines(accountAddress);
            
            const trustline = trustlines.find(line => 
                line.currency === currencyCode && 
                line.account === issuerAddress
            );

            return trustline ? trustline.balance : '0';
        } catch (error) {
            console.error('Failed to get token balance:', error.message);
            return '0';
        }
    }
}

module.exports = TokenIssuer;