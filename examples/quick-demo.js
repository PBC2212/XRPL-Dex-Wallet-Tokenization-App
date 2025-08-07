/**
 * Quick XRPL Demo
 * Fast demonstration of core functionality
 */

const { getXRPLClient } = require('../src/utils/xrpl-client');
const WalletManager = require('../src/wallet/wallet-manager');
const TokenIssuer = require('../src/tokenization/token-issuer');
const TrustlineManager = require('../src/trustlines/trustline-manager');
require('dotenv').config();

async function quickDemo() {
    console.log('⚡ Quick XRPL Demo');
    console.log('==================\n');

    try {
        // Initialize
        const client = getXRPLClient();
        const walletManager = new WalletManager();
        const tokenIssuer = new TokenIssuer();
        const trustlineManager = new TrustlineManager();

        await client.connect();
        console.log('✅ Connected to XRPL\n');

        // Create wallets
        console.log('👛 Creating wallets...');
        const issuer = await walletManager.generateWallet({ name: 'Quick Demo Issuer' });
        const holder = await walletManager.generateWallet({ name: 'Quick Demo Holder' });

        console.log(`Issuer: ${issuer.walletInfo.address}`);
        console.log(`Holder: ${holder.walletInfo.address}`);
        console.log(`Issuer Seed: ${issuer.sensitive.seed}`);
        console.log(`Holder Seed: ${holder.sensitive.seed}\n`);

        // Check if accounts are funded
        console.log('💰 Checking balances...');
        try {
            const issuerBalance = await client.getXRPBalance(issuer.walletInfo.address);
            const holderBalance = await client.getXRPBalance(holder.walletInfo.address);
            console.log(`Issuer balance: ${issuerBalance} XRP`);
            console.log(`Holder balance: ${holderBalance} XRP\n`);

            if (parseFloat(issuerBalance) < 10 || parseFloat(holderBalance) < 10) {
                console.log('⚠️ Low balances detected. Fund wallets at:');
                console.log('https://xrpl.org/xrp-testnet-faucet.html\n');
                return;
            }

            // Create token
            console.log('🪙 Creating token...');
            const tokenData = {
                currencyCode: 'QDT', // Quick Demo Token
                name: 'Quick Demo Token',
                symbol: 'QDT',
                description: 'Demonstration token for quick testing'
            };

            const issuerWallet = walletManager.getXRPLWallet(issuer.walletInfo.id);
            const tokenResult = await tokenIssuer.createToken(tokenData, issuerWallet);
            console.log(`✅ Token created: ${tokenResult.tokenInfo.currencyCode}\n`);

            // Create trustline
            console.log('🤝 Creating trustline...');
            const trustlineData = {
                currencyCode: 'QDT',
                issuerAddress: issuer.walletInfo.address,
                limitAmount: '1000000'
            };

            const holderWallet = walletManager.getXRPLWallet(holder.walletInfo.id);
            const trustlineResult = await trustlineManager.createTrustline(trustlineData, holderWallet);
            console.log(`✅ Trustline created: ${trustlineResult.transactionHash}\n`);

            // Issue tokens
            console.log('💸 Issuing tokens...');
            const issuanceResult = await tokenIssuer.issueTokens(
                tokenResult.tokenId,
                holder.walletInfo.address,
                '500000',
                issuerWallet
            );
            console.log(`✅ Issued 500,000 QDT tokens: ${issuanceResult.transactionHash}\n`);

            // Check final balance
            console.log('📊 Final token balance:');
            const tokenBalance = await tokenIssuer.getTokenBalance(
                holder.walletInfo.address,
                'QDT',
                issuer.walletInfo.address
            );
            console.log(`Holder QDT balance: ${tokenBalance}\n`);

        } catch (error) {
            if (error.message.includes('Account not found')) {
                console.log('❌ Accounts not funded. Please fund wallets and try again.\n');
                console.log('Fund these addresses at https://xrpl.org/xrp-testnet-faucet.html:');
                console.log(`- ${issuer.walletInfo.address}`);
                console.log(`- ${holder.walletInfo.address}\n`);
            } else {
                throw error;
            }
        }

        await client.disconnect();
        console.log('✅ Demo completed successfully!');

    } catch (error) {
        console.error('❌ Demo failed:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    quickDemo();
}

module.exports = quickDemo;