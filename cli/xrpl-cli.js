#!/usr/bin/env node

/**
 * XRPL Real World Assets (RWA) CLI Tool
 * Production-ready command line interface for XRPL tokenization platform
 * 
 * Usage: node xrpl-cli.js <command> [options]
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\cli\xrpl-cli.js
 */

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const boxen = require('boxen');
const ora = require('ora');
require('dotenv').config();

// CLI Configuration
const CLI_VERSION = '1.0.0';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const CLI_CONFIG_DIR = path.join(process.cwd(), '.xrpl-cli');
const CLI_CONFIG_FILE = path.join(CLI_CONFIG_DIR, 'config.json');
const CLI_WALLETS_FILE = path.join(CLI_CONFIG_DIR, 'wallets.json');

class XRPLCli {
    constructor() {
        this.program = new Command();
        this.config = {};
        this.wallets = {};
        this.currentWallet = null;
        this.apiUrl = API_BASE_URL;
        this.setupCommands();
    }

    async init() {
        try {
            // Display banner
            console.clear();
            
            try {
                console.log(chalk.cyan(figlet.textSync('XRPL RWA CLI', { 
                    font: 'Standard',
                    horizontalLayout: 'fitted' 
                })));
            } catch (figletError) {
                console.log('🏛️  XRPL RWA CLI');
            }
            
            const bannerContent = `🏛️  XRPL Real World Assets CLI v${CLI_VERSION}\n` +
                                 'Production-ready tool for XRPL tokenization platform\n' +
                                 '📍 Path: E:\\XRPL-Dex-Wallet-Tokenization-App\\cli\\';

            try {
                console.log(boxen(bannerContent, {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan'
                }));
            } catch (boxenError) {
                console.log('\n' + bannerContent + '\n');
            }

            // Ensure config directory exists
            await fs.ensureDir(CLI_CONFIG_DIR);
            
            // Load configuration
            await this.loadConfig();
            
            // Check API connection
            await this.checkAPIConnection();
            
        } catch (error) {
            console.log('❌ Initialization failed:', error.message);
            process.exit(1);
        }
    }

    setupCommands() {
        this.program
            .name('xrpl-cli')
            .description('XRPL Real World Assets CLI Tool')
            .version(CLI_VERSION);

        // Global options
        this.program
            .option('-v, --verbose', 'Enable verbose logging')
            .option('--api-url <url>', 'Override API base URL')
            .option('--config <path>', 'Custom config file path');

        // Main command groups
        this.program
            .command('setup')
            .description('🚀 Interactive setup wizard')
            .action(this.handleSetup.bind(this));

        this.program
            .command('health')
            .description('🏥 Check system health and API connection')
            .action(this.handleHealthCheck.bind(this));

        this.program
            .command('config')
            .description('⚙️  Show current configuration')
            .action(this.handleShowConfig.bind(this));

        // Wallet management commands
        this.program
            .command('wallet:create')
            .description('💼 Create a new XRPL wallet')
            .option('-n, --name <n>', 'Wallet name')
            .option('-d, --description <desc>', 'Wallet description')
            .action(this.handleWalletCreate.bind(this));

        this.program
            .command('wallet:import')
            .description('📥 Import wallet from seed phrase')
            .option('-s, --seed <seed>', 'Seed phrase')
            .option('-n, --name <n>', 'Wallet name')
            .action(this.handleWalletImport.bind(this));

        this.program
            .command('wallet:list')
            .description('📋 List all wallets')
            .action(this.handleWalletList.bind(this));

        this.program
            .command('wallet:select')
            .description('🎯 Select active wallet')
            .option('-a, --address <address>', 'Wallet address')
            .action(this.handleWalletSelect.bind(this));

        this.program
            .command('wallet:balance')
            .description('💰 Get wallet balance')
            .option('-a, --address <address>', 'Wallet address (uses current if not specified)')
            .action(this.handleWalletBalance.bind(this));

        // Token management commands
        this.program
            .command('token:create')
            .description('🪙 Create a new RWA token')
            .option('-n, --name <n>', 'Token name')
            .option('-c, --code <code>', 'Token code (3-20 chars)')
            .option('-s, --supply <supply>', 'Total supply')
            .option('-d, --description <desc>', 'Token description')
            .option('-t, --type <type>', 'Asset type')
            .action(this.handleTokenCreate.bind(this));

        this.program
            .command('token:list')
            .description('📜 List all created tokens')
            .action(this.handleTokenList.bind(this));

        // Investment commands
        this.program
            .command('invest:list')
            .description('💎 List investment opportunities')
            .action(this.handleInvestList.bind(this));

        this.program
            .command('invest:trustline')
            .description('🤝 Create trustline for investment')
            .option('-c, --currency <code>', 'Currency code')
            .option('-i, --issuer <address>', 'Issuer address')
            .option('-l, --limit <amount>', 'Trust limit')
            .action(this.handleInvestTrustline.bind(this));

        this.program
            .command('invest:purchase')
            .description('💰 Purchase tokens')
            .option('-c, --currency <code>', 'Currency code')
            .option('-a, --amount <amount>', 'Amount to purchase')
            .action(this.handleInvestPurchase.bind(this));

        this.program
            .command('invest:portfolio')
            .description('📊 View investment portfolio')
            .action(this.handleInvestPortfolio.bind(this));

        // Network commands
        this.program
            .command('network:status')
            .description('🌐 Check XRPL network status')
            .action(this.handleNetworkStatus.bind(this));

        this.program
            .command('network:info')
            .description('📊 Get detailed network information')
            .action(this.handleNetworkInfo.bind(this));

        // Help command override
        this.program
            .command('help')
            .description('❓ Show help information')
            .action(() => {
                this.showCustomHelp();
            });
    }

    showCustomHelp() {
        console.log('\n🏛️  XRPL RWA CLI - Available Commands\n');
        
        console.log('🚀 Getting Started:');
        console.log('  setup                    Interactive setup wizard');
        console.log('  health                   Check system health');
        console.log('  config                   Show configuration\n');
        
        console.log('💼 Wallet Management:');
        console.log('  wallet:create            Create new wallet');
        console.log('  wallet:import            Import existing wallet');
        console.log('  wallet:list              List all wallets');
        console.log('  wallet:select            Select active wallet');
        console.log('  wallet:balance           Check wallet balance\n');
        
        console.log('🪙 Token Operations:');
        console.log('  token:create             Create RWA token');
        console.log('  token:list               List created tokens\n');
        
        console.log('💎 Investment Operations:');
        console.log('  invest:list              List opportunities');
        console.log('  invest:trustline         Create trustline');
        console.log('  invest:purchase          Purchase tokens');
        console.log('  invest:portfolio         View portfolio\n');
        
        console.log('🌐 Network Operations:');
        console.log('  network:status           Network status');
        console.log('  network:info             Detailed network info\n');
        
        console.log('Examples:');
        console.log('  node xrpl-cli.js setup');
        console.log('  node xrpl-cli.js wallet:create --name "My Wallet"');
        console.log('  node xrpl-cli.js token:create --name "Miami Condo" --code "CONDO"');
    }

    async loadConfig() {
        try {
            if (await fs.pathExists(CLI_CONFIG_FILE)) {
                this.config = await fs.readJson(CLI_CONFIG_FILE);
                if (this.config.apiUrl) {
                    this.apiUrl = this.config.apiUrl;
                }
                if (this.config.currentWallet) {
                    this.currentWallet = this.config.currentWallet;
                }
            } else {
                this.config = {
                    apiUrl: API_BASE_URL,
                    currentWallet: null,
                    createdAt: new Date().toISOString()
                };
                await this.saveConfig();
            }
        } catch (error) {
            console.log('⚠️  Warning: Could not load config, using defaults');
            this.config = {
                apiUrl: API_BASE_URL,
                currentWallet: null,
                createdAt: new Date().toISOString()
            };
        }
    }

    async saveConfig() {
        try {
            await fs.writeJson(CLI_CONFIG_FILE, this.config, { spaces: 2 });
        } catch (error) {
            console.log('❌ Failed to save config:', error.message);
        }
    }

    async checkAPIConnection() {
        console.log('Checking API connection...');
        try {
            const response = await axios.get(`${this.apiUrl}/status`, { timeout: 5000 });
            if (response.data && response.data.success) {
                console.log('✅ API connection established');
                console.log(`   Connected to: ${this.apiUrl}`);
                console.log(`   Network: ${response.data.networkType || 'Unknown'}`);
                return true;
            } else {
                throw new Error('Invalid API response');
            }
        } catch (error) {
            console.log('❌ API connection failed');
            console.log(`   Error: ${error.message}`);
            console.log(`   Make sure your API server is running on ${this.apiUrl}`);
            console.log(`   Start with: cd E:\\XRPL-Dex-Wallet-Tokenization-App\\server && npm start`);
            return false;
        }
    }

    // Command handlers - Real implementations
    async handleSetup() {
        console.log('🚀 Interactive Setup Wizard\n');
        
        try {
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to do?',
                    choices: [
                        { name: '💼 Create a new wallet', value: 'create_wallet' },
                        { name: '📥 Import existing wallet', value: 'import_wallet' },
                        { name: '🎯 Select active wallet', value: 'select_wallet' },
                        { name: '🪙 Create RWA token', value: 'create_token' },
                        { name: '📜 List tokens', value: 'list_tokens' },
                        { name: '🏥 Check system health', value: 'health' },
                        { name: '❌ Exit setup', value: 'exit' }
                    ]
                }
            ]);

            const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
            const tokenCommands = new (require('./commands/token-commands'))(CLI_CONFIG_DIR);

            switch (action) {
                case 'create_wallet':
                    await walletCommands.createWallet();
                    break;
                case 'import_wallet':
                    await walletCommands.importWallet();
                    break;
                case 'select_wallet':
                    await walletCommands.selectWallet();
                    break;
                case 'create_token':
                    await tokenCommands.createToken();
                    break;
                case 'list_tokens':
                    await tokenCommands.listTokens();
                    break;
                case 'health':
                    await this.handleHealthCheck();
                    break;
                case 'exit':
                    console.log('Setup cancelled');
                    break;
            }
        } catch (error) {
            console.log('Setup failed:', error.message);
        }
    }

    async handleHealthCheck() {
        console.log('🏥 System Health Check\n');
        
        try {
            const response = await this.checkAPIConnection();
            
            if (response) {
                console.log('✅ All systems operational');
                
                // Check if wallet is configured
                const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
                const currentWallet = await walletCommands.getCurrentWallet();
                
                if (currentWallet) {
                    console.log(`✅ Active wallet: ${currentWallet.name}`);
                } else {
                    console.log('⚠️  No active wallet configured');
                    console.log('   Run: node xrpl-cli.js wallet:create');
                }
            }
        } catch (error) {
            console.log('❌ Health check failed:', error.message);
        }
    }

    async handleShowConfig() {
        console.log('⚙️  Current Configuration\n');
        
        try {
            console.log('CLI Configuration:');
            console.log(`   API URL: ${this.apiUrl}`);
            console.log(`   Config Directory: ${CLI_CONFIG_DIR}`);
            
            const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
            const currentWallet = await walletCommands.getCurrentWallet();
            
            if (currentWallet) {
                console.log('\nActive Wallet:');
                console.log(`   Name: ${currentWallet.name}`);
                console.log(`   Address: ${currentWallet.address}`);
            } else {
                console.log('\nActive Wallet: None configured');
            }
            
        } catch (error) {
            console.log('❌ Failed to show config:', error.message);
        }
    }

    async handleWalletCreate(options) {
        const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
        await walletCommands.createWallet(options);
    }

    async handleWalletImport(options) {
        const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
        await walletCommands.importWallet(options);
    }

    async handleWalletList() {
        const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
        await walletCommands.listWallets();
    }

    async handleWalletSelect(options) {
        const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
        await walletCommands.selectWallet(options);
    }

    async handleWalletBalance(options) {
        const walletCommands = new (require('./commands/wallet-commands'))(CLI_CONFIG_DIR);
        await walletCommands.getWalletBalance(options);
    }

    // Token commands - Real implementations
    async handleTokenCreate(options) {
        const tokenCommands = new (require('./commands/token-commands'))(CLI_CONFIG_DIR);
        await tokenCommands.createToken(options);
    }

    async handleTokenList() {
        const tokenCommands = new (require('./commands/token-commands'))(CLI_CONFIG_DIR);
        await tokenCommands.listTokens();
    }

    // Investment commands - Real implementations
    async handleInvestList() {
        const investmentCommands = new (require('./commands/investment-commands'))(CLI_CONFIG_DIR);
        await investmentCommands.listOpportunities();
    }

    async handleInvestTrustline(options) {
        const investmentCommands = new (require('./commands/investment-commands'))(CLI_CONFIG_DIR);
        await investmentCommands.createTrustline(options);
    }

    async handleInvestPurchase(options) {
        const investmentCommands = new (require('./commands/investment-commands'))(CLI_CONFIG_DIR);
        await investmentCommands.purchaseTokens(options);
    }

    async handleInvestPortfolio() {
        const investmentCommands = new (require('./commands/investment-commands'))(CLI_CONFIG_DIR);
        await investmentCommands.viewPortfolio();
    }

    // Network commands (placeholders for next step)
    async handleNetworkStatus() {
        console.log('🌐 Network status - Coming in next step...');
    }

    async handleNetworkInfo() {
        console.log('📊 Network info - Coming in next step...');
    }

    async run() {
        await this.init();
        
        // If no arguments provided, show help
        if (process.argv.length <= 2) {
            this.showCustomHelp();
            return;
        }
        
        // Parse and execute command
        await this.program.parseAsync(process.argv);
    }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.log('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Initialize and run CLI
const cli = new XRPLCli();
cli.run().catch(error => {
    console.log('❌ CLI Error:', error.message);
    process.exit(1);
});