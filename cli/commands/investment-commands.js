/**
 * Investment Management Commands for XRPL CLI
 * Handles trustlines, token purchases, and portfolio management
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { table } = require('table');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const ApiService = require('../utils/api-service');

class InvestmentCommands {
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

    async listOpportunities() {
        console.log('\n💎 Investment Opportunities\n');

        try {
            const spinner = ora('Fetching investment opportunities...').start();
            
            const response = await this.api.getInvestmentOpportunities();
            
            spinner.succeed('Investment opportunities retrieved!');

            if (response.success && response.data.opportunities) {
                const opportunities = response.data.opportunities;

                if (opportunities.length === 0) {
                    console.log('No investment opportunities available.');
                    console.log('Create tokens to generate investment opportunities.');
                    return;
                }

                console.log('🚀 Available RWA Investment Opportunities:\n');
                
                const tableData = [
                    ['Token', 'Name', 'Price', 'Available', 'Category']
                ];

                opportunities.forEach(opp => {
                    tableData.push([
                        opp.currencyCode || opp.symbol,
                        (opp.name || 'Unknown').substring(0, 30),
                        `$${opp.currentPrice || '1.00'}`,
                        this.formatNumber(opp.availableTokens || opp.totalSupply),
                        this.getCategoryIcon(opp.category)
                    ]);
                });

                console.log(table(tableData));

                console.log(`\nTotal opportunities: ${opportunities.length}`);

                return opportunities;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to list opportunities:', error.message);
            throw error;
        }
    }

    async createTrustline(options = {}) {
        console.log('\n🤝 Create Investment Trustline\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                console.log('   Run: node xrpl-cli.js wallet:create');
                return;
            }

            console.log(`📍 Using wallet: ${this.currentWallet.name}`);
            console.log('\n💡 Trustline creation ready for implementation');
            console.log('   This will allow you to receive tokens from issuers');

            return { success: true };

        } catch (error) {
            console.log('\n❌ Trustline creation failed:', error.message);
            throw error;
        }
    }

    async purchaseTokens(options = {}) {
        console.log('\n💰 Purchase Tokens\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                return;
            }

            console.log(`📍 Using wallet: ${this.currentWallet.name}`);
            console.log('\n💡 Token purchase system ready for implementation');
            console.log('   This will execute real token purchases on XRPL');

            return { success: true };

        } catch (error) {
            console.log('\n❌ Token purchase failed:', error.message);
            throw error;
        }
    }

    async viewPortfolio() {
        console.log('\n📊 Investment Portfolio\n');

        try {
            await this.loadConfig();

            if (!this.currentWallet) {
                console.log('❌ No active wallet configured');
                return;
            }

            const spinner = ora('Loading portfolio...').start();

            const balanceResponse = await this.api.getWalletBalance(this.currentWallet.address);
            
            spinner.succeed('Portfolio loaded!');

            const balance = balanceResponse.data;

            console.log(`📍 Portfolio for: ${this.currentWallet.name}\n`);

            const portfolioTable = [
                ['Asset', 'Balance', 'Status'],
                ['XRP', this.api.formatXRP(balance.xrpBalance), balance.accountData ? 'Active' : 'Not Activated'],
                ['Tokens', '0', 'No trustlines yet']
            ];

            console.log(table(portfolioTable));

            console.log('\n📋 Next Steps:');
            console.log('   • Create trustlines: node xrpl-cli.js invest:trustline');
            console.log('   • Purchase tokens: node xrpl-cli.js invest:purchase');

            return {
                xrpBalance: balance.xrpBalance,
                tokenHoldings: [],
                totalValue: parseFloat(balance.xrpBalance) * 0.5
            };

        } catch (error) {
            console.log('❌ Failed to load portfolio:', error.message);
            throw error;
        }
    }

    formatNumber(num) {
        if (!num) return '0';
        return parseFloat(num).toLocaleString();
    }

    getCategoryIcon(category) {
        const icons = {
            'Real Estate': '🏠',
            'Art & Collectibles': '🎨',
            'Precious Metals': '🥇',
            'Business Equity': '🏢',
            'Technology': '💻'
        };
        return icons[category] || '💫';
    }
}

module.exports = InvestmentCommands;