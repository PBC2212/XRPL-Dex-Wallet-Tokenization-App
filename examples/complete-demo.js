/**
 * Complete XRPL Tokenization Demo
 * Demonstrates wallet creation, asset tokenization, and trustline management
 * Real Estate Tokenization Example
 */

const { getXRPLClient } = require('../src/utils/xrpl-client');
const WalletManager = require('../src/wallet/wallet-manager');
const TokenIssuer = require('../src/tokenization/token-issuer');
const TrustlineManager = require('../src/trustlines/trustline-manager');
require('dotenv').config();

class CompleteDemoRunner {
    constructor() {
        this.client = getXRPLClient();
        this.walletManager = new WalletManager();
        this.tokenIssuer = new TokenIssuer();
        this.trustlineManager = new TrustlineManager();
        
        // Demo participants
        this.issuerWallet = null;
        this.investorWallet = null;
        this.buyerWallet = null;
    }

    /**
     * Run the complete demo
     */
    async runDemo() {
        try {
            console.log('🎬 XRPL Real Estate Tokenization Demo');
            console.log('=====================================\n');

            await this.initialize();
            await this.createWallets();
            await this.createRealEstateToken();
            await this.setupTrustlines();
            await this.issueTokens();
            await this.demonstrateTransfers();
            await this.showFinalBalances();
            await this.cleanup();

            console.log('\n🎉 Demo completed successfully!');
            console.log('=====================================');

        } catch (error) {
            console.error('❌ Demo failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize the demo environment
     */
    async initialize() {
        console.log('🚀 Initializing XRPL connection...');
        await this.client.connect();
        console.log(`✅ Connected to ${this.client.getNetworkType()}\n`);
    }

    /**
     * Create demo wallets
     */
    async createWallets() {
        console.log('👛 Creating demo wallets...');
        
        // Create issuer wallet (property owner)
        const issuerResult = await this.walletManager.generateWallet({
            name: 'Property Owner',
            description: 'Real Estate Issuer - Miami Condo'
        });
        this.issuerWallet = this.walletManager.getWallet(issuerResult.walletInfo.id);
        
        console.log(`   🏢 Issuer (Property Owner): ${this.issuerWallet.address}`);
        console.log(`      Seed: ${issuerResult.sensitive.seed}`);

        // Create investor wallet
        const investorResult = await this.walletManager.generateWallet({
            name: 'Investor Alice',
            description: 'Real Estate Investor'
        });
        this.investorWallet = this.walletManager.getWallet(investorResult.walletInfo.id);
        
        console.log(`   👩‍💼 Investor: ${this.investorWallet.address}`);
        console.log(`      Seed: ${investorResult.sensitive.seed}`);

        // Create buyer wallet
        const buyerResult = await this.walletManager.generateWallet({
            name: 'Buyer Bob',
            description: 'Property Buyer'
        });
        this.buyerWallet = this.walletManager.getWallet(buyerResult.walletInfo.id);
        
        console.log(`   👨‍💼 Buyer: ${this.buyerWallet.address}`);
        console.log(`      Seed: ${buyerResult.sensitive.seed}`);

        console.log('\n💡 To fund these wallets, visit:');
        console.log('   https://xrpl.org/xrp-testnet-faucet.html');
        console.log('   Fund each address with test XRP to continue the demo.\n');
        
        // Wait for user to fund wallets
        await this.waitForFunding();
    }

    /**
     * Wait for wallets to be funded
     */
    async waitForFunding() {
        console.log('⏳ Waiting for wallets to be funded...');
        
        const wallets = [
            { name: 'Issuer', wallet: this.issuerWallet },
            { name: 'Investor', wallet: this.investorWallet },
            { name: 'Buyer', wallet: this.buyerWallet }
        ];

        for (const { name, wallet } of wallets) {
            let funded = false;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout

            while (!funded && attempts < maxAttempts) {
                try {
                    const balance = await this.client.getXRPBalance(wallet.address);
                    if (parseFloat(balance) > 0) {
                        console.log(`   ✅ ${name} funded: ${balance} XRP`);
                        funded = true;
                    } else {
                        attempts++;
                        await this.delay(1000); // Wait 1 second
                    }
                } catch (error) {
                    attempts++;
                    await this.delay(1000);
                }
            }

            if (!funded) {
                throw new Error(`${name} wallet not funded after ${maxAttempts} seconds. Please fund manually.`);
            }
        }

        console.log('✅ All wallets funded!\n');
    }

    /**
     * Create real estate token
     */
    async createRealEstateToken() {
        console.log('🏠 Creating Real Estate Token...');
        
        const realEstateMetadata = {
            type: 'Real Estate',
            property: {
                address: '123 Ocean Drive, Miami Beach, FL 33139',
                propertyType: 'Luxury Condominium',
                bedrooms: 3,
                bathrooms: 2,
                squareFeet: 1850,
                yearBuilt: 2020
            },
            financial: {
                purchasePrice: '750000 USD',
                currentValuation: '800000 USD',
                tokenSupply: 1000000,
                pricePerToken: '0.80 USD'
            },
            legal: {
                deed: 'ipfs://QmRealEstateDeedHash123',
                appraisal: 'ipfs://QmAppraisalReport456',
                inspection: 'ipfs://QmInspectionReport789'
            },
            created: new Date().toISOString(),
            issuer: 'Miami Properties LLC'
        };

        const tokenData = {
            currencyCode: 'MIA', // Miami property token
            name: 'Miami Beach Condo Token',
            symbol: 'MIABC',
            description: 'Fractional ownership of luxury Miami Beach condominium',
            decimals: 6,
            totalSupply: '1000000',
            metadata: realEstateMetadata,
            settings: {
                requireAuth: false,
                defaultRipple: false,
                transferRate: 1002000000 // 0.2% transfer fee
            }
        };

        const issuerXrplWallet = this.walletManager.getXRPLWallet(this.issuerWallet.id);
        const result = await this.tokenIssuer.createToken(tokenData, issuerXrplWallet);
        
        this.tokenInfo = result.tokenInfo;
        
        console.log(`   ✅ Token Created: ${this.tokenInfo.currencyCode}`);
        console.log(`   🆔 Token ID: ${this.tokenInfo.tokenId}`);
        console.log(`   🏢 Represents: ${realEstateMetadata.property.address}`);
        console.log(`   💰 Total Supply: ${this.tokenInfo.totalSupply} tokens`);
        console.log(`   📄 Metadata includes deed, appraisal, and inspection documents\n`);
    }

    /**
     * Set up trustlines for token holders
     */
    async setupTrustlines() {
        console.log('🤝 Setting up trustlines...');
        
        // Investor trustline
        const investorTrustlineData = {
            currencyCode: this.tokenInfo.currencyCode,
            issuerAddress: this.tokenInfo.issuer,
            limitAmount: '500000' // Can hold up to 500K tokens (62.5% of property)
        };
        
        const investorXrplWallet = this.walletManager.getXRPLWallet(this.investorWallet.id);
        const investorTrustlineResult = await this.trustlineManager.createTrustline(
            investorTrustlineData, 
            investorXrplWallet
        );
        
        console.log(`   ✅ Investor trustline: ${investorTrustlineResult.transactionHash}`);
        
        // Buyer trustline
        const buyerTrustlineData = {
            currencyCode: this.tokenInfo.currencyCode,
            issuerAddress: this.tokenInfo.issuer,
            limitAmount: '1000000' // Can hold all tokens (100% of property)
        };
        
        const buyerXrplWallet = this.walletManager.getXRPLWallet(this.buyerWallet.id);
        const buyerTrustlineResult = await this.trustlineManager.createTrustline(
            buyerTrustlineData, 
            buyerXrplWallet
        );
        
        console.log(`   ✅ Buyer trustline: ${buyerTrustlineResult.transactionHash}\n`);
    }

    /**
     * Issue tokens to initial investors
     */
    async issueTokens() {
        console.log('💸 Issuing tokens to investors...');
        
        // Issue 300,000 tokens to investor (30% ownership)
        const issuerXrplWallet = this.walletManager.getXRPLWallet(this.issuerWallet.id);
        
        const investorIssuance = await this.tokenIssuer.issueTokens(
            this.tokenInfo.tokenId,
            this.investorWallet.address,
            '300000',
            issuerXrplWallet,
            {
                memo: JSON.stringify({
                    type: 'initial_investment',
                    ownership_percentage: 30,
                    investment_amount: '240000 USD',
                    date: new Date().toISOString()
                })
            }
        );
        
        console.log(`   ✅ Issued 300,000 ${this.tokenInfo.currencyCode} to Investor`);
        console.log(`   💰 Represents 30% ownership ($240,000 investment)`);
        console.log(`   📝 TX: ${investorIssuance.transactionHash}\n`);
    }

    /**
     * Demonstrate token transfers (secondary market)
     */
    async demonstrateTransfers() {
        console.log('🔄 Demonstrating secondary market transfer...');
        
        // Investor sells 100,000 tokens to buyer
        const investorXrplWallet = this.walletManager.getXRPLWallet(this.investorWallet.id);
        
        const transferPayment = {
            TransactionType: 'Payment',
            Account: this.investorWallet.address,
            Destination: this.buyerWallet.address,
            Amount: {
                currency: this.tokenInfo.currencyCode,
                value: '100000',
                issuer: this.tokenInfo.issuer
            },
            Memos: [
                {
                    Memo: {
                        MemoType: Buffer.from('property_sale', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(JSON.stringify({
                            type: 'secondary_sale',
                            tokens_sold: 100000,
                            ownership_transferred: '10%',
                            sale_price: '85000 USD',
                            price_per_token: '0.85 USD',
                            date: new Date().toISOString()
                        }), 'utf8').toString('hex').toUpperCase()
                    }
                }
            ]
        };
        
        const transferResult = await this.client.submitAndWait(transferPayment, investorXrplWallet);
        
        console.log(`   ✅ Transferred 100,000 ${this.tokenInfo.currencyCode} tokens`);
        console.log(`   👩‍💼 From: Investor → 👨‍💼 Buyer`);
        console.log(`   🏠 Represents 10% property ownership transfer`);
        console.log(`   💵 Sale price: $85,000 ($0.85 per token)`);
        console.log(`   📝 TX: ${transferResult.result.hash}\n`);
    }

    /**
     * Show final balances and ownership distribution
     */
    async showFinalBalances() {
        console.log('📊 Final ownership distribution:');
        console.log('================================');
        
        // Get balances
        const issuerBalance = await this.tokenIssuer.getTokenBalance(
            this.issuerWallet.address,
            this.tokenInfo.currencyCode,
            this.tokenInfo.issuer
        );
        
        const investorBalance = await this.tokenIssuer.getTokenBalance(
            this.investorWallet.address,
            this.tokenInfo.currencyCode,
            this.tokenInfo.issuer
        );
        
        const buyerBalance = await this.tokenIssuer.getTokenBalance(
            this.buyerWallet.address,
            this.tokenInfo.currencyCode,
            this.tokenInfo.issuer
        );
        
        const totalIssued = parseFloat(investorBalance) + parseFloat(buyerBalance);
        const remainingSupply = 1000000 - totalIssued;
        
        console.log(`🏢 Property Owner (Issuer): ${issuerBalance} ${this.tokenInfo.currencyCode} (${(parseFloat(issuerBalance)/10000).toFixed(1)}%)`);
        console.log(`👩‍💼 Investor Alice: ${investorBalance} ${this.tokenInfo.currencyCode} (${(parseFloat(investorBalance)/10000).toFixed(1)}%)`);
        console.log(`👨‍💼 Buyer Bob: ${buyerBalance} ${this.tokenInfo.currencyCode} (${(parseFloat(buyerBalance)/10000).toFixed(1)}%)`);
        console.log(`🔒 Remaining Supply: ${remainingSupply} ${this.tokenInfo.currencyCode} (${(remainingSupply/10000).toFixed(1)}%)`);
        
        console.log('\n📈 Property Information:');
        console.log(`   Address: ${this.tokenInfo.metadata.property.address}`);
        console.log(`   Current Value: ${this.tokenInfo.metadata.financial.currentValuation}`);
        console.log(`   Total Tokens: ${this.tokenInfo.totalSupply}`);
        console.log(`   Tokens Issued: ${totalIssued}`);
        
        console.log('\n💼 Investment Summary:');
        console.log(`   • Investor Alice owns ${(parseFloat(investorBalance)/10000).toFixed(1)}% of the property`);
        console.log(`   • Buyer Bob owns ${(parseFloat(buyerBalance)/10000).toFixed(1)}% of the property`);
        console.log(`   • Property Owner retains ${(remainingSupply/10000).toFixed(1)}% ownership`);
        console.log(`   • Secondary market transaction completed successfully`);
    }

    /**
     * Generate QR codes for wallet addresses
     */
    async generateQRCodes() {
        console.log('\n📱 Generating QR codes for wallet addresses...');
        
        const wallets = [
            { name: 'Issuer', wallet: this.issuerWallet },
            { name: 'Investor', wallet: this.investorWallet },
            { name: 'Buyer', wallet: this.buyerWallet }
        ];

        for (const { name, wallet } of wallets) {
            try {
                const qrResult = await this.walletManager.generateQRCode(wallet.id, {
                    width: 200,
                    saveToFile: true
                });
                console.log(`   ✅ ${name} QR code: ${qrResult.qrFilePath}`);
            } catch (error) {
                console.log(`   ❌ ${name} QR code failed: ${error.message}`);
            }
        }
    }

    /**
     * Export wallet keystores
     */
    async exportKeystores() {
        console.log('\n🔐 Exporting encrypted wallet keystores...');
        
        const wallets = [
            { name: 'Issuer', wallet: this.issuerWallet },
            { name: 'Investor', wallet: this.investorWallet },
            { name: 'Buyer', wallet: this.buyerWallet }
        ];

        for (const { name, wallet } of wallets) {
            try {
                const exportResult = await this.walletManager.exportKeystore(
                    wallet.id, 
                    'demo-password-123',
                    `demo-${name.toLowerCase()}-keystore.json`
                );
                console.log(`   ✅ ${name} keystore: ${exportResult.filePath}`);
            } catch (error) {
                console.log(`   ❌ ${name} keystore failed: ${error.message}`);
            }
        }
    }

    /**
     * Cleanup and show summary
     */
    async cleanup() {
        console.log('\n🧹 Demo cleanup...');
        
        // Generate QR codes
        await this.generateQRCodes();
        
        // Export keystores
        await this.exportKeystores();
        
        // Show trustline stats
        console.log('\n📊 Trustline Statistics:');
        try {
            const investorStats = await this.trustlineManager.getTrustlineStats(this.investorWallet.address);
            const buyerStats = await this.trustlineManager.getTrustlineStats(this.buyerWallet.address);
            
            console.log(`   Investor trustlines: ${investorStats.total} (${investorStats.withBalance} with balance)`);
            console.log(`   Buyer trustlines: ${buyerStats.total} (${buyerStats.withBalance} with balance)`);
        } catch (error) {
            console.log(`   ❌ Stats failed: ${error.message}`);
        }
        
        console.log('\n📋 Demo artifacts created:');
        console.log('   • 3 XRPL wallets with QR codes');
        console.log('   • 1 Real estate token (MIA)');
        console.log('   • 2 Trustlines established');
        console.log('   • Token issuance transaction');
        console.log('   • Secondary market transfer');
        console.log('   • Encrypted wallet backups');
        
        await this.client.disconnect();
    }

    /**
     * Utility function to add delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run demo if called directly
if (require.main === module) {
    const demo = new CompleteDemoRunner();
    demo.runDemo().catch(error => {
        console.error('Demo failed:', error);
        process.exit(1);
    });
}

module.exports = CompleteDemoRunner;