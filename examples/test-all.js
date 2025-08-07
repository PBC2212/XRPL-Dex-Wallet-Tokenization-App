/**
 * Test All Components
 * Comprehensive test of all XRPL application components
 */

const { getXRPLClient } = require('../src/utils/xrpl-client');
const XRPLValidators = require('../src/utils/validators');
const WalletManager = require('../src/wallet/wallet-manager');
const TokenIssuer = require('../src/tokenization/token-issuer');
const TrustlineManager = require('../src/trustlines/trustline-manager');
require('dotenv').config();

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    /**
     * Add a test
     */
    addTest(name, testFunction) {
        this.tests.push({ name, testFunction });
    }

    /**
     * Run all tests
     */
    async runTests() {
        console.log('🧪 XRPL Application Test Suite');
        console.log('===============================\n');

        for (const test of this.tests) {
            try {
                console.log(`Testing: ${test.name}...`);
                await test.testFunction();
                console.log(`✅ PASS: ${test.name}\n`);
                this.passed++;
            } catch (error) {
                console.log(`❌ FAIL: ${test.name}`);
                console.log(`   Error: ${error.message}\n`);
                this.failed++;
            }
        }

        this.showResults();
    }

    /**
     * Show test results
     */
    showResults() {
        console.log('📊 Test Results');
        console.log('================');
        console.log(`✅ Passed: ${this.passed}`);
        console.log(`❌ Failed: ${this.failed}`);
        console.log(`📊 Total: ${this.tests.length}`);
        
        if (this.failed === 0) {
            console.log('\n🎉 All tests passed! Application is ready for use.');
        } else {
            console.log('\n⚠️ Some tests failed. Please check the errors above.');
        }
    }
}

// Test Functions
async function testXRPLConnection() {
    const client = getXRPLClient();
    await client.connect();
    
    if (!client.isClientConnected()) {
        throw new Error('Failed to connect to XRPL network');
    }
    
    await client.disconnect();
}

async function testValidators() {
    // Test address validation
    const validAddress = XRPLValidators.validateAddress('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH');
    if (!validAddress.isValid) {
        throw new Error('Valid address validation failed');
    }

    const invalidAddress = XRPLValidators.validateAddress('invalid');
    if (invalidAddress.isValid) {
        throw new Error('Invalid address validation failed');
    }

    // Test currency validation
    const validCurrency = XRPLValidators.validateCurrencyCode('USD');
    if (!validCurrency.isValid) {
        throw new Error('Valid currency validation failed');
    }

    const invalidCurrency = XRPLValidators.validateCurrencyCode('INVALID_CURRENCY');
    if (invalidCurrency.isValid) {
        throw new Error('Invalid currency validation failed');
    }

    // Test amount validation
    const validAmount = XRPLValidators.validateAmount('100', 'XRP');
    if (!validAmount.isValid) {
        throw new Error('Valid amount validation failed');
    }

    const invalidAmount = XRPLValidators.validateAmount('-100', 'XRP');
    if (invalidAmount.isValid) {
        throw new Error('Invalid amount validation failed');
    }
}

async function testWalletGeneration() {
    const walletManager = new WalletManager();
    
    const result = await walletManager.generateWallet({
        name: 'Test Wallet',
        description: 'Test wallet for validation'
    });

    if (!result.success) {
        throw new Error('Wallet generation failed');
    }

    if (!result.walletInfo.address.startsWith('r')) {
        throw new Error('Invalid wallet address format');
    }

    if (!result.sensitive.seed.startsWith('s')) {
        throw new Error('Invalid wallet seed format');
    }

    // Test wallet retrieval
    const wallet = walletManager.getWallet(result.walletInfo.id);
    if (!wallet) {
        throw new Error('Failed to retrieve generated wallet');
    }

    // Clean up
    walletManager.removeWallet(result.walletInfo.id);
}

async function testWalletImport() {
    const walletManager = new WalletManager();
    
    // Generate a wallet first to get a valid seed
    const generated = await walletManager.generateWallet({ name: 'Temp' });
    const seed = generated.sensitive.seed;
    
    // Remove the generated wallet
    walletManager.removeWallet(generated.walletInfo.id);
    
    // Import using the seed
    const imported = await walletManager.importWallet(seed, {
        name: 'Imported Test Wallet'
    });

    if (!imported.success) {
        throw new Error('Wallet import failed');
    }

    if (imported.walletInfo.address !== generated.walletInfo.address) {
        throw new Error('Imported wallet address mismatch');
    }

    // Clean up
    walletManager.removeWallet(imported.walletInfo.id);
}

async function testQRCodeGeneration() {
    const walletManager = new WalletManager();
    
    const wallet = await walletManager.generateWallet({ name: 'QR Test' });
    
    const qrResult = await walletManager.generateQRCode(wallet.walletInfo.id, {
        saveToFile: false // Don't save file during test
    });

    if (!qrResult.success) {
        throw new Error('QR code generation failed');
    }

    if (!qrResult.qrDataURL.startsWith('data:image/png;base64,')) {
        throw new Error('Invalid QR code data URL format');
    }

    // Clean up
    walletManager.removeWallet(wallet.walletInfo.id);
}

async function testTokenDataValidation() {
    const tokenData = {
        currencyCode: 'TST',
        issuer: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
        metadata: {
            name: 'Test Token',
            description: 'Token for testing'
        }
    };

    const validation = XRPLValidators.validateTokenData(tokenData);
    
    if (!validation.isValid) {
        throw new Error(`Token validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.validated.currencyCode !== 'TST') {
        throw new Error('Token currency code validation failed');
    }
}

async function testTrustlineDataValidation() {
    const trustlineManager = new TrustlineManager();
    
    const trustlineData = {
        currencyCode: 'USD',
        issuerAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
        limitAmount: '1000000'
    };

    const validation = await trustlineManager.validateTrustlineData(trustlineData);
    
    if (!validation.isValid) {
        throw new Error(`Trustline validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.validated.currencyCode !== 'USD') {
        throw new Error('Trustline currency validation failed');
    }
}

async function testEncryptionDecryption() {
    const walletManager = new WalletManager();
    
    // Generate wallet
    const wallet = await walletManager.generateWallet({ name: 'Encryption Test' });
    
    // Export keystore
    const password = 'test-password-123';
    const exportResult = await walletManager.exportKeystore(
        wallet.walletInfo.id, 
        password,
        'test-keystore.json'
    );

    if (!exportResult.success) {
        throw new Error('Keystore export failed');
    }

    // Import keystore
    const importResult = await walletManager.importKeystore(
        exportResult.filePath,
        password
    );

    if (!importResult.success) {
        throw new Error('Keystore import failed');
    }

    // Clean up
    walletManager.removeWallet(wallet.walletInfo.id);
    walletManager.removeWallet(importResult.walletInfo.id);
}

async function testConfigurationLoading() {
    const XRPL_CONFIG = require('../config/xrpl-config');
    
    if (!XRPL_CONFIG.NETWORKS) {
        throw new Error('XRPL configuration not loaded properly');
    }

    if (!XRPL_CONFIG.NETWORKS.TESTNET) {
        throw new Error('Testnet configuration missing');
    }

    if (!XRPL_CONFIG.VALIDATION.ADDRESS_REGEX) {
        throw new Error('Validation configuration missing');
    }
}

async function testEnvironmentVariables() {
    if (!process.env.XRPL_NETWORK) {
        throw new Error('XRPL_NETWORK environment variable not set');
    }

    if (!process.env.WALLET_ENCRYPTION_KEY) {
        throw new Error('WALLET_ENCRYPTION_KEY environment variable not set');
    }

    if (!process.env.XRPL_DEFAULT_FEE) {
        throw new Error('XRPL_DEFAULT_FEE environment variable not set');
    }
}

// Main test execution
async function runAllTests() {
    const runner = new TestRunner();

    // Add all tests
    runner.addTest('XRPL Network Connection', testXRPLConnection);
    runner.addTest('Configuration Loading', testConfigurationLoading);
    runner.addTest('Environment Variables', testEnvironmentVariables);
    runner.addTest('Input Validators', testValidators);
    runner.addTest('Wallet Generation', testWalletGeneration);
    runner.addTest('Wallet Import', testWalletImport);
    runner.addTest('QR Code Generation', testQRCodeGeneration);
    runner.addTest('Token Data Validation', testTokenDataValidation);
    runner.addTest('Trustline Data Validation', testTrustlineDataValidation);
    runner.addTest('Encryption/Decryption', testEncryptionDecryption);

    await runner.runTests();
}

// Run tests if called directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests, TestRunner };