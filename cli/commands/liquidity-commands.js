/**
 * Liquidity Management Commands for XRPL CLI
 * Handles DEX operations, order book management, and liquidity provision
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\cli\commands\liquidity-commands.js
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { table } = require('table');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const ApiService = require('../utils/api-service');

class LiquidityCommands {
    constructor(configDir) {
        this.configDir = configDir;
        this.configFile = path.join(configDir, 'config.json');
        this.api = new ApiService();
        this.currentWallet = null;
    }

    async loadConfig() {
        try {
            if (await fs.pathExists(this.configFile)) {
                const config = await fs.readJson(this.configFile);
                this.currentWallet = config.currentWallet;
            }
        } catch (error) {
            console.log('Warning: Could not load config');
        }
    }

    /**
     * View XRPL DEX order book for a trading pair
     */
    async viewOrderBook(options = {}) {
        console.log('\n📊 XRPL DEX Order Book\n');

        try {
            await this.loadConfig();

            let baseCurrency, quoteCurrency, baseIssuer, quoteIssuer;

            if (options.pair) {
                // Parse trading pair format like "CONDO/XRP" or "TOKEN1/TOKEN2"
                const [base, quote] = options.pair.split('/');
                baseCurrency = base;
                quoteCurrency = quote;
            } else {
                // Interactive selection
                const availableTokensResponse = await this.api.getTokens();
                const tokens = availableTokensResponse.success ? availableTokensResponse.data.tokens : [];
                
                const tokenChoices = tokens.map(token => ({
                    name: `${token.currencyCode || token.tokenCode} - ${token.name}`,
                    value: {
                        currency: token.currencyCode || token.tokenCode,
                        issuer: token.issuer
                    }
                }));

                // Add XRP option
                tokenChoices.unshift({
                    name: 'XRP - XRPL Native Currency',
                    value: { currency: 'XRP', issuer: null }
                });

                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'baseCurrency',
                        message: 'Select base currency (what you want to sell):',
                        choices: tokenChoices
                    },
                    {
                        type: 'list',
                        name: 'quoteCurrency',
                        message: 'Select quote currency (what you want to buy):',
                        choices: tokenChoices
                    }
                ]);

                baseCurrency = answers.baseCurrency.currency;
                baseIssuer = answers.baseCurrency.issuer;
                quoteCurrency = answers.quoteCurrency.currency;
                quoteIssuer = answers.quoteCurrency.issuer;
            }

            if (baseCurrency === quoteCurrency) {
                console.log('❌ Cannot view order book for same currency pair');
                return;
            }

            const spinner = ora(`Fetching order book for ${baseCurrency}/${quoteCurrency}...`).start();

            const orderBookData = {
                baseCurrency,
                quoteCurrency,
                baseIssuer,
                quoteIssuer
            };

            const response = await this.api.getOrderBook(orderBookData);

            if (response.success && response.data) {
                spinner.succeed('Order book retrieved!');

                const orderBook = response.data;
                
                console.log(`📊 Order Book: ${baseCurrency}/${quoteCurrency}\n`);

                // Display asks (sell orders)
                if (orderBook.asks && orderBook.asks.length > 0) {
                    console.log('🔴 ASKS (Sell Orders):');
                    const asksTable = [
                        ['Price', 'Amount', 'Total', 'Account']
                    ];

                    orderBook.asks.slice(0, 10).forEach(ask => {
                        const price = parseFloat(ask.quality || ask.price || 0);
                        const amount = parseFloat(ask.TakerPays || ask.amount || 0);
                        const total = price * amount;
                        const account = this.api.truncateAddress(ask.Account || ask.account);

                        asksTable.push([
                            price.toFixed(6),
                            amount.toLocaleString(),
                            total.toFixed(6),
                            account
                        ]);
                    });

                    console.log(table(asksTable));
                }

                // Display bids (buy orders)
                if (orderBook.bids && orderBook.bids.length > 0) {
                    console.log('\n🟢 BIDS (Buy Orders):');
                    const bidsTable = [
                        ['Price', 'Amount', 'Total', 'Account']
                    ];

                    orderBook.bids.slice(0, 10).forEach(bid => {
                        const price = parseFloat(bid.quality || bid.price || 0);
                        const amount = parseFloat(bid.TakerGets || bid.amount || 0);
                        const total = price * amount;
                        const account = this.api.truncateAddress(bid.Account || bid.account);

                        bidsTable.push([
                            price.toFixed(6),
                            amount.toLocaleString(),
                            total.toFixed(6),
                            account
                        ]);
                    });

                    console.log(table(bidsTable));
                }

                // Display summary
                console.log('\n📋 Order Book Summary:');
                const summaryTable = [
                    ['Metric', 'Value'],
                    ['Trading Pair', `${baseCurrency}/${quoteCurrency}`],
                    ['Total Asks', orderBook.asks ? orderBook.asks.length.toString() : '0'],
                    ['Total Bids', orderBook.bids ? orderBook.bids.length.toString() : '0'],
                    ['Spread', this.calculateSpread(orderBook)],
                    ['Last Updated', new Date().toLocaleString()]
                ];

                console.log(table(summaryTable));

                return orderBook;
            } else {
                spinner.fail('Failed to retrieve order book');
                throw new Error(response.message || 'Unknown error');
            }

        } catch (error) {
            console.log('❌ Failed to view order book:', error.message);
            throw error;
        }
    }

    /**
     * Create a liquidity offer on XRPL DEX
     */
    async createOffer(options = {}) {
        console.log('\n💱 Create DEX Liquidity Offer\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                console.log('   Run: node xrpl-cli.js wallet:select');
                return;
            }

            console.log(`📍 Using wallet: ${this.currentWallet.name}`);

            let offerData = {};

            if (options.sell && options.buy && options.price && options.amount) {
                // Use provided options
                offerData = {
                    sellCurrency: options.sell,
                    buyCurrency: options.buy,
                    price: options.price,
                    amount: options.amount,
                    type: options.type || 'limit'
                };
            } else {
                // Interactive mode
                const availableTokensResponse = await this.api.getTokens();
                const tokens = availableTokensResponse.success ? availableTokensResponse.data.tokens : [];
                
                const tokenChoices = tokens.map(token => ({
                    name: `${token.currencyCode || token.tokenCode} - ${token.name}`,
                    value: {
                        currency: token.currencyCode || token.tokenCode,
                        issuer: token.issuer
                    }
                }));

                tokenChoices.unshift({
                    name: 'XRP - XRPL Native Currency',
                    value: { currency: 'XRP', issuer: null }
                });

                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'offerType',
                        message: 'Select offer type:',
                        choices: [
                            { name: '📈 Market Order (Execute immediately)', value: 'market' },
                            { name: '📊 Limit Order (Set specific price)', value: 'limit' }
                        ]
                    },
                    {
                        type: 'list',
                        name: 'sellCurrency',
                        message: 'What do you want to sell?',
                        choices: tokenChoices
                    },
                    {
                        type: 'list',
                        name: 'buyCurrency',
                        message: 'What do you want to buy?',
                        choices: tokenChoices
                    },
                    {
                        type: 'input',
                        name: 'sellAmount',
                        message: 'Amount to sell:',
                        validate: (input) => {
                            const num = parseFloat(input);
                            if (isNaN(num) || num <= 0) return 'Amount must be a positive number';
                            return true;
                        },
                        filter: (input) => parseFloat(input)
                    },
                    {
                        type: 'input',
                        name: 'price',
                        message: 'Price per unit (leave empty for market price):',
                        when: (answers) => answers.offerType === 'limit',
                        validate: (input) => {
                            if (!input) return true; // Allow empty for market orders
                            const num = parseFloat(input);
                            if (isNaN(num) || num <= 0) return 'Price must be a positive number';
                            return true;
                        },
                        filter: (input) => input ? parseFloat(input) : null
                    },
                    {
                        type: 'input',
                        name: 'expiration',
                        message: 'Order expiration (hours, 0 for no expiration):',
                        default: '24',
                        validate: (input) => {
                            const num = parseInt(input);
                            if (isNaN(num) || num < 0) return 'Expiration must be 0 or positive number';
                            return true;
                        },
                        filter: (input) => parseInt(input)
                    }
                ]);

                if (answers.sellCurrency.currency === answers.buyCurrency.currency) {
                    console.log('❌ Cannot trade same currency');
                    return;
                }

                offerData = {
                    type: answers.offerType,
                    sellCurrency: answers.sellCurrency.currency,
                    sellIssuer: answers.sellCurrency.issuer,
                    buyCurrency: answers.buyCurrency.currency,
                    buyIssuer: answers.buyCurrency.issuer,
                    sellAmount: answers.sellAmount,
                    price: answers.price,
                    expiration: answers.expiration
                };
            }

            // Display offer preview
            console.log('\n📋 Offer Preview:\n');
            const previewTable = [
                ['Property', 'Value'],
                ['Offer Type', offerData.type.toUpperCase()],
                ['Selling', `${offerData.sellAmount} ${offerData.sellCurrency}`],
                ['Buying', `${offerData.buyCurrency}`],
                ['Price', offerData.price ? `${offerData.price} ${offerData.buyCurrency}/${offerData.sellCurrency}` : 'Market Price'],
                ['Total Value', offerData.price ? `${(offerData.sellAmount * offerData.price).toFixed(6)} ${offerData.buyCurrency}` : 'Market Rate'],
                ['From Wallet', this.currentWallet.name],
                ['Expiration', offerData.expiration ? `${offerData.expiration} hours` : 'No expiration']
            ];

            console.log(table(previewTable));

            // Confirm creation
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: 'Create this offer on XRPL DEX?',
                    default: true
                }
            ]);

            if (!confirm) {
                console.log('Offer creation cancelled');
                return;
            }

            // Create offer via API
            const spinner = ora('Creating offer on XRPL DEX...').start();

            const createData = {
                walletId: this.currentWallet.id,
                offerType: offerData.type,
                sellCurrency: offerData.sellCurrency,
                sellIssuer: offerData.sellIssuer,
                buyCurrency: offerData.buyCurrency,
                buyIssuer: offerData.buyIssuer,
                sellAmount: offerData.sellAmount,
                price: offerData.price,
                expiration: offerData.expiration
            };

            const response = await this.api.createOffer(createData);

            if (response.success) {
                spinner.succeed('Offer created successfully on XRPL DEX!');

                console.log('\n🎉 Offer Created Successfully!\n');

                const resultTable = [
                    ['Property', 'Value'],
                    ['Offer ID', response.data.offerId || 'Generated'],
                    ['Transaction Hash', response.data.transactionHash || 'Pending'],
                    ['Status', 'ACTIVE'],
                    ['Trading Pair', `${offerData.sellCurrency}/${offerData.buyCurrency}`],
                    ['Amount', `${offerData.sellAmount} ${offerData.sellCurrency}`],
                    ['Price', offerData.price ? `${offerData.price}` : 'Market'],
                    ['Created', new Date().toLocaleString()]
                ];

                console.log(table(resultTable));

                console.log('\n🚀 Next Steps:');
                console.log('   1. Your offer is now live on XRPL DEX');
                console.log('   2. Other users can fill your order');
                console.log('   3. Check status with: node xrpl-cli.js liquidity:orders');
                console.log('   4. View order book: node xrpl-cli.js liquidity:book');

                return response;
            } else {
                spinner.fail('Offer creation failed');
                throw new Error(response.message || 'Unknown error');
            }

        } catch (error) {
            console.log('\n❌ Offer creation failed:', error.message);
            throw error;
        }
    }

    /**
     * List user's active offers
     */
    async listMyOffers() {
        console.log('\n📋 My Active Offers\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                return;
            }

            const spinner = ora('Fetching your offers...').start();
            
            const response = await this.api.getMyOffers(this.currentWallet.address);
            
            spinner.succeed('Offers retrieved!');

            if (response.success && response.data.offers) {
                const offers = response.data.offers;

                if (offers.length === 0) {
                    console.log('No active offers found.');
                    console.log('Create one with: node xrpl-cli.js liquidity:create');
                    return;
                }

                console.log('📊 Your Active DEX Offers:\n');
                
                const tableData = [
                    ['ID', 'Type', 'Selling', 'Buying', 'Price', 'Status', 'Created']
                ];

                offers.forEach(offer => {
                    const offerId = offer.seq || offer.id || 'N/A';
                    const type = offer.type || 'LIMIT';
                    const selling = `${offer.TakerPays_amount || offer.sellAmount} ${offer.TakerPays_currency || offer.sellCurrency}`;
                    const buying = `${offer.TakerGets_currency || offer.buyCurrency}`;
                    const price = offer.quality || offer.price || 'Market';
                    const status = offer.flags ? 'ACTIVE' : 'PENDING';
                    const created = this.api.formatTimestamp(offer.date || offer.createdAt);

                    tableData.push([
                        offerId.toString(),
                        type,
                        selling,
                        buying,
                        price.toString(),
                        status,
                        created
                    ]);
                });

                console.log(table(tableData));
                console.log(`\nTotal offers: ${offers.length}`);

                return offers;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to list offers:', error.message);
            throw error;
        }
    }

    /**
     * Cancel an active offer
     */
    async cancelOffer(options = {}) {
        console.log('\n❌ Cancel DEX Offer\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                return;
            }

            let offerSequence = options.sequence;

            if (!offerSequence) {
                // First, list current offers
                await this.listMyOffers();

                const { sequence } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'sequence',
                        message: 'Enter offer sequence number to cancel:',
                        validate: (input) => {
                            const num = parseInt(input);
                            if (isNaN(num) || num <= 0) return 'Sequence must be a positive number';
                            return true;
                        },
                        filter: (input) => parseInt(input)
                    }
                ]);

                offerSequence = sequence;
            }

            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: `Cancel offer #${offerSequence}?`,
                    default: false
                }
            ]);

            if (!confirm) {
                console.log('Offer cancellation cancelled');
                return;
            }

            const spinner = ora('Cancelling offer...').start();

            const cancelData = {
                walletId: this.currentWallet.id,
                offerSequence: offerSequence
            };

            const response = await this.api.cancelOffer(cancelData);

            if (response.success) {
                spinner.succeed('Offer cancelled successfully!');

                console.log('\n✅ Offer Cancelled\n');
                console.log(`   Offer #${offerSequence} has been cancelled`);
                console.log(`   Transaction: ${response.data.transactionHash || 'Pending'}`);
                
                return response;
            } else {
                spinner.fail('Offer cancellation failed');
                throw new Error(response.message || 'Unknown error');
            }

        } catch (error) {
            console.log('❌ Failed to cancel offer:', error.message);
            throw error;
        }
    }

    /**
     * Show liquidity analytics and statistics
     */
    async showLiquidityStats() {
        console.log('\n📊 Liquidity Analytics\n');

        try {
            await this.loadConfig();

            const spinner = ora('Analyzing liquidity data...').start();
            
            const response = await this.api.getLiquidityStats();
            
            spinner.succeed('Analytics retrieved!');

            if (response.success && response.data) {
                const stats = response.data;

                console.log('📈 XRPL DEX Liquidity Overview:\n');

                const overviewTable = [
                    ['Metric', 'Value'],
                    ['Total Trading Pairs', (stats.totalPairs || 0).toString()],
                    ['Active Offers', (stats.totalOffers || 0).toString()],
                    ['24h Volume', this.api.formatXRP(stats.volume24h || 0)],
                    ['Total Value Locked', this.api.formatXRP(stats.totalValueLocked || 0)],
                    ['Average Spread', `${(stats.averageSpread || 0).toFixed(2)}%`]
                ];

                console.log(table(overviewTable));

                // Show top trading pairs
                if (stats.topPairs && stats.topPairs.length > 0) {
                    console.log('\n🔥 Top Trading Pairs:\n');
                    
                    const pairsTable = [
                        ['Pair', '24h Volume', 'Spread', 'Offers']
                    ];

                    stats.topPairs.slice(0, 10).forEach(pair => {
                        pairsTable.push([
                            `${pair.base}/${pair.quote}`,
                            this.api.formatXRP(pair.volume24h || 0),
                            `${(pair.spread || 0).toFixed(2)}%`,
                            (pair.totalOffers || 0).toString()
                        ]);
                    });

                    console.log(table(pairsTable));
                }

                return stats;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to get liquidity stats:', error.message);
            throw error;
        }
    }

    /**
     * Helper method to calculate spread
     */
    calculateSpread(orderBook) {
        try {
            if (!orderBook.bids || !orderBook.asks || 
                orderBook.bids.length === 0 || orderBook.asks.length === 0) {
                return 'N/A';
            }

            const bestBid = parseFloat(orderBook.bids[0].quality || orderBook.bids[0].price || 0);
            const bestAsk = parseFloat(orderBook.asks[0].quality || orderBook.asks[0].price || 0);

            if (bestBid <= 0 || bestAsk <= 0) return 'N/A';

            const spread = ((bestAsk - bestBid) / bestAsk) * 100;
            return `${spread.toFixed(2)}%`;
        } catch (error) {
            return 'N/A';
        }
    }

    /**
     * Format trading pair for display
     */
    formatTradingPair(base, quote) {
        return `${base || 'Unknown'}/${quote || 'Unknown'}`;
    }

    /**
     * Get offer type icon
     */
    getOfferTypeIcon(type) {
        const icons = {
            'limit': '📊',
            'market': '📈',
            'buy': '🟢',
            'sell': '🔴'
        };
        return icons[type?.toLowerCase()] || '💱';
    }
}

module.exports = LiquidityCommands;