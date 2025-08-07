const xrplService = require('./xrplService');
const database = require('../config/database');
const crypto = require('crypto');

class WalletService {
    constructor() {
        // Remove in-memory storage - now using database
    }

    /**
     * Encrypt sensitive data (simple implementation - use better encryption in production)
     */
    encrypt(text) {
        // Simple base64 encoding - use proper encryption like AES in production
        return Buffer.from(text).toString('base64');
    }

    /**
     * Decrypt sensitive data
     */
    decrypt(encryptedText) {
        return Buffer.from(encryptedText, 'base64').toString();
    }

    /**
     * Generate a new XRPL wallet
     */
    async generateWallet(userId = null) {
        try {
            // Generate wallet using XRPL service
            const walletData = xrplService.generateWallet();
            
            // Encrypt sensitive data
            const encryptedPrivateKey = this.encrypt(walletData.privateKey);
            const encryptedSeed = this.encrypt(walletData.seed);

            // Insert into database (handle userId as optional)
            const result = await database.query(`
                INSERT INTO wallets (
                    address, public_key, encrypted_private_key, 
                    encrypted_seed, is_activated, balance
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, address, public_key, created_at, is_activated
            `, [walletData.address, walletData.publicKey, encryptedPrivateKey, encryptedSeed, false, 0]);

            const wallet = result.rows[0];

            return {
                id: wallet.id,
                address: wallet.address,
                publicKey: wallet.public_key,
                seed: walletData.seed, // Return seed for user backup
                createdAt: wallet.created_at,
                isActivated: wallet.is_activated
            };
        } catch (error) {
            throw new Error(`Failed to generate wallet: ${error.message}`);
        }
    }

    /**
     * Import wallet from seed
     */
    async importWallet(seed, userId = null) {
        try {
            // Validate and create wallet from seed
            const walletData = xrplService.walletFromSeed(seed);
            
            // Check if wallet already exists
            const existingWallet = await database.query(
                'SELECT id FROM wallets WHERE address = $1',
                [walletData.address]
            );
            
            if (existingWallet.rows.length > 0) {
                throw new Error('Wallet already exists');
            }

            // Try to get account info to check if activated
            let accountInfo = null;
            let isActivated = false;
            let balance = 0;
            
            try {
                accountInfo = await xrplService.getAccountInfo(walletData.address);
                isActivated = true;
                balance = parseFloat(accountInfo.balance);
            } catch (error) {
                isActivated = false;
            }

            // Encrypt sensitive data
            const encryptedPrivateKey = this.encrypt(walletData.privateKey);
            const encryptedSeed = this.encrypt(walletData.seed);

            // Insert into database (handle userId as optional)
            const result = await database.query(`
                INSERT INTO wallets (
                    address, public_key, encrypted_private_key, 
                    encrypted_seed, is_activated, balance, sequence, owner_count,
                    activated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, address, public_key, created_at, is_activated, balance
            `, [
                walletData.address, walletData.publicKey, 
                encryptedPrivateKey, encryptedSeed, isActivated, balance,
                accountInfo ? accountInfo.sequence : 0,
                accountInfo ? accountInfo.ownerCount : 0,
                isActivated ? new Date() : null
            ]);

            const wallet = result.rows[0];

            return {
                id: wallet.id,
                address: wallet.address,
                publicKey: wallet.public_key,
                createdAt: wallet.created_at,
                isActivated: wallet.is_activated,
                balance: wallet.balance
            };
        } catch (error) {
            throw new Error(`Failed to import wallet: ${error.message}`);
        }
    }

    /**
     * Get wallet by ID
     */
    async getWallet(walletId) {
        try {
            const result = await database.query(`
                SELECT id, user_id, address, public_key, is_activated, balance,
                       sequence, owner_count, created_at, updated_at, last_refreshed
                FROM wallets WHERE id = $1
            `, [walletId]);

            if (result.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            const wallet = result.rows[0];

            // Get latest account info if activated
            if (wallet.is_activated) {
                try {
                    const accountInfo = await xrplService.getAccountInfo(wallet.address);
                    const trustlines = await xrplService.getTrustlines(wallet.address);
                    
                    // Update cached data in database
                    await database.query(`
                        UPDATE wallets 
                        SET balance = $1, sequence = $2, owner_count = $3, last_refreshed = CURRENT_TIMESTAMP
                        WHERE id = $4
                    `, [accountInfo.balance, accountInfo.sequence, accountInfo.ownerCount, walletId]);
                    
                    // Update trustlines
                    await this.updateTrustlines(walletId, wallet.address, trustlines);

                    wallet.balance = parseFloat(accountInfo.balance);
                    wallet.sequence = accountInfo.sequence;
                    wallet.owner_count = accountInfo.ownerCount;
                    wallet.trustlines = trustlines;
                } catch (error) {
                    console.warn(`Failed to get account info for ${wallet.address}:`, error.message);
                    wallet.trustlines = [];
                }
            } else {
                wallet.trustlines = [];
            }

            return {
                id: wallet.id,
                address: wallet.address,
                publicKey: wallet.public_key,
                balance: parseFloat(wallet.balance),
                isActivated: wallet.is_activated,
                trustlines: wallet.trustlines,
                sequence: wallet.sequence,
                ownerCount: wallet.owner_count,
                createdAt: wallet.created_at,
                lastUpdated: wallet.last_refreshed
            };
        } catch (error) {
            throw new Error(`Failed to get wallet: ${error.message}`);
        }
    }

    /**
     * Update trustlines in database
     */
    async updateTrustlines(walletId, walletAddress, trustlines) {
        try {
            // Clear existing trustlines
            await database.query('DELETE FROM trustlines WHERE wallet_id = $1', [walletId]);
            
            // Insert new trustlines
            for (const tl of trustlines) {
                await database.query(`
                    INSERT INTO trustlines (
                        wallet_id, wallet_address, currency_code, issuer_address,
                        balance, limit_amount, limit_peer, quality, flags
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    walletId, walletAddress, tl.currency, tl.issuer,
                    tl.balance, tl.limit, tl.limitPeer, tl.quality, tl.flags
                ]);
            }
        } catch (error) {
            console.error('Failed to update trustlines:', error.message);
        }
    }

    /**
     * Get wallet for transaction signing (includes private key)
     */
    async getWalletForSigning(walletId) {
        try {
            const result = await database.query(`
                SELECT encrypted_seed, is_activated FROM wallets WHERE id = $1
            `, [walletId]);

            if (result.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            const wallet = result.rows[0];
            
            if (!wallet.is_activated) {
                throw new Error('Wallet not activated');
            }

            // Decrypt seed and return wallet instance for signing
            const seed = this.decrypt(wallet.encrypted_seed);
            return xrplService.walletFromSeed(seed);
        } catch (error) {
            throw new Error(`Failed to get wallet for signing: ${error.message}`);
        }
    }

    /**
     * Activate wallet by funding it
     */
    async activateWallet(walletId) {
        try {
            const result = await database.query(`
                SELECT address, is_activated FROM wallets WHERE id = $1
            `, [walletId]);

            if (result.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            const wallet = result.rows[0];
            
            if (wallet.is_activated) {
                throw new Error('Wallet already activated');
            }

            // Check if account is now activated (externally funded)
            const accountInfo = await xrplService.getAccountInfo(wallet.address);
            
            // Update wallet status
            await database.query(`
                UPDATE wallets 
                SET is_activated = true, balance = $1, sequence = $2, 
                    owner_count = $3, activated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [accountInfo.balance, accountInfo.sequence, accountInfo.ownerCount, walletId]);

            return {
                id: walletId,
                address: wallet.address,
                balance: parseFloat(accountInfo.balance),
                isActivated: true,
                activatedAt: new Date().toISOString()
            };
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new Error('Wallet not yet activated. Fund with at least 10 XRP to activate.');
            }
            throw new Error(`Failed to activate wallet: ${error.message}`);
        }
    }

    /**
     * Get wallet statistics
     */
    async getWalletStats() {
        try {
            const result = await database.query(`
                SELECT 
                    COUNT(*) as total_wallets,
                    COUNT(CASE WHEN is_activated = true THEN 1 END) as activated_wallets,
                    COALESCE(SUM(balance), 0) as total_balance
                FROM wallets
            `);

            const stats = result.rows[0];
            const totalBalance = parseFloat(stats.total_balance);
            const totalWallets = parseInt(stats.total_wallets);
            const activatedWallets = parseInt(stats.activated_wallets);

            return {
                totalWallets,
                activatedWallets,
                unactivatedWallets: totalWallets - activatedWallets,
                totalBalance: Math.round(totalBalance * 1000000) / 1000000,
                averageBalance: totalWallets > 0 ? Math.round((totalBalance / totalWallets) * 1000000) / 1000000 : 0
            };
        } catch (error) {
            throw new Error(`Failed to get wallet stats: ${error.message}`);
        }
    }

    /**
     * Get wallet transaction history
     */
    async getWalletTransactions(walletId, limit = 20) {
        try {
            const result = await database.query(`
                SELECT address FROM wallets WHERE id = $1
            `, [walletId]);

            if (result.rows.length === 0) {
                throw new Error('Wallet not found');
            }

            const wallet = result.rows[0];

            if (!wallet.address) {
                return [];
            }

            const transactions = await xrplService.getTransactionHistory(wallet.address, limit);
            return transactions;
        } catch (error) {
            throw new Error(`Failed to get transaction history: ${error.message}`);
        }
    }
}

// Create singleton instance
const walletService = new WalletService();

module.exports = walletService;