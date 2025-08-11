/**
 * Token Management Commands for XRPL CLI
 * Handles RWA token creation, listing, and management
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\cli\commands\token-commands.js
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { table } = require('table');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const ApiService = require('../utils/api-service');

class TokenCommands {
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
     * Create a new RWA token on XRPL
     */
    async createToken(options = {}) {
        console.log('\n🪙 Create Real World Asset (RWA) Token\n');

        try {
            await this.loadConfig();

            // Check if wallet is configured
            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                console.log('   Run: node xrpl-cli.js wallet:create');
                return;
            }

            console.log(`📍 Using wallet: ${this.currentWallet.name} (${this.api.truncateAddress(this.currentWallet.address)})`);

            // Get token details
            let tokenData = {};

            if (options.name && options.code && options.supply) {
                // Use provided options
                tokenData = {
                    name: options.name,
                    code: options.code,
                    supply: options.supply,
                    description: options.description || '',
                    type: options.type || 'real-estate'
                };
            } else {
                // Interactive mode
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Token name (e.g., "Miami Beach Condo"):',
                        validate: (input) => input.trim().length > 0 || 'Token name is required'
                    },
                    {
                        type: 'input',
                        name: 'code',
                        message: 'Token code (3-20 characters, e.g., "CONDO"):',
                        validate: (input) => {
                            const code = input.trim().toUpperCase();
                            if (code.length < 3 || code.length > 20) return 'Code must be 3-20 characters';
                            if (!/^[A-Z0-9]+$/.test(code)) return 'Code can only contain letters and numbers';
                            if (code === 'XRP') return 'Cannot use XRP as token code';
                            return true;
                        },
                        filter: (input) => input.trim().toUpperCase()
                    },
                    {
                        type: 'input',
                        name: 'supply',
                        message: 'Total supply (number of tokens):',
                        validate: (input) => {
                            const num = parseInt(input);
                            if (isNaN(num) || num <= 0) return 'Supply must be a positive number';
                            if (num > 1000000000) return 'Supply cannot exceed 1 billion';
                            return true;
                        },
                        filter: (input) => parseInt(input)
                    },
                    {
                        type: 'list',
                        name: 'type',
                        message: 'Asset type:',
                        choices: [
                            { name: '🏠 Real Estate', value: 'real-estate' },
                            { name: '🎨 Art & Collectibles', value: 'art' },
                            { name: '🥇 Precious Metals', value: 'precious-metals' },
                            { name: '🏢 Business Equity', value: 'business-equity' },
                            { name: '📜 Intellectual Property', value: 'intellectual-property' },
                            { name: '💎 Other Asset', value: 'other' }
                        ]
                    },
                    {
                        type: 'input',
                        name: 'description',
                        message: 'Description (optional):',
                        default: ''
                    },
                    {
                        type: 'confirm',
                        name: 'requireAuth',
                        message: 'Require authorization for trustlines?',
                        default: false
                    }
                ]);

                tokenData = answers;
            }

            // Display token preview
            console.log('\n📋 Token Preview:\n');
            const previewTable = [
                ['Property', 'Value'],
                ['Token Name', tokenData.name],
                ['Token Code', tokenData.code],
                ['Total Supply', tokenData.supply.toLocaleString()],
                ['Asset Type', this.formatAssetType(tokenData.type)],
                ['Description', tokenData.description || 'None'],
                ['Issuer Wallet', this.currentWallet.name],
                ['Issuer Address', this.currentWallet.address],
                ['Network', 'TESTNET']
            ];

            console.log(table(previewTable));

            // Confirm creation
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: 'Create this token on XRPL?',
                    default: true
                }
            ]);

            if (!confirm) {
                console.log('Token creation cancelled');
                return;
            }

            // Create token via API
            const spinner = ora('Creating token on XRPL blockchain...').start();

            const createData = {
                issuerWalletId: this.currentWallet.id,
                tokenCode: tokenData.code,
                currencyCode: tokenData.code,
                name: tokenData.name,
                symbol: tokenData.code,
                description: tokenData.description,
                decimals: 6,
                totalSupply: tokenData.supply,
                metadata: {
                    assetType: tokenData.type,
                    created: new Date().toISOString(),
                    issuer: this.currentWallet.address
                },
                transferFee: 0,
                requireAuth: tokenData.requireAuth || false,
                settings: {
                    defaultRipple: false,
                    requireAuth: tokenData.requireAuth || false
                }
            };

            const response = await this.api.createToken(createData);

            if (response.success) {
                spinner.succeed('Token created successfully on XRPL!');

                console.log('\n🎉 Token Created Successfully!\n');

                const resultTable = [
                    ['Property', 'Value'],
                    ['Token ID', response.tokenId || 'Generated'],
                    ['Token Code', tokenData.code],
                    ['Token Name', tokenData.name],
                    ['Total Supply', tokenData.supply.toLocaleString()],
                    ['Issuer Address', this.currentWallet.address],
                    ['Network', 'TESTNET'],
                    ['Status', 'ACTIVE']
                ];

                console.log(table(resultTable));

                console.log('\n🚀 Next Steps:');
                console.log('   1. Your token is now live on XRPL TESTNET');
                console.log('   2. Investors can create trustlines to your token');
                console.log('   3. You can issue tokens to investors');
                console.log('   4. View all tokens with: node xrpl-cli.js token:list');

                return response;
            } else {
                spinner.fail('Token creation failed');
                throw new Error(response.message || 'Unknown error');
            }

        } catch (error) {
            console.log('\n❌ Token creation failed:', error.message);
            
            if (error.message.includes('Wallet missing ID')) {
                console.log('\n💡 Solution:');
                console.log('   Your wallet needs to be reconnected for token creation');
                console.log('   Run: node xrpl-cli.js wallet:select');
            }
            
            throw error;
        }
    }

    /**
     * List all created tokens
     */
    async listTokens() {
        console.log('\n📜 Created Tokens\n');

        try {
            const spinner = ora('Fetching tokens...').start();
            
            const response = await this.api.getTokens();
            
            spinner.succeed('Tokens retrieved!');

            if (response.success && response.data.tokens) {
                const tokens = response.data.tokens;

                if (tokens.length === 0) {
                    console.log('No tokens found. Create one with: node xrpl-cli.js token:create');
                    return;
                }

                // Group tokens by issuer
                await this.loadConfig();
                const userTokens = tokens.filter(token => 
                    this.currentWallet && token.issuer === this.currentWallet.address
                );
                const otherTokens = tokens.filter(token => 
                    !this.currentWallet || token.issuer !== this.currentWallet.address
                );

                // Display user's tokens
                if (userTokens.length > 0) {
                    console.log('🪙 Your Tokens:\n');
                    this.displayTokenTable(userTokens, true);
                }

                // Display other tokens
                if (otherTokens.length > 0) {
                    console.log('\n💎 Other Available Tokens:\n');
                    this.displayTokenTable(otherTokens, false);
                }

                console.log(`\nTotal tokens: ${tokens.length}`);
                if (this.currentWallet) {
                    console.log(`Your tokens: ${userTokens.length}`);
                }

            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to list tokens:', error.message);
            throw error;
        }
    }

    /**
     * Display token table
     */
    displayTokenTable(tokens, isOwner = false) {
        const tableData = [
            ['Code', 'Name', 'Supply', 'Issuer', 'Created', 'Type']
        ];

        tokens.forEach(token => {
            const code = token.currencyCode || token.tokenCode || 'N/A';
            const name = token.name || 'Unnamed Token';
            const supply = (token.totalSupply || 0).toLocaleString();
            const issuer = isOwner ? 'YOU' : this.api.truncateAddress(token.issuer, 6, 4);
            const created = new Date(token.createdAt).toLocaleDateString();
            const type = this.getAssetTypeIcon(token.metadata?.assetType || token.assetType);

            tableData.push([code, name, supply, issuer, created, type]);
        });

        console.log(table(tableData));
    }

    /**
     * Get detailed token information
     */
    async getTokenInfo(tokenCode) {
        console.log(`\n🔍 Token Information: ${tokenCode}\n`);

        try {
            const response = await this.api.getTokens();
            
            if (response.success && response.data.tokens) {
                const token = response.data.tokens.find(t => 
                    (t.currencyCode || t.tokenCode) === tokenCode.toUpperCase()
                );

                if (!token) {
                    console.log(`❌ Token ${tokenCode} not found`);
                    return;
                }

                const infoTable = [
                    ['Property', 'Value'],
                    ['Token Code', token.currencyCode || token.tokenCode],
                    ['Token Name', token.name],
                    ['Description', token.description || 'None'],
                    ['Total Supply', (token.totalSupply || 0).toLocaleString()],
                    ['Decimals', token.decimals || 6],
                    ['Asset Type', this.formatAssetType(token.metadata?.assetType)],
                    ['Issuer Address', token.issuer],
                    ['Network', token.network || 'TESTNET'],
                    ['Created', new Date(token.createdAt).toLocaleString()],
                    ['Status', token.status || 'ACTIVE']
                ];

                console.log(table(infoTable));

                return token;
            } else {
                throw new Error('Failed to fetch token information');
            }

        } catch (error) {
            console.log('❌ Failed to get token info:', error.message);
            throw error;
        }
    }

    /**
     * Format asset type for display
     */
    formatAssetType(type) {
        const types = {
            'real-estate': 'Real Estate',
            'art': 'Art & Collectibles',
            'precious-metals': 'Precious Metals',
            'business-equity': 'Business Equity',
            'intellectual-property': 'Intellectual Property',
            'other': 'Other Asset'
        };
        return types[type] || 'Unknown';
    }

    /**
     * Get asset type icon
     */
    getAssetTypeIcon(type) {
        const icons = {
            'real-estate': '🏠',
            'art': '🎨',
            'precious-metals': '🥇',
            'business-equity': '🏢',
            'intellectual-property': '📜',
            'other': '💎'
        };
        return icons[type] || '💫';
    }

    /**
     * Check if current wallet can create tokens
     */
    async checkTokenCreationCapability() {
        await this.loadConfig();
        
        if (!this.currentWallet) {
            return {
                canCreate: false,
                reason: 'No active wallet configured'
            };
        }

        if (!this.currentWallet.id) {
            return {
                canCreate: false,
                reason: 'Wallet missing ID - reconnection required'
            };
        }

        return {
            canCreate: true,
            wallet: this.currentWallet
        };
    }

    /**
     * Get token creation status
     */
    async getCreationStatus() {
        const capability = await this.checkTokenCreationCapability();
        
        console.log('\n🔍 Token Creation Status:\n');
        
        if (capability.canCreate) {
            console.log('✅ Ready to create tokens');
            console.log(`   Active wallet: ${capability.wallet.name}`);
            console.log(`   Address: ${capability.wallet.address}`);
        } else {
            console.log('❌ Cannot create tokens');
            console.log(`   Reason: ${capability.reason}`);
            
            if (capability.reason.includes('No active wallet')) {
                console.log('   Solution: node xrpl-cli.js wallet:create');
            } else if (capability.reason.includes('missing ID')) {
                console.log('   Solution: node xrpl-cli.js wallet:select');
            }
        }
        
        return capability;
    }
}

module.exports = TokenCommands;