/**
 * XRPL Tokenization Application
 * Production-ready XRPL wallet, tokenization, and trustline management
 */

const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');

// Import all modules
const { getXRPLClient } = require('./utils/xrpl-client');
const XRPLValidators = require('./utils/validators');
const WalletManager = require('./wallet/wallet-manager');
const TokenIssuer = require('./tokenization/token-issuer');
const TrustlineManager = require('./trustlines/trustline-manager');
const XRPL_CONFIG = require('../config/xrpl-config');

require('dotenv').config();

class XRPLApp {
    constructor() {
        this.client = getXRPLClient();
        this.walletManager = new WalletManager();
        this.tokenIssuer = new TokenIssuer();
        this.trustlineManager = new TrustlineManager();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.currentWallet = null;
        this.isRunning = false;
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('🚀 XRPL Tokenization Application Starting...');
            console.log('==========================================');
            
            // Connect to XRPL network
            await this.client.connect();
            
            console.log(`📊 Network: ${this.client.getNetworkType()}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('==========================================');
            
            this.isRunning = true;
            
        } catch (error) {
            console.error('❌ Failed to initialize application:', error.message);
            process.exit(1);
        }
    }

    /**
     * Start the interactive CLI
     */
    async start() {
        await this.initialize();
        await this.showMainMenu();
    }

    /**
     * Show main menu
     */
    async showMainMenu() {
        while (this.isRunning) {
            console.log('\n📋 MAIN MENU');
            console.log('==============');
            console.log('1. 👛 Wallet Management');
            console.log('2. 🪙 Token Operations');
            console.log('3. 🤝 Trustline Management');
            console.log('4. 💰 Balance & Info Queries');
            console.log('5. 🔧 Utilities');
            console.log('6. ❌ Exit');
            
            if (this.currentWallet) {
                console.log(`\n🔑 Current Wallet: ${this.currentWallet.address} (${this.currentWallet.metadata.name})`);
            }
            
            const choice = await this.prompt('\nSelect option (1-6): ');
            
            try {
                switch (choice) {
                    case '1':
                        await this.walletMenu();
                        break;
                    case '2':
                        await this.tokenMenu();
                        break;
                    case '3':
                        await this.trustlineMenu();
                        break;
                    case '4':
                        await this.queryMenu();
                        break;
                    case '5':
                        await this.utilitiesMenu();
                        break;
                    case '6':
                        await this.exit();
                        break;
                    default:
                        console.log('❌ Invalid option. Please try again.');
                }
            } catch (error) {
                console.error('❌ Error:', error.message);
                await this.prompt('Press Enter to continue...');
            }
        }
    }

    /**
     * Wallet management menu
     */
    async walletMenu() {
        console.log('\n👛 WALLET MANAGEMENT');
        console.log('====================');
        console.log('1. Generate New Wallet');
        console.log('2. Import Wallet from Seed');
        console.log('3. Export Wallet (Keystore)');
        console.log('4. Import from Keystore');
        console.log('5. Generate QR Code');
        console.log('6. List Wallets');
        console.log('7. Select Active Wallet');
        console.log('8. Back to Main Menu');
        
        const choice = await this.prompt('Select option: ');
        
        switch (choice) {
            case '1':
                await this.generateWallet();
                break;
            case '2':
                await this.importWalletFromSeed();
                break;
            case '3':
                await this.exportWallet();
                break;
            case '4':
                await this.importWalletFromKeystore();
                break;
            case '5':
                await this.generateQRCode();
                break;
            case '6':
                await this.listWallets();
                break;
            case '7':
                await this.selectWallet();
                break;
            case '8':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    /**
     * Token operations menu
     */
    async tokenMenu() {
        if (!this.currentWallet) {
            console.log('❌ Please select a wallet first.');
            return;
        }

        console.log('\n🪙 TOKEN OPERATIONS');
        console.log('==================');
        console.log('1. Create New Token');
        console.log('2. Issue Tokens');
        console.log('3. Burn Tokens');
        console.log('4. List Tokens');
        console.log('5. Get Token Info');
        console.log('6. Back to Main Menu');
        
        const choice = await this.prompt('Select option: ');
        
        switch (choice) {
            case '1':
                await this.createToken();
                break;
            case '2':
                await this.issueTokens();
                break;
            case '3':
                await this.burnTokens();
                break;
            case '4':
                await this.listTokens();
                break;
            case '5':
                await this.getTokenInfo();
                break;
            case '6':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    /**
     * Trustline management menu
     */
    async trustlineMenu() {
        if (!this.currentWallet) {
            console.log('❌ Please select a wallet first.');
            return;
        }

        console.log('\n🤝 TRUSTLINE MANAGEMENT');
        console.log('=======================');
        console.log('1. Create Trustline');
        console.log('2. Modify Trustline');
        console.log('3. Remove Trustline');
        console.log('4. List Trustlines');
        console.log('5. Check Trustline Capability');
        console.log('6. Get Trustline Stats');
        console.log('7. Back to Main Menu');
        
        const choice = await this.prompt('Select option: ');
        
        switch (choice) {
            case '1':
                await this.createTrustline();
                break;
            case '2':
                await this.modifyTrustline();
                break;
            case '3':
                await this.removeTrustline();
                break;
            case '4':
                await this.listTrustlines();
                break;
            case '5':
                await this.checkTrustlineCapability();
                break;
            case '6':
                await this.getTrustlineStats();
                break;
            case '7':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    /**
     * Query menu for balance and info
     */
    async queryMenu() {
        console.log('\n💰 BALANCE & INFO QUERIES');
        console.log('=========================');
        console.log('1. Get XRP Balance');
        console.log('2. Get Token Balance');
        console.log('3. Get Account Info');
        console.log('4. Get Transaction History');
        console.log('5. Validate Address');
        console.log('6. Back to Main Menu');
        
        const choice = await this.prompt('Select option: ');
        
        switch (choice) {
            case '1':
                await this.getXRPBalance();
                break;
            case '2':
                await this.getTokenBalance();
                break;
            case '3':
                await this.getAccountInfo();
                break;
            case '4':
                await this.getTransactionHistory();
                break;
            case '5':
                await this.validateAddress();
                break;
            case '6':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    /**
     * Utilities menu
     */
    async utilitiesMenu() {
        console.log('\n🔧 UTILITIES');
        console.log('============');
        console.log('1. Network Information');
        console.log('2. Generate Test Credentials');
        console.log('3. Clear Cache');
        console.log('4. Export Application State');
        console.log('5. Import Application State');
        console.log('6. Back to Main Menu');
        
        const choice = await this.prompt('Select option: ');
        
        switch (choice) {
            case '1':
                await this.showNetworkInfo();
                break;
            case '2':
                await this.generateTestCredentials();
                break;
            case '3':
                await this.clearCache();
                break;
            case '4':
                await this.exportAppState();
                break;
            case '5':
                await this.importAppState();
                break;
            case '6':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    // Wallet Management Methods
    async generateWallet() {
        console.log('\n🔐 Generating New Wallet...');
        
        const name = await this.prompt('Wallet name (optional): ') || undefined;
        const description = await this.prompt('Description (optional): ') || undefined;
        
        const options = {};
        if (name) options.name = name;
        if (description) options.description = description;
        
        const result = await this.walletManager.generateWallet(options);
        
        console.log('\n✅ Wallet Generated Successfully!');
        console.log(`Address: ${result.walletInfo.address}`);
        console.log(`Wallet ID: ${result.walletInfo.id}`);
        console.log('\n🔒 IMPORTANT - SAVE THESE SECURELY:');
        console.log(`Seed: ${result.sensitive.seed}`);
        console.log(`Private Key: ${result.sensitive.privateKey}`);
        
        const setActive = await this.prompt('Set as active wallet? (y/n): ');
        if (setActive.toLowerCase() === 'y') {
            this.currentWallet = this.walletManager.getWallet(result.walletInfo.id);
        }
    }

    async importWalletFromSeed() {
        console.log('\n📥 Import Wallet from Seed...');
        
        const seed = await this.prompt('Enter wallet seed: ');
        const name = await this.prompt('Wallet name (optional): ') || undefined;
        
        const options = {};
        if (name) options.name = name;
        
        const result = await this.walletManager.importWallet(seed, options);
        
        console.log('\n✅ Wallet Imported Successfully!');
        console.log(`Address: ${result.walletInfo.address}`);
        console.log(`Wallet ID: ${result.walletInfo.id}`);
        
        const setActive = await this.prompt('Set as active wallet? (y/n): ');
        if (setActive.toLowerCase() === 'y') {
            this.currentWallet = this.walletManager.getWallet(result.walletInfo.id);
        }
    }

    async exportWallet() {
        if (!this.currentWallet) {
            console.log('❌ No active wallet to export.');
            return;
        }
        
        console.log('\n🔒 Export Wallet as Keystore...');
        
        const password = await this.prompt('Enter encryption password (min 8 chars): ');
        if (password.length < 8) {
            console.log('❌ Password must be at least 8 characters.');
            return;
        }
        
        const filename = await this.prompt('Filename (optional): ') || undefined;
        
        const result = await this.walletManager.exportKeystore(this.currentWallet.id, password, filename);
        
        console.log('\n✅ Wallet Exported Successfully!');
        console.log(`File: ${result.filePath}`);
    }

    async listWallets() {
        const wallets = this.walletManager.listWallets();
        
        if (wallets.length === 0) {
            console.log('\n📭 No wallets found.');
            return;
        }
        
        console.log('\n👛 Active Wallets:');
        console.log('==================');
        
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const isActive = this.currentWallet && this.currentWallet.id === wallet.id;
            const marker = isActive ? '🔑' : '  ';
            
            console.log(`${marker} ${i + 1}. ${wallet.metadata.name}`);
            console.log(`     Address: ${wallet.address}`);
            console.log(`     Network: ${wallet.network}`);
            console.log(`     Created: ${new Date(wallet.createdAt).toLocaleString()}`);
            console.log('');
        }
    }

    async selectWallet() {
        const wallets = this.walletManager.listWallets();
        
        if (wallets.length === 0) {
            console.log('❌ No wallets available.');
            return;
        }
        
        await this.listWallets();
        
        const choice = await this.prompt(`Select wallet (1-${wallets.length}): `);
        const index = parseInt(choice) - 1;
        
        if (index >= 0 && index < wallets.length) {
            const selectedWallet = wallets[index];
            this.currentWallet = this.walletManager.getWallet(selectedWallet.id);
            console.log(`✅ Active wallet set to: ${selectedWallet.metadata.name} (${selectedWallet.address})`);
        } else {
            console.log('❌ Invalid selection.');
        }
    }

    // Token Operations Methods
    async createToken() {
        console.log('\n🪙 Create New Token...');
        
        const currencyCode = await this.prompt('Currency code (3 chars, e.g., USD): ');
        const name = await this.prompt('Token name: ');
        const symbol = await this.prompt('Token symbol: ') || currencyCode;
        const description = await this.prompt('Description: ') || '';
        const decimals = await this.prompt('Decimals (default 6): ') || '6';
        const ipfsHash = await this.prompt('IPFS hash (optional): ') || undefined;
        
        const tokenData = {
            currencyCode,
            name,
            symbol,
            description,
            decimals: parseInt(decimals),
            ipfsHash
        };
        
        const issuerWallet = this.walletManager.getXRPLWallet(this.currentWallet.id);
        const result = await this.tokenIssuer.createToken(tokenData, issuerWallet);
        
        console.log('\n✅ Token Created Successfully!');
        console.log(`Token ID: ${result.tokenId}`);
        console.log(`Currency: ${result.tokenInfo.currencyCode}`);
        console.log(`Issuer: ${result.tokenInfo.issuer}`);
    }

    async createTrustline() {
        console.log('\n🤝 Create Trustline...');
        
        const currencyCode = await this.prompt('Currency code: ');
        const issuerAddress = await this.prompt('Issuer address: ');
        const limitAmount = await this.prompt('Trust limit: ');
        
        const trustlineData = {
            currencyCode,
            issuerAddress,
            limitAmount
        };
        
        const userWallet = this.walletManager.getXRPLWallet(this.currentWallet.id);
        const result = await this.trustlineManager.createTrustline(trustlineData, userWallet);
        
        console.log('\n✅ Trustline Created Successfully!');
        console.log(`TX Hash: ${result.transactionHash}`);
    }

    // Utility Methods
    async getXRPBalance() {
        let address;
        
        if (this.currentWallet) {
            address = this.currentWallet.address;
        } else {
            address = await this.prompt('Enter XRP address: ');
        }
        
        const balance = await this.client.getXRPBalance(address);
        console.log(`\n💰 XRP Balance: ${balance} XRP`);
    }

    async validateAddress() {
        const address = await this.prompt('Enter address to validate: ');
        const validation = XRPLValidators.validateAddress(address);
        
        if (validation.isValid) {
            console.log('✅ Valid XRP address');
        } else {
            console.log(`❌ Invalid address: ${validation.error}`);
        }
    }

    async showNetworkInfo() {
        try {
            const serverInfo = await this.client.getClient().request({
                command: 'server_info'
            });
            
            console.log('\n🌐 Network Information:');
            console.log('=======================');
            console.log(`Network: ${this.client.getNetworkType()}`);
            console.log(`Ledger Index: ${serverInfo.result.info.validated_ledger.seq}`);
            console.log(`Base Reserve: ${serverInfo.result.info.validated_ledger.reserve_base_xrp} XRP`);
            console.log(`Owner Reserve: ${serverInfo.result.info.validated_ledger.reserve_inc_xrp} XRP`);
            console.log(`Server Version: ${serverInfo.result.info.build_version}`);
            
        } catch (error) {
            console.error('❌ Failed to get network info:', error.message);
        }
    }

    async clearCache() {
        this.trustlineManager.clearCache();
        console.log('✅ All caches cleared.');
    }

    /**
     * Prompt user for input
     * @param {string} question - Question to ask
     * @returns {Promise<string>} User input
     */
    prompt(question) {
        return new Promise(resolve => {
            this.rl.question(question, resolve);
        });
    }

    /**
     * Exit application gracefully
     */
    async exit() {
        console.log('\n👋 Goodbye!');
        this.isRunning = false;
        
        try {
            await this.client.disconnect();
        } catch (error) {
            console.error('Error during cleanup:', error.message);
        }
        
        this.rl.close();
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received interrupt signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start application if run directly
if (require.main === module) {
    const app = new XRPLApp();
    app.start().catch(error => {
        console.error('❌ Application failed to start:', error.message);
        process.exit(1);
    });
}

module.exports = XRPLApp;