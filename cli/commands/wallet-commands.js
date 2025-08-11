/**
 * Wallet Management Commands for XRPL CLI
 * Handles wallet creation, import, selection, and balance operations
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { table } = require('table');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const ApiService = require('../utils/api-service');

class WalletCommands {
    constructor(configDir) {
        this.configDir = configDir;
        this.walletsFile = path.join(configDir, 'wallets.json');
        this.configFile = path.join(configDir, 'config.json');
        this.api = new ApiService();
        this.wallets = {};
        this.currentWallet = null;
    }

    async loadWallets() {
        try {
            if (await fs.pathExists(this.walletsFile)) {
                this.wallets = await fs.readJson(this.walletsFile);
            }
        } catch (error) {
            console.log('Warning: Could not load wallets');
            this.wallets = {};
        }
    }

    async saveWallets() {
        try {
            await fs.writeJson(this.walletsFile, this.wallets, { spaces: 2 });
        } catch (error) {
            console.log('Failed to save wallets:', error.message);
        }
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

    async saveConfig() {
        try {
            let config = {};
            if (await fs.pathExists(this.configFile)) {
                config = await fs.readJson(this.configFile);
            }
            config.currentWallet = this.currentWallet;
            await fs.writeJson(this.configFile, config, { spaces: 2 });
        } catch (error) {
            console.log('Failed to save config:', error.message);
        }
    }

    async createWallet(options = {}) {
        console.log('\n🚀 Creating New XRPL Wallet\n');

        try {
            await this.loadWallets();

            let walletName = options.name;
            let walletDescription = options.description;

            if (!walletName) {
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Enter wallet name:',
                        default: `Wallet-${Date.now().toString().slice(-6)}`,
                        validate: (input) => input.trim().length > 0 || 'Name is required'
                    },
                    {
                        type: 'input',
                        name: 'description',
                        message: 'Enter wallet description (optional):',
                        default: 'CLI created wallet'
                    }
                ]);
                walletName = answers.name;
                walletDescription = answers.description;
            }

            const spinner = ora('Generating secure XRPL wallet...').start();
            
            const response = await this.api.createWallet({
                name: walletName,
                description: walletDescription
            });

            spinner.succeed('Wallet created successfully!');

            if (response.success && response.data) {
                const wallet = response.data;
                
                this.wallets[wallet.id] = {
                    id: wallet.id,
                    address: wallet.address,
                    publicKey: wallet.publicKey,
                    name: walletName,
                    description: walletDescription,
                    network: wallet.network,
                    createdAt: wallet.createdAt,
                    createdVia: 'CLI'
                };

                await this.saveWallets();

                console.log('\n✅ Wallet Created Successfully!\n');
                
                const walletTable = [
                    ['Property', 'Value'],
                    ['Wallet ID', wallet.id],
                    ['Name', walletName],
                    ['Address', wallet.address],
                    ['Public Key', wallet.publicKey],
                    ['Network', wallet.network],
                    ['Created', new Date(wallet.createdAt).toLocaleString()]
                ];

                console.log(table(walletTable));

                console.log('\n🔐 IMPORTANT SECURITY INFORMATION:');
                console.log('   • Your private keys are stored securely on the server');
                console.log('   • Save your wallet ID for future access');
                console.log('   • Never share your private credentials');

                const { setActive } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'setActive',
                        message: 'Set this as your active wallet?',
                        default: true
                    }
                ]);

                if (setActive) {
                    this.currentWallet = {
                        id: wallet.id,
                        address: wallet.address,
                        name: walletName
                    };
                    await this.saveConfig();
                    console.log(`\n🎯 Active wallet set to: ${walletName}`);
                }

                return wallet;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('\n❌ Wallet creation failed:', error.message);
            throw error;
        }
    }

    async importWallet(options = {}) {
        console.log('\n📥 Import Existing XRPL Wallet\n');

        try {
            await this.loadWallets();

            let seed = options.seed;
            let walletName = options.name;

            if (!seed) {
                const answers = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'seed',
                        message: 'Enter your seed phrase or private key:',
                        mask: '*',
                        validate: (input) => {
                            const trimmed = input.trim();
                            if (trimmed.length === 0) return 'Seed phrase is required';
                            if (trimmed.length < 16) return 'Seed phrase too short';
                            return true;
                        }
                    },
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Enter wallet name:',
                        default: `Imported-${Date.now().toString().slice(-6)}`,
                        validate: (input) => input.trim().length > 0 || 'Name is required'
                    }
                ]);
                seed = answers.seed;
                walletName = answers.name;
            }

            const spinner = ora('Importing XRPL wallet...').start();
            
            const response = await this.api.importWallet(seed, {
                name: walletName,
                description: 'CLI imported wallet'
            });

            spinner.succeed('Wallet imported successfully!');

            if (response.success && response.data) {
                const wallet = response.data;
                
                this.wallets[wallet.id] = {
                    id: wallet.id,
                    address: wallet.address,
                    publicKey: wallet.publicKey,
                    name: walletName,
                    description: 'CLI imported wallet',
                    network: wallet.network,
                    createdAt: wallet.createdAt,
                    importedAt: wallet.importedAt,
                    createdVia: 'CLI Import'
                };

                await this.saveWallets();

                console.log('\n✅ Wallet Imported Successfully!\n');
                
                const walletTable = [
                    ['Property', 'Value'],
                    ['Wallet ID', wallet.id],
                    ['Name', walletName],
                    ['Address', wallet.address],
                    ['Network', wallet.network],
                    ['Imported', new Date().toLocaleString()]
                ];

                console.log(table(walletTable));

                const { setActive } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'setActive',
                        message: 'Set this as your active wallet?',
                        default: true
                    }
                ]);

                if (setActive) {
                    this.currentWallet = {
                        id: wallet.id,
                        address: wallet.address,
                        name: walletName
                    };
                    await this.saveConfig();
                    console.log(`\n🎯 Active wallet set to: ${walletName}`);
                }

                return wallet;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('\n❌ Wallet import failed:', error.message);
            throw error;
        }
    }

    async listWallets() {
        console.log('\n📋 Stored Wallets\n');

        try {
            await this.loadWallets();
            await this.loadConfig();

            const walletList = Object.values(this.wallets);

            if (walletList.length === 0) {
                console.log('No wallets found. Create one with: node xrpl-cli.js wallet:create');
                return;
            }

            const tableData = [
                ['Status', 'Name', 'Address', 'Network', 'Created']
            ];

            walletList.forEach(wallet => {
                const isActive = this.currentWallet && this.currentWallet.id === wallet.id;
                const status = isActive ? '● ACTIVE' : '○';
                const address = this.api.truncateAddress(wallet.address, 8, 6);
                const created = new Date(wallet.createdAt).toLocaleDateString();

                tableData.push([status, wallet.name, address, wallet.network, created]);
            });

            console.log(table(tableData));

            console.log(`\nTotal wallets: ${walletList.length}`);
            
            if (this.currentWallet) {
                console.log(`Active wallet: ${this.currentWallet.name} (${this.api.truncateAddress(this.currentWallet.address)})`);
            } else {
                console.log('No active wallet selected. Use: node xrpl-cli.js wallet:select');
            }

        } catch (error) {
            console.log('❌ Failed to list wallets:', error.message);
            throw error;
        }
    }

    async selectWallet(options = {}) {
        console.log('\n🎯 Select Active Wallet\n');

        try {
            await this.loadWallets();
            
            const walletList = Object.values(this.wallets);

            if (walletList.length === 0) {
                console.log('No wallets available. Create one first with: node xrpl-cli.js wallet:create');
                return;
            }

            let selectedWallet;

            if (options.address) {
                selectedWallet = walletList.find(w => w.address === options.address);
                if (!selectedWallet) {
                    console.log(`❌ Wallet with address ${options.address} not found`);
                    return;
                }
            } else {
                const choices = walletList.map(wallet => ({
                    name: `${wallet.name} (${this.api.truncateAddress(wallet.address)}) - ${wallet.network}`,
                    value: wallet.id
                }));

                const { walletId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'walletId',
                        message: 'Select a wallet:',
                        choices: choices
                    }
                ]);

                selectedWallet = this.wallets[walletId];
            }

            this.currentWallet = {
                id: selectedWallet.id,
                address: selectedWallet.address,
                name: selectedWallet.name
            };

            await this.saveConfig();

            console.log('✅ Active wallet updated!');
            console.log(`   Name: ${selectedWallet.name}`);
            console.log(`   Address: ${selectedWallet.address}`);
            console.log(`   Network: ${selectedWallet.network}`);

        } catch (error) {
            console.log('❌ Failed to select wallet:', error.message);
            throw error;
        }
    }

    async getWalletBalance(options = {}) {
        console.log('\n💰 Wallet Balance & Information\n');

        try {
            await this.loadConfig();
            
            let targetAddress = options.address;
            let walletName = 'Unknown Wallet';

            if (!targetAddress) {
                if (!this.currentWallet) {
                    console.log('❌ No active wallet selected and no address provided');
                    console.log('   Use: node xrpl-cli.js wallet:select');
                    return;
                }
                targetAddress = this.currentWallet.address;
                walletName = this.currentWallet.name;
            }

            const spinner = ora('Fetching wallet information...').start();

            const balanceResponse = await this.api.getWalletBalance(targetAddress);
            
            spinner.succeed('Wallet information retrieved!');

            if (balanceResponse.success && balanceResponse.data) {
                const balance = balanceResponse.data;

                console.log('✅ Wallet Information\n');

                const balanceTable = [
                    ['Property', 'Value'],
                    ['Wallet Name', walletName],
                    ['Address', targetAddress],
                    ['XRP Balance', this.api.formatXRP(balance.xrpBalance)],
                    ['Account Status', balance.accountData ? 'Active' : 'Not Activated']
                ];

                if (balance.accountData) {
                    balanceTable.push(
                        ['Sequence', balance.accountData.Sequence.toString()],
                        ['Owner Count', balance.accountData.OwnerCount.toString()],
                        ['Reserve Requirement', this.api.formatXRP((balance.accountData.OwnerCount * 2) + 10)]
                    );
                }

                console.log(table(balanceTable));

                return balance;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to get wallet balance:', error.message);
            throw error;
        }
    }

    async getCurrentWallet() {
        await this.loadConfig();
        return this.currentWallet;
    }

    async clearCurrentWallet() {
        this.currentWallet = null;
        await this.saveConfig();
        console.log('🔄 Active wallet cleared');
    }
}

module.exports = WalletCommands;