const xrplService = require('./xrplService');
const walletService = require('./walletService');
const assetService = require('./assetService');
const crypto = require('crypto');

class DEXService {
    constructor() {
        // In-memory order storage (for production, use database)
        this.orders = new Map();
        this.completedTrades = new Map();
    }

    /**
     * Create a new offer on XRPL DEX
     */
    async createOffer(walletId, takerGets, takerPays, expiration = null) {
        try {
            // Get wallet for signing
            const wallet = await walletService.getWalletForSigning(walletId);

            await xrplService.initialize();

            // Prepare offer transaction
            const offerTransaction = {
                TransactionType: 'OfferCreate',
                Account: wallet.address,
                TakerGets: this.formatAmount(takerGets),
                TakerPays: this.formatAmount(takerPays)
            };

            // Add expiration if specified
            if (expiration) {
                const expirationTime = Math.floor(new Date(expiration).getTime() / 1000) - 946684800; // Ripple epoch
                offerTransaction.Expiration = expirationTime;
            }

            // Submit transaction
            const result = await xrplService.submitTransaction(wallet, offerTransaction);

            // Store order information
            const orderId = crypto.randomUUID();
            const order = {
                id: orderId,
                walletId,
                walletAddress: wallet.address,
                takerGets: takerGets,
                takerPays: takerPays,
                transactionHash: result.hash,
                ledgerIndex: result.ledgerIndex,
                status: 'active',
                createdAt: new Date().toISOString(),
                expiration: expiration,
                offerSequence: result.meta.AffectedNodes?.find(node => 
                    node.CreatedNode?.LedgerEntryType === 'Offer'
                )?.CreatedNode?.NewFields?.Sequence
            };

            this.orders.set(orderId, order);

            return {
                orderId,
                transactionHash: result.hash,
                walletAddress: wallet.address,
                takerGets: takerGets,
                takerPays: takerPays,
                status: 'active',
                createdAt: order.createdAt,
                ledgerIndex: result.ledgerIndex
            };

        } catch (error) {
            throw new Error(`Failed to create offer: ${error.message}`);
        }
    }

    /**
     * Cancel an existing offer
     */
    async cancelOffer(walletId, offerSequence) {
        try {
            const wallet = await walletService.getWalletForSigning(walletId);

            await xrplService.initialize();

            const cancelTransaction = {
                TransactionType: 'OfferCancel',
                Account: wallet.address,
                OfferSequence: parseInt(offerSequence)
            };

            const result = await xrplService.submitTransaction(wallet, cancelTransaction);

            // Update order status
            const order = Array.from(this.orders.values())
                .find(o => o.walletId === walletId && o.offerSequence === parseInt(offerSequence));
            
            if (order) {
                order.status = 'cancelled';
                order.cancelledAt = new Date().toISOString();
                order.cancelTransactionHash = result.hash;
                this.orders.set(order.id, order);
            }

            return {
                transactionHash: result.hash,
                offerSequence: offerSequence,
                status: 'cancelled',
                ledgerIndex: result.ledgerIndex
            };

        } catch (error) {
            throw new Error(`Failed to cancel offer: ${error.message}`);
        }
    }

    /**
     * Get order book for a trading pair
     */
    async getOrderBook(takerGets, takerPays, limit = 20) {
        try {
            await xrplService.initialize();

            const orderBookResponse = await xrplService.client.request({
                command: 'book_offers',
                taker_gets: this.formatAmount(takerGets),
                taker_pays: this.formatAmount(takerPays),
                limit: limit,
                ledger_index: 'validated'
            });

            const offers = orderBookResponse.result.offers.map(offer => ({
                account: offer.Account,
                sequence: offer.Sequence,
                takerGets: this.parseAmount(offer.TakerGets),
                takerPays: this.parseAmount(offer.TakerPays),
                quality: offer.quality,
                flags: offer.Flags,
                bookDirectory: offer.BookDirectory,
                bookNode: offer.BookNode,
                ownerNode: offer.OwnerNode,
                previousTxnID: offer.PreviousTxnID,
                previousTxnLgrSeq: offer.PreviousTxnLgrSeq
            }));

            return {
                ledgerIndex: orderBookResponse.result.ledger_index,
                ledgerHash: orderBookResponse.result.ledger_hash,
                validated: orderBookResponse.result.validated,
                offers: offers,
                totalOffers: offers.length
            };

        } catch (error) {
            throw new Error(`Failed to get order book: ${error.message}`);
        }
    }

    /**
     * Execute a market order (immediate trade)
     */
    async executeMarketOrder(walletId, takerGets, takerPays) {
        try {
            const wallet = await walletService.getWalletForSigning(walletId);

            await xrplService.initialize();

            // Create an offer with immediate or cancel flag
            const marketOrderTransaction = {
                TransactionType: 'OfferCreate',
                Account: wallet.address,
                TakerGets: this.formatAmount(takerGets),
                TakerPays: this.formatAmount(takerPays),
                Flags: 0x00040000 // tfImmediateOrCancel flag
            };

            const result = await xrplService.submitTransaction(wallet, marketOrderTransaction);

            // Parse trade results from transaction metadata
            const trades = this.parseTradeResults(result.meta);

            // Store trade information
            const tradeId = crypto.randomUUID();
            const trade = {
                id: tradeId,
                walletId,
                walletAddress: wallet.address,
                takerGets: takerGets,
                takerPays: takerPays,
                transactionHash: result.hash,
                ledgerIndex: result.ledgerIndex,
                trades: trades,
                status: 'completed',
                executedAt: new Date().toISOString(),
                type: 'market'
            };

            this.completedTrades.set(tradeId, trade);

            return {
                tradeId,
                transactionHash: result.hash,
                walletAddress: wallet.address,
                requestedTakerGets: takerGets,
                requestedTakerPays: takerPays,
                executedTrades: trades,
                totalExecuted: trades.length,
                status: 'completed',
                executedAt: trade.executedAt
            };

        } catch (error) {
            throw new Error(`Failed to execute market order: ${error.message}`);
        }
    }

    /**
     * Get account offers (orders placed by a wallet)
     */
    async getWalletOffers(walletId) {
        try {
            const wallet = await walletService.getWallet(walletId);

            await xrplService.initialize();

            const accountOffersResponse = await xrplService.client.request({
                command: 'account_offers',
                account: wallet.address,
                ledger_index: 'validated'
            });

            const offers = accountOffersResponse.result.offers.map(offer => ({
                sequence: offer.seq,
                takerGets: this.parseAmount(offer.taker_gets),
                takerPays: this.parseAmount(offer.taker_pays),
                quality: offer.quality,
                flags: offer.flags,
                expiration: offer.expiration
            }));

            return {
                walletAddress: wallet.address,
                offers: offers,
                totalOffers: offers.length
            };

        } catch (error) {
            throw new Error(`Failed to get wallet offers: ${error.message}`);
        }
    }

    /**
     * Get trading pair information and statistics
     */
    async getTradingPairInfo(currency1, issuer1, currency2, issuer2) {
        try {
            await xrplService.initialize();

            // Get order books for both sides of the trading pair
            const buyOrderBook = await this.getOrderBook(
                { currency: currency1, issuer: issuer1 },
                { currency: currency2, issuer: issuer2 },
                10
            );

            const sellOrderBook = await this.getOrderBook(
                { currency: currency2, issuer: issuer2 },
                { currency: currency1, issuer: issuer1 },
                10
            );

            // Calculate spread and market depth
            const bestBid = buyOrderBook.offers[0];
            const bestAsk = sellOrderBook.offers[0];

            let spread = null;
            if (bestBid && bestAsk) {
                const bidPrice = parseFloat(bestBid.quality);
                const askPrice = parseFloat(bestAsk.quality);
                spread = {
                    bidPrice: bidPrice,
                    askPrice: askPrice,
                    spread: askPrice - bidPrice,
                    spreadPercent: ((askPrice - bidPrice) / bidPrice) * 100
                };
            }

            return {
                pair: `${currency1}/${currency2}`,
                currency1: { currency: currency1, issuer: issuer1 },
                currency2: { currency: currency2, issuer: issuer2 },
                buyOrderBook: {
                    offers: buyOrderBook.offers.slice(0, 5),
                    totalDepth: buyOrderBook.totalOffers
                },
                sellOrderBook: {
                    offers: sellOrderBook.offers.slice(0, 5),
                    totalDepth: sellOrderBook.totalOffers
                },
                spread: spread,
                lastUpdated: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Failed to get trading pair info: ${error.message}`);
        }
    }

    /**
     * Get trade history for a wallet
     */
    async getWalletTradeHistory(walletId, limit = 20) {
        try {
            const wallet = await walletService.getWallet(walletId);

            // Get stored trades for this wallet
            const walletTrades = Array.from(this.completedTrades.values())
                .filter(trade => trade.walletId === walletId)
                .sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt))
                .slice(0, limit);

            return {
                walletAddress: wallet.address,
                trades: walletTrades,
                totalTrades: walletTrades.length
            };

        } catch (error) {
            throw new Error(`Failed to get trade history: ${error.message}`);
        }
    }

    /**
     * Format amount for XRPL transaction
     */
    formatAmount(amount) {
        if (typeof amount === 'string' || typeof amount === 'number') {
            // XRP amount in drops
            return (parseFloat(amount) * 1000000).toString();
        } else if (amount.currency && amount.issuer) {
            // Token amount
            return {
                currency: amount.currency,
                issuer: amount.issuer,
                value: amount.value.toString()
            };
        }
        
        throw new Error('Invalid amount format');
    }

    /**
     * Parse amount from XRPL response
     */
    parseAmount(amount) {
        if (typeof amount === 'string') {
            // XRP amount
            return {
                currency: 'XRP',
                value: (parseFloat(amount) / 1000000).toString()
            };
        } else {
            // Token amount
            return {
                currency: amount.currency,
                issuer: amount.issuer,
                value: amount.value
            };
        }
    }

    /**
     * Parse trade results from transaction metadata
     */
    parseTradeResults(metadata) {
        const trades = [];
        
        if (metadata.AffectedNodes) {
            metadata.AffectedNodes.forEach(node => {
                if (node.ModifiedNode && node.ModifiedNode.LedgerEntryType === 'Offer') {
                    const finalFields = node.ModifiedNode.FinalFields;
                    const previousFields = node.ModifiedNode.PreviousFields;
                    
                    if (previousFields && finalFields) {
                        trades.push({
                            account: finalFields.Account,
                            takerGets: this.parseAmount(finalFields.TakerGets),
                            takerPays: this.parseAmount(finalFields.TakerPays),
                            executed: true
                        });
                    }
                }
            });
        }

        return trades;
    }

    /**
     * Get DEX statistics
     */
    getDEXStats() {
        const totalOrders = this.orders.size;
        const activeOrders = Array.from(this.orders.values())
            .filter(order => order.status === 'active').length;
        const totalTrades = this.completedTrades.size;
        
        return {
            totalOrders,
            activeOrders,
            cancelledOrders: totalOrders - activeOrders,
            totalTrades,
            orderSuccess: totalOrders > 0 ? (activeOrders / totalOrders) * 100 : 0
        };
    }
}

// Create singleton instance
const dexService = new DEXService();

module.exports = dexService; 
