const xrplService = require('./xrplService');
const walletService = require('./walletService');
const crypto = require('crypto');

class AssetService {
    constructor() {
        // In-memory asset storage (for production, use encrypted database)
        this.assets = new Map();
        this.tokenizedAssets = new Map();
    }

    /**
     * Create a new Real-World Asset record
     */
    async createAsset(assetData) {
        try {
            const {
                name,
                description,
                assetType,
                value,
                location,
                ownerWalletId,
                documents = [],
                metadata = {}
            } = assetData;

            // Validate required fields
            if (!name || !assetType || !value || !ownerWalletId) {
                throw new Error('Missing required asset fields');
            }

            // Verify owner wallet exists
            const ownerWallet = await walletService.getWallet(ownerWalletId);
            if (!ownerWallet.isActivated) {
                throw new Error('Owner wallet must be activated');
            }

            const assetId = crypto.randomUUID();
            const asset = {
                id: assetId,
                name: name.trim(),
                description: description?.trim() || '',
                assetType: assetType.trim(),
                value: parseFloat(value),
                location: location?.trim() || '',
                ownerWalletId,
                ownerAddress: ownerWallet.address,
                documents: documents || [],
                metadata: metadata || {},
                status: 'pending', // pending, verified, tokenized, redeemed
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                verificationStatus: 'unverified',
                tokenizationData: null
            };

            this.assets.set(assetId, asset);

            return {
                id: assetId,
                name: asset.name,
                description: asset.description,
                assetType: asset.assetType,
                value: asset.value,
                location: asset.location,
                ownerAddress: asset.ownerAddress,
                status: asset.status,
                createdAt: asset.createdAt
            };
        } catch (error) {
            throw new Error(`Failed to create asset: ${error.message}`);
        }
    }

    /**
     * Get asset by ID
     */
    async getAsset(assetId) {
        const asset = this.assets.get(assetId);
        
        if (!asset) {
            throw new Error('Asset not found');
        }

        return {
            id: asset.id,
            name: asset.name,
            description: asset.description,
            assetType: asset.assetType,
            value: asset.value,
            location: asset.location,
            ownerAddress: asset.ownerAddress,
            status: asset.status,
            verificationStatus: asset.verificationStatus,
            tokenizationData: asset.tokenizationData,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt
        };
    }

    /**
     * Tokenize a Real-World Asset on XRPL
     */
    async tokenizeAsset(assetId, tokenizationParams = {}) {
        try {
            const asset = this.assets.get(assetId);
            if (!asset) {
                throw new Error('Asset not found');
            }

            if (asset.status === 'tokenized') {
                throw new Error('Asset is already tokenized');
            }

            // Get owner wallet for signing
            const ownerWallet = await walletService.getWalletForSigning(asset.ownerWalletId);

            // Generate token currency code (3 chars for custom currencies)
            const currencyCode = tokenizationParams.currencyCode || 
                                this.generateCurrencyCode(asset.name);

            // Calculate token supply (default: asset value / 100 for fractional ownership)
            const totalSupply = tokenizationParams.totalSupply || 
                               Math.floor(asset.value / 100);

            // Create trustline for the token
            await this.createTrustline(ownerWallet, currencyCode, totalSupply);

            // Issue tokens by sending them to the asset owner
            const tokenTransaction = await this.issueTokens(
                ownerWallet,
                ownerWallet.address,
                currencyCode,
                totalSupply.toString()
            );

            // Update asset with tokenization data
            const tokenizationData = {
                currencyCode,
                totalSupply,
                availableSupply: totalSupply,
                issuerAddress: ownerWallet.address,
                transactionHash: tokenTransaction.hash,
                tokenizedAt: new Date().toISOString(),
                ledgerIndex: tokenTransaction.ledgerIndex
            };

            asset.status = 'tokenized';
            asset.tokenizationData = tokenizationData;
            asset.updatedAt = new Date().toISOString();

            // Store tokenized asset reference
            this.tokenizedAssets.set(`${currencyCode}_${ownerWallet.address}`, {
                assetId: asset.id,
                currencyCode,
                issuerAddress: ownerWallet.address,
                totalSupply,
                availableSupply: totalSupply
            });

            this.assets.set(assetId, asset);

            return {
                assetId: asset.id,
                name: asset.name,
                tokenizationData,
                status: asset.status,
                message: 'Asset successfully tokenized'
            };

        } catch (error) {
            throw new Error(`Failed to tokenize asset: ${error.message}`);
        }
    }

    /**
     * Create trustline for custom token
     */
    async createTrustline(wallet, currencyCode, limit) {
        try {
            await xrplService.initialize();

            const trustlineTransaction = {
                TransactionType: 'TrustSet',
                Account: wallet.address,
                LimitAmount: {
                    currency: currencyCode,
                    issuer: wallet.address,
                    value: limit.toString()
                }
            };

            const result = await xrplService.submitTransaction(wallet, trustlineTransaction);
            return result;
        } catch (error) {
            throw new Error(`Failed to create trustline: ${error.message}`);
        }
    }

    /**
     * Issue tokens by sending payment
     */
    async issueTokens(issuerWallet, recipientAddress, currencyCode, amount) {
        try {
            await xrplService.initialize();

            const paymentTransaction = {
                TransactionType: 'Payment',
                Account: issuerWallet.address,
                Destination: recipientAddress,
                Amount: {
                    currency: currencyCode,
                    issuer: issuerWallet.address,
                    value: amount
                }
            };

            const result = await xrplService.submitTransaction(issuerWallet, paymentTransaction);
            return result;
        } catch (error) {
            throw new Error(`Failed to issue tokens: ${error.message}`);
        }
    }

    /**
     * Transfer tokens between addresses
     */
    async transferTokens(fromWalletId, toAddress, currencyCode, issuerAddress, amount) {
        try {
            const fromWallet = await walletService.getWalletForSigning(fromWalletId);

            await xrplService.initialize();

            const paymentTransaction = {
                TransactionType: 'Payment',
                Account: fromWallet.address,
                Destination: toAddress,
                Amount: {
                    currency: currencyCode,
                    issuer: issuerAddress,
                    value: amount.toString()
                }
            };

            const result = await xrplService.submitTransaction(fromWallet, paymentTransaction);

            // Update available supply if transferring from issuer
            const tokenKey = `${currencyCode}_${issuerAddress}`;
            const tokenInfo = this.tokenizedAssets.get(tokenKey);
            
            if (tokenInfo && fromWallet.address === issuerAddress) {
                tokenInfo.availableSupply -= parseFloat(amount);
                this.tokenizedAssets.set(tokenKey, tokenInfo);
            }

            return {
                transactionHash: result.hash,
                from: fromWallet.address,
                to: toAddress,
                amount: amount,
                currencyCode: currencyCode,
                issuer: issuerAddress,
                ledgerIndex: result.ledgerIndex
            };

        } catch (error) {
            throw new Error(`Failed to transfer tokens: ${error.message}`);
        }
    }

    /**
     * Get token balance for a wallet
     */
    async getTokenBalance(walletId, currencyCode, issuerAddress) {
        try {
            const wallet = await walletService.getWallet(walletId);
            const trustlines = await xrplService.getTrustlines(wallet.address);

            const tokenTrustline = trustlines.find(tl => 
                tl.currency === currencyCode && tl.issuer === issuerAddress
            );

            return {
                walletAddress: wallet.address,
                currencyCode,
                issuerAddress,
                balance: tokenTrustline ? parseFloat(tokenTrustline.balance) : 0,
                limit: tokenTrustline ? parseFloat(tokenTrustline.limit) : 0
            };

        } catch (error) {
            throw new Error(`Failed to get token balance: ${error.message}`);
        }
    }

    /**
     * Redeem tokens and release asset
     */
    async redeemAsset(assetId, walletId, tokenAmount) {
        try {
            const asset = this.assets.get(assetId);
            if (!asset || asset.status !== 'tokenized') {
                throw new Error('Asset not found or not tokenized');
            }

            const redeemer = await walletService.getWallet(walletId);
            const { currencyCode, issuerAddress, totalSupply } = asset.tokenizationData;

            // Check if redeemer has enough tokens
            const balance = await this.getTokenBalance(walletId, currencyCode, issuerAddress);
            
            if (balance.balance < tokenAmount) {
                throw new Error('Insufficient token balance for redemption');
            }

            // Calculate redemption percentage
            const redemptionPercentage = tokenAmount / totalSupply;
            const assetValueRedeemed = asset.value * redemptionPercentage;

            // Burn tokens by sending them back to issuer
            const burnResult = await this.transferTokens(
                walletId,
                issuerAddress,
                currencyCode,
                issuerAddress,
                tokenAmount
            );

            // Update asset status if fully redeemed
            if (tokenAmount >= totalSupply) {
                asset.status = 'redeemed';
                asset.redeemedAt = new Date().toISOString();
                asset.redeemedBy = redeemer.address;
            }

            asset.updatedAt = new Date().toISOString();
            this.assets.set(assetId, asset);

            return {
                assetId: asset.id,
                redeemerAddress: redeemer.address,
                tokensRedeemed: tokenAmount,
                assetValueRedeemed: assetValueRedeemed,
                redemptionPercentage: redemptionPercentage * 100,
                burnTransactionHash: burnResult.transactionHash,
                status: asset.status
            };

        } catch (error) {
            throw new Error(`Failed to redeem asset: ${error.message}`);
        }
    }

    /**
     * Generate 3-character currency code from asset name
     */
    generateCurrencyCode(assetName) {
        // Take first 3 uppercase letters/numbers
        const clean = assetName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (clean.length >= 3) {
            return clean.substring(0, 3);
        }
        
        // Pad with numbers if needed
        return (clean + '123').substring(0, 3);
    }

    /**
     * Get all assets for a wallet
     */
    async getWalletAssets(walletId) {
        const wallet = await walletService.getWallet(walletId);
        const assets = Array.from(this.assets.values())
            .filter(asset => asset.ownerWalletId === walletId)
            .map(asset => ({
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType,
                value: asset.value,
                status: asset.status,
                verificationStatus: asset.verificationStatus,
                createdAt: asset.createdAt,
                tokenizationData: asset.tokenizationData
            }));

        return {
            walletAddress: wallet.address,
            totalAssets: assets.length,
            assets
        };
    }

    /**
     * Get tokenized asset statistics
     */
    getTokenizedAssetStats() {
        const allAssets = Array.from(this.assets.values());
        const tokenizedAssets = allAssets.filter(a => a.status === 'tokenized');
        const totalValue = tokenizedAssets.reduce((sum, a) => sum + a.value, 0);
        const totalTokens = Array.from(this.tokenizedAssets.values())
            .reduce((sum, t) => sum + t.totalSupply, 0);

        return {
            totalAssets: allAssets.length,
            tokenizedAssets: tokenizedAssets.length,
            pendingAssets: allAssets.filter(a => a.status === 'pending').length,
            redeemedAssets: allAssets.filter(a => a.status === 'redeemed').length,
            totalValue: Math.round(totalValue * 100) / 100,
            totalTokens,
            averageAssetValue: allAssets.length > 0 ? 
                Math.round((totalValue / allAssets.length) * 100) / 100 : 0
        };
    }
}

// Create singleton instance
const assetService = new AssetService();

module.exports = assetService; 
