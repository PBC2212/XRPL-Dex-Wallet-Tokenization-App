/**
 * XRPL Trustline Manager
 * Production-ready trustline creation and management for IOU tokens
 */

const xrpl = require('xrpl');
const XRPL_CONFIG = require('../../config/xrpl-config');
const XRPLValidators = require('../utils/validators');
const { getXRPLClient } = require('../utils/xrpl-client');
require('dotenv').config();

class TrustlineManager {
    constructor() {
        this.client = getXRPLClient();
        this.trustlineCache = new Map(); // Cache trustline status
    }

    /**
     * Create a trustline to an IOU token
     * @param {Object} trustlineData - Trustline parameters
     * @param {xrpl.Wallet} userWallet - User wallet creating the trustline
     * @returns {Promise<Object>} Trustline creation result
     */
    async createTrustline(trustlineData, userWallet) {
        try {
            console.log('🤝 Creating trustline...');

            // Validate trustline data
            const validation = await this.validateTrustlineData(trustlineData);
            if (!validation.isValid) {
                throw new Error(`Trustline validation failed: ${validation.errors.join(', ')}`);
            }

            const { currencyCode, issuerAddress, limitAmount } = validation.validated;

            // Check if trustline already exists
            const existingTrustline = await this.getTrustline(
                userWallet.classicAddress,
                currencyCode,
                issuerAddress
            );

            if (existingTrustline) {
                throw new Error(`Trustline already exists for ${currencyCode} from ${issuerAddress}`);
            }

            // Check user account has sufficient XRP reserves
            await this.validateAccountReserves(userWallet.classicAddress);

            // Prepare TrustSet transaction
            const trustSet = {
                TransactionType: 'TrustSet',
                Account: userWallet.classicAddress,
                LimitAmount: {
                    currency: currencyCode,
                    issuer: issuerAddress,
                    value: limitAmount
                },
                Flags: trustlineData.flags || 0,
                QualityIn: trustlineData.qualityIn || undefined,
                QualityOut: trustlineData.qualityOut || undefined,
                Memos: trustlineData.memo ? [this.createMemoObject(trustlineData.memo)] : undefined
            };

            console.log(`   Currency: ${currencyCode}`);
            console.log(`   Issuer: ${issuerAddress}`);
            console.log(`   Limit: ${limitAmount}`);

            // Submit transaction
            const result = await this.client.submitAndWait(trustSet, userWallet);

            // Update cache
            const trustlineKey = this.getTrustlineKey(userWallet.classicAddress, currencyCode, issuerAddress);
            this.trustlineCache.set(trustlineKey, {
                exists: true,
                limit: limitAmount,
                balance: '0',
                createdAt: new Date().toISOString(),
                transactionHash: result.result.hash
            });

            console.log('✅ Trustline created successfully');
            console.log(`   TX Hash: ${result.result.hash}`);

            return {
                success: true,
                transactionHash: result.result.hash,
                trustline: {
                    account: userWallet.classicAddress,
                    currency: currencyCode,
                    issuer: issuerAddress,
                    limit: limitAmount,
                    balance: '0'
                }
            };

        } catch (error) {
            console.error('❌ Trustline creation failed:', error.message);
            throw new Error(`Trustline creation failed: ${error.message}`);
        }
    }

    /**
     * Modify an existing trustline
     * @param {Object} modifyData - Modification parameters
     * @param {xrpl.Wallet} userWallet - User wallet
     * @returns {Promise<Object>} Modification result
     */
    async modifyTrustline(modifyData, userWallet) {
        try {
            console.log('📝 Modifying trustline...');

            const { currencyCode, issuerAddress, newLimit } = modifyData;

            // Validate new limit
            const limitValidation = XRPLValidators.validateTrustlineLimit(newLimit);
            if (!limitValidation.isValid) {
                throw new Error(`Invalid limit: ${limitValidation.error}`);
            }

            // Check trustline exists
            const existingTrustline = await this.getTrustline(
                userWallet.classicAddress,
                currencyCode,
                issuerAddress
            );

            if (!existingTrustline) {
                throw new Error(`Trustline does not exist for ${currencyCode} from ${issuerAddress}`);
            }

            // Check if new limit would be below current balance
            const currentBalance = parseFloat(existingTrustline.balance || '0');
            const newLimitAmount = parseFloat(newLimit);

            if (newLimitAmount < currentBalance) {
                throw new Error(`New limit (${newLimit}) cannot be below current balance (${currentBalance})`);
            }

            // Prepare TrustSet transaction for modification
            const trustSet = {
                TransactionType: 'TrustSet',
                Account: userWallet.classicAddress,
                LimitAmount: {
                    currency: currencyCode,
                    issuer: issuerAddress,
                    value: limitValidation.limit
                },
                Flags: modifyData.flags || 0
            };

            const result = await this.client.submitAndWait(trustSet, userWallet);

            // Update cache
            const trustlineKey = this.getTrustlineKey(userWallet.classicAddress, currencyCode, issuerAddress);
            const cached = this.trustlineCache.get(trustlineKey);
            if (cached) {
                cached.limit = limitValidation.limit;
                cached.modifiedAt = new Date().toISOString();
                this.trustlineCache.set(trustlineKey, cached);
            }

            console.log('✅ Trustline modified successfully');
            console.log(`   New Limit: ${limitValidation.limit}`);

            return {
                success: true,
                transactionHash: result.result.hash,
                oldLimit: existingTrustline.limit,
                newLimit: limitValidation.limit
            };

        } catch (error) {
            console.error('❌ Trustline modification failed:', error.message);
            throw error;
        }
    }

    /**
     * Remove/delete a trustline (set limit to 0)
     * @param {Object} removeData - Removal parameters
     * @param {xrpl.Wallet} userWallet - User wallet
     * @returns {Promise<Object>} Removal result
     */
    async removeTrustline(removeData, userWallet) {
        try {
            console.log('🗑️ Removing trustline...');

            const { currencyCode, issuerAddress } = removeData;

            // Check trustline exists
            const existingTrustline = await this.getTrustline(
                userWallet.classicAddress,
                currencyCode,
                issuerAddress
            );

            if (!existingTrustline) {
                throw new Error(`Trustline does not exist for ${currencyCode} from ${issuerAddress}`);
            }

            // Check balance is zero
            const currentBalance = parseFloat(existingTrustline.balance || '0');
            if (currentBalance !== 0) {
                throw new Error(`Cannot remove trustline with non-zero balance (${currentBalance}). Send tokens back to issuer first.`);
            }

            // Prepare TrustSet transaction with limit 0 to remove
            const trustSet = {
                TransactionType: 'TrustSet',
                Account: userWallet.classicAddress,
                LimitAmount: {
                    currency: currencyCode,
                    issuer: issuerAddress,
                    value: '0'
                }
            };

            const result = await this.client.submitAndWait(trustSet, userWallet);

            // Update cache
            const trustlineKey = this.getTrustlineKey(userWallet.classicAddress, currencyCode, issuerAddress);
            this.trustlineCache.delete(trustlineKey);

            console.log('✅ Trustline removed successfully');

            return {
                success: true,
                transactionHash: result.result.hash,
                removedTrustline: {
                    currency: currencyCode,
                    issuer: issuerAddress
                }
            };

        } catch (error) {
            console.error('❌ Trustline removal failed:', error.message);
            throw error;
        }
    }

    /**
     * Get specific trustline information
     * @param {string} accountAddress - Account address
     * @param {string} currencyCode - Currency code
     * @param {string} issuerAddress - Issuer address
     * @returns {Promise<Object|null>} Trustline information
     */
    async getTrustline(accountAddress, currencyCode, issuerAddress) {
        try {
            // Check cache first
            const trustlineKey = this.getTrustlineKey(accountAddress, currencyCode, issuerAddress);
            const cached = this.trustlineCache.get(trustlineKey);
            
            if (cached && this.isCacheValid(cached)) {
                return cached.exists ? {
                    currency: currencyCode,
                    account: issuerAddress,
                    balance: cached.balance,
                    limit: cached.limit
                } : null;
            }

            // Fetch from network
            const trustlines = await this.client.getTrustlines(accountAddress);
            
            const trustline = trustlines.find(line => 
                line.currency === currencyCode && 
                line.account === issuerAddress
            );

            // Update cache
            this.trustlineCache.set(trustlineKey, {
                exists: !!trustline,
                limit: trustline?.limit || '0',
                balance: trustline?.balance || '0',
                fetchedAt: new Date().toISOString()
            });

            return trustline || null;

        } catch (error) {
            console.error('Failed to get trustline:', error.message);
            return null;
        }
    }

    /**
     * Get all trustlines for an account
     * @param {string} accountAddress - Account address
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of trustlines
     */
    async getAllTrustlines(accountAddress, options = {}) {
        try {
            console.log(`📋 Getting trustlines for ${accountAddress}...`);

            const trustlines = await this.client.getTrustlines(accountAddress);

            // Filter by currency if specified
            let filteredTrustlines = trustlines;
            if (options.currency) {
                filteredTrustlines = trustlines.filter(line => 
                    line.currency === options.currency.toUpperCase()
                );
            }

            // Filter by issuer if specified
            if (options.issuer) {
                filteredTrustlines = filteredTrustlines.filter(line => 
                    line.account === options.issuer
                );
            }

            // Add additional information
            const enrichedTrustlines = filteredTrustlines.map(line => ({
                ...line,
                hasBalance: parseFloat(line.balance || '0') > 0,
                utilizationRatio: this.calculateUtilization(line.balance, line.limit),
                status: this.getTrustlineStatus(line)
            }));

            console.log(`✅ Found ${enrichedTrustlines.length} trustlines`);

            return {
                success: true,
                trustlines: enrichedTrustlines,
                totalCount: enrichedTrustlines.length,
                totalWithBalance: enrichedTrustlines.filter(t => t.hasBalance).length
            };

        } catch (error) {
            console.error('❌ Failed to get trustlines:', error.message);
            throw error;
        }
    }

    /**
     * Check if account can create a new trustline (reserve requirements)
     * @param {string} accountAddress - Account address
     * @returns {Promise<Object>} Capability check result
     */
    async checkTrustlineCapability(accountAddress) {
        try {
            const accountInfo = await this.client.getAccountInfo(accountAddress);
            const currentTrustlines = await this.client.getTrustlines(accountAddress);
            
            // Calculate current reserves
            const balance = parseFloat(xrpl.dropsToXrp(accountInfo.Balance));
            const baseReserve = parseFloat(xrpl.dropsToXrp(
                process.env.XRPL_ACCOUNT_RESERVE || XRPL_CONFIG.RESERVES.ACCOUNT_RESERVE
            ));
            const objectReserve = parseFloat(xrpl.dropsToXrp(
                process.env.XRPL_OBJECT_RESERVE || XRPL_CONFIG.RESERVES.OBJECT_RESERVE
            ));
            
            const currentReserveRequirement = baseReserve + (currentTrustlines.length * objectReserve);
            const newReserveRequirement = baseReserve + ((currentTrustlines.length + 1) * objectReserve);
            
            const availableBalance = balance - currentReserveRequirement;
            const canCreateTrustline = balance >= newReserveRequirement;

            return {
                canCreate: canCreateTrustline,
                currentBalance: balance.toString(),
                currentTrustlines: currentTrustlines.length,
                currentReserve: currentReserveRequirement.toString(),
                newReserveRequired: newReserveRequirement.toString(),
                availableBalance: availableBalance.toString(),
                additionalXRPNeeded: canCreateTrustline ? '0' : (newReserveRequirement - balance).toString()
            };

        } catch (error) {
            console.error('Failed to check trustline capability:', error.message);
            throw error;
        }
    }

    /**
     * Validate trustline data
     * @param {Object} trustlineData - Trustline data to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateTrustlineData(trustlineData) {
        const errors = [];
        const validated = {};

        // Validate currency code
        const currencyValidation = XRPLValidators.validateCurrencyCode(trustlineData.currencyCode);
        if (!currencyValidation.isValid) {
            errors.push(`Currency: ${currencyValidation.error}`);
        } else if (currencyValidation.currencyCode === 'XRP') {
            errors.push('Currency: Cannot create trustline for XRP (native currency)');
        } else {
            validated.currencyCode = currencyValidation.currencyCode;
        }

        // Validate issuer address
        const issuerValidation = XRPLValidators.validateAddress(trustlineData.issuerAddress);
        if (!issuerValidation.isValid) {
            errors.push(`Issuer: ${issuerValidation.error}`);
        } else {
            validated.issuerAddress = issuerValidation.address;
        }

        // Validate limit amount
        const limitValidation = XRPLValidators.validateTrustlineLimit(trustlineData.limitAmount);
        if (!limitValidation.isValid) {
            errors.push(`Limit: ${limitValidation.error}`);
        } else {
            validated.limitAmount = limitValidation.limit;
        }

        // Validate flags if provided
        if (trustlineData.flags !== undefined) {
            const flagsValidation = XRPLValidators.validateTransactionFlags(trustlineData.flags, 'TrustSet');
            if (!flagsValidation.isValid) {
                errors.push(`Flags: ${flagsValidation.error}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            validated: validated
        };
    }

    /**
     * Validate account has sufficient reserves for trustline creation
     * @param {string} accountAddress - Account address
     * @returns {Promise<void>}
     */
    async validateAccountReserves(accountAddress) {
        const capability = await this.checkTrustlineCapability(accountAddress);
        
        if (!capability.canCreate) {
            const needed = capability.additionalXRPNeeded;
            throw new Error(`Insufficient XRP balance for trustline creation. Additional ${needed} XRP required.`);
        }
    }

    /**
     * Create memo object for trustline transaction
     * @param {string} data - Memo data
     * @returns {Object} Memo object
     */
    createMemoObject(data) {
        const validation = XRPLValidators.validateMemo(data);
        if (!validation.isValid) {
            throw new Error(`Invalid memo: ${validation.error}`);
        }

        return {
            Memo: {
                MemoType: Buffer.from('trustline', 'utf8').toString('hex').toUpperCase(),
                MemoData: validation.memoHex,
                MemoFormat: Buffer.from('text/plain', 'utf8').toString('hex').toUpperCase()
            }
        };
    }

    /**
     * Generate trustline cache key
     * @param {string} account - Account address
     * @param {string} currency - Currency code
     * @param {string} issuer - Issuer address
     * @returns {string} Cache key
     */
    getTrustlineKey(account, currency, issuer) {
        return `${account}:${currency}:${issuer}`;
    }

    /**
     * Check if cached data is still valid (5 minutes)
     * @param {Object} cached - Cached data
     * @returns {boolean} Is valid
     */
    isCacheValid(cached) {
        if (!cached.fetchedAt) return false;
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        return age < 300000; // 5 minutes
    }

    /**
     * Calculate trustline utilization ratio
     * @param {string} balance - Current balance
     * @param {string} limit - Trustline limit
     * @returns {number} Utilization ratio (0-1)
     */
    calculateUtilization(balance, limit) {
        const balanceNum = parseFloat(balance || '0');
        const limitNum = parseFloat(limit || '0');
        
        if (limitNum === 0) return 0;
        return Math.abs(balanceNum) / limitNum;
    }

    /**
     * Get trustline status description
     * @param {Object} trustline - Trustline data
     * @returns {string} Status description
     */
    getTrustlineStatus(trustline) {
        const balance = parseFloat(trustline.balance || '0');
        const limit = parseFloat(trustline.limit || '0');
        
        if (balance === 0) return 'empty';
        if (balance > 0) return 'holding';
        if (balance < 0) return 'owing';
        if (Math.abs(balance) >= limit * 0.9) return 'near_limit';
        
        return 'active';
    }

    /**
     * Clear trustline cache
     */
    clearCache() {
        this.trustlineCache.clear();
        console.log('🧹 Trustline cache cleared');
    }

    /**
     * Get trustline statistics for an account
     * @param {string} accountAddress - Account address
     * @returns {Promise<Object>} Statistics
     */
    async getTrustlineStats(accountAddress) {
        try {
            const result = await this.getAllTrustlines(accountAddress);
            const trustlines = result.trustlines;

            const stats = {
                total: trustlines.length,
                withBalance: trustlines.filter(t => t.hasBalance).length,
                empty: trustlines.filter(t => !t.hasBalance).length,
                currencies: [...new Set(trustlines.map(t => t.currency))].length,
                issuers: [...new Set(trustlines.map(t => t.account))].length,
                avgUtilization: trustlines.length > 0 
                    ? trustlines.reduce((sum, t) => sum + t.utilizationRatio, 0) / trustlines.length 
                    : 0
            };

            return stats;
        } catch (error) {
            console.error('Failed to get trustline stats:', error.message);
            throw error;
        }
    }
}

module.exports = TrustlineManager;