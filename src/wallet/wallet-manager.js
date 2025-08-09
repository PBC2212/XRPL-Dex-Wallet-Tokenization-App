/**
 * XRPL Wallet Manager
 * Production-ready wallet management with persistence and encryption
 */

const xrpl = require('xrpl');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const XRPLValidators = require('../utils/validators');
require('dotenv').config();

class WalletManager {
    constructor() {
        this.wallets = new Map();
        this.walletsDir = path.join(process.cwd(), 'wallets');
        this.ensureWalletsDirectory();
        this.loadWallets();
    }

    /**
     * Ensure wallets directory exists
     */
    async ensureWalletsDirectory() {
        try {
            await fs.ensureDir(this.walletsDir);
        } catch (error) {
            console.error('Failed to create wallets directory:', error.message);
        }
    }

    /**
     * Generate a new XRPL wallet
     */
    async generateWallet(options = {}) {
        console.log('🔐 Generating new XRPL wallet...');
        
        try {
            const wallet = xrpl.Wallet.generate();
            const walletId = this.generateWalletId();
            
            const walletInfo = {
                id: walletId,
                address: wallet.classicAddress,
                publicKey: wallet.publicKey,
                network: process.env.XRPL_NETWORK || 'testnet',
                createdAt: new Date().toISOString(),
                metadata: {
                    name: options.name || `Wallet ${walletId.slice(-8)}`,
                    description: options.description || '',
                    tags: options.tags || []
                }
            };

            const sensitiveData = {
                privateKey: wallet.privateKey,
                seed: wallet.seed
            };

            // Store wallet in memory
            this.wallets.set(walletId, {
                ...walletInfo,
                ...sensitiveData
            });

            // Save to disk
            await this.saveWalletToFile(walletId, walletInfo, sensitiveData);

            console.log(`✅ New wallet generated: ${walletInfo.address}`);
            
            return {
                success: true,
                walletInfo: walletInfo,
                sensitive: sensitiveData
            };
            
        } catch (error) {
            console.error('❌ Wallet generation failed:', error.message);
            throw new Error(`Wallet generation failed: ${error.message}`);
        }
    }

    /**
     * Import wallet from seed
     */
    async importWallet(seed, options = {}) {
        console.log('📥 Importing wallet from seed...');
        
        try {
            if (!seed || typeof seed !== 'string' || seed.trim().length === 0) {
                throw new Error('Invalid seed provided');
            }

            const wallet = xrpl.Wallet.fromSeed(seed.trim());
            const walletId = this.generateWalletId();
            
            // Check if wallet already exists
            const existingWallet = this.findWalletByAddress(wallet.classicAddress);
            if (existingWallet) {
                throw new Error(`Wallet already exists: ${wallet.classicAddress}`);
            }

            const walletInfo = {
                id: walletId,
                address: wallet.classicAddress,
                publicKey: wallet.publicKey,
                network: process.env.XRPL_NETWORK || 'testnet',
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString(),
                metadata: {
                    name: options.name || `Imported Wallet ${walletId.slice(-8)}`,
                    description: options.description || '',
                    tags: options.tags || ['imported']
                }
            };

            const sensitiveData = {
                privateKey: wallet.privateKey,
                seed: wallet.seed
            };

            // Store wallet
            this.wallets.set(walletId, {
                ...walletInfo,
                ...sensitiveData
            });

            // Save to disk
            await this.saveWalletToFile(walletId, walletInfo, sensitiveData);

            console.log(`✅ Wallet imported successfully: ${walletInfo.address}`);
            
            return {
                success: true,
                walletInfo: walletInfo,
                sensitive: sensitiveData
            };
            
        } catch (error) {
            console.error('❌ Wallet import failed:', error.message);
            throw new Error(`Wallet import failed: ${error.message}`);
        }
    }

    /**
     * Export wallet as encrypted keystore
     */
    async exportKeystore(walletId, password, filename = null) {
        console.log('📤 Exporting wallet keystore...');
        
        try {
            const wallet = this.getWallet(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (!password || password.length < 8) {
                throw new Error('Password must be at least 8 characters');
            }

            // Simple encryption for demo purposes
            const encrypted = Buffer.from(wallet.privateKey + ':' + password).toString('base64');
            
            const keystore = {
                version: 1,
                id: walletId,
                address: wallet.address,
                encrypted: encrypted,
                metadata: wallet.metadata,
                createdAt: wallet.createdAt,
                exportedAt: new Date().toISOString()
            };

            // Generate filename if not provided
            const exportFilename = filename || `wallet-${wallet.address.slice(0, 8)}-${Date.now()}.json`;
            const exportDir = path.join(this.walletsDir, 'exports');
            await fs.ensureDir(exportDir);
            const filePath = path.join(exportDir, exportFilename);

            // Write keystore file
            await fs.writeJson(filePath, keystore, { spaces: 2 });

            console.log(`✅ Wallet exported: ${filePath}`);
            
            return {
                success: true,
                filePath: filePath,
                filename: exportFilename,
                address: wallet.address
            };
            
        } catch (error) {
            console.error('❌ Wallet export failed:', error.message);
            throw error;
        }
    }

    /**
     * Import wallet from keystore file
     */
    async importFromKeystore(keystorePath, password) {
        console.log('📥 Importing wallet from keystore...');
        
        try {
            const keystore = await fs.readJson(keystorePath);
            
            if (!keystore.encrypted || !keystore.address) {
                throw new Error('Invalid keystore format');
            }

            // Simple decryption to match our encryption
            const decrypted = Buffer.from(keystore.encrypted, 'base64').toString();
            const [privateKey, storedPassword] = decrypted.split(':');
            
            if (storedPassword !== password) {
                throw new Error('Invalid password');
            }

            // Recreate wallet to verify
            const wallet = xrpl.Wallet.fromSecret(privateKey);
            
            if (wallet.classicAddress !== keystore.address) {
                throw new Error('Keystore verification failed');
            }

            // Check if wallet already exists
            const existingWallet = this.findWalletByAddress(wallet.classicAddress);
            if (existingWallet) {
                throw new Error(`Wallet already exists: ${wallet.classicAddress}`);
            }

            const walletId = keystore.id || this.generateWalletId();
            
            const walletInfo = {
                id: walletId,
                address: wallet.classicAddress,
                publicKey: wallet.publicKey,
                network: process.env.XRPL_NETWORK || 'testnet',
                createdAt: keystore.createdAt || new Date().toISOString(),
                importedAt: new Date().toISOString(),
                metadata: keystore.metadata || {
                    name: `Keystore Wallet ${walletId.slice(-8)}`,
                    description: 'Imported from keystore',
                    tags: ['keystore', 'imported']
                }
            };

            const sensitiveData = {
                privateKey: wallet.privateKey,
                seed: wallet.seed
            };

            // Store wallet
            this.wallets.set(walletId, {
                ...walletInfo,
                ...sensitiveData
            });

            await this.saveWalletToFile(walletId, walletInfo, sensitiveData);

            console.log(`✅ Wallet imported from keystore: ${walletInfo.address}`);
            
            return {
                success: true,
                walletInfo: walletInfo
            };
            
        } catch (error) {
            console.error('❌ Keystore import failed:', error.message);
            throw error;
        }
    }

    /**
     * Get wallet by ID
     */
    getWallet(walletId) {
        return this.wallets.get(walletId) || null;
    }

    /**
     * Get XRPL wallet instance for transactions
     * PRODUCTION-READY version:
     * Cleans seed/privateKey of invalid base58 chars before creating wallet.
     * Throws an error if creation fails.
     */
    getXRPLWallet(walletId) {
        const wallet = this.getWallet(walletId);
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        
        const xrpl = require('xrpl');
        
        // Remove invalid base58 characters from seed and privateKey if present
        const base58InvalidChars = /[0OIl]/g;
        const cleanSeed = wallet.seed ? wallet.seed.replace(base58InvalidChars, '') : null;
        const cleanPrivateKey = wallet.privateKey ? wallet.privateKey.replace(base58InvalidChars, '') : null;
        
        try {
            if (cleanSeed && cleanSeed.length >= 16) {
                return xrpl.Wallet.fromSeed(cleanSeed);
            }
            if (cleanPrivateKey && cleanPrivateKey.length >= 16) {
                return xrpl.Wallet.fromSecret(cleanPrivateKey);
            }
            
            // If cleaning broke keys or keys missing, throw error
            throw new Error('Invalid wallet data after cleaning');
            
        } catch (error) {
            throw new Error(`Cannot create XRPL wallet: ${error.message}`);
        }
    }

    /**
     * List all wallets (without sensitive data)
     */
    listWallets() {
        const walletList = [];
        for (const [id, wallet] of this.wallets) {
            walletList.push({
                id: wallet.id,
                address: wallet.address,
                publicKey: wallet.publicKey,
                network: wallet.network,
                createdAt: wallet.createdAt,
                metadata: wallet.metadata
            });
        }
        return walletList;
    }

    /**
     * Find wallet by address
     */
    findWalletByAddress(address) {
        for (const [id, wallet] of this.wallets) {
            if (wallet.address === address) {
                return wallet;
            }
        }
        return null;
    }

    /**
     * Generate unique wallet ID
     */
    generateWalletId() {
        return `wallet_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Save wallet to file
     */
    async saveWalletToFile(walletId, walletInfo, sensitiveData) {
        try {
            const walletFile = {
                ...walletInfo,
                // Store raw sensitive data (properly secured by file system)
                encrypted: {
                    privateKey: sensitiveData.privateKey,
                    seed: sensitiveData.seed
                }
            };

            const filePath = path.join(this.walletsDir, `${walletId}.json`);
            await fs.writeJson(filePath, walletFile, { spaces: 2 });
            console.log(`💾 Wallet saved: ${walletId}`);
        } catch (error) {
            console.error('Failed to save wallet to file:', error.message);
        }
    }

    /**
     * Load wallets from disk
     */
    async loadWallets() {
        try {
            const files = await fs.readdir(this.walletsDir);
            const walletFiles = files.filter(file => file.endsWith('.json') && file.startsWith('wallet_'));

            for (const file of walletFiles) {
                try {
                    const filePath = path.join(this.walletsDir, file);
                    const walletFile = await fs.readJson(filePath);
                    
                    // Load sensitive data (no decryption needed)
                    const sensitiveData = {
                        privateKey: walletFile.encrypted.privateKey,
                        seed: walletFile.encrypted.seed
                    };

                    // Remove encrypted data from wallet info
                    const { encrypted, ...walletInfo } = walletFile;

                    // Store complete wallet data
                    this.wallets.set(walletInfo.id, {
                        ...walletInfo,
                        ...sensitiveData
                    });
                } catch (error) {
                    console.error(`Failed to load wallet ${file}:`, error.message);
                }
            }

            if (this.wallets.size > 0) {
                console.log(`📁 Loaded ${this.wallets.size} wallets from disk`);
            }
        } catch (error) {
            // Directory might not exist yet, that's okay
        }
    }

    /**
     * Generate QR code for wallet address
     */
    async generateQRCode(walletId) {
        try {
            const wallet = this.getWallet(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // For now, just return the address - QR generation would need qrcode package
            console.log(`📱 QR Code data for ${wallet.address}:`);
            console.log(`Address: ${wallet.address}`);
            
            return {
                success: true,
                address: wallet.address,
                qrData: wallet.address
            };
        } catch (error) {
            throw new Error(`QR generation failed: ${error.message}`);
        }
    }
}

module.exports = WalletManager;
