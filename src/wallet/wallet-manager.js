const xrpl = require('xrpl');

async function generateWallet() {
    console.log('🔐 Generating new XRPL wallet...');
    
    try {
        const wallet = xrpl.Wallet.generate();
        
        const walletData = {
            address: wallet.classicAddress,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            seed: wallet.seed
        };

        console.log(`✅ New wallet generated: ${walletData.address}`);
        return walletData;
        
    } catch (error) {
        console.error('❌ Wallet generation failed:', error.message);
        throw new Error(`Wallet generation failed: ${error.message}`);
    }
}

async function importWallet(seed) {
    console.log('📥 Importing wallet from seed...');
    console.log('Seed received:', seed ? `${seed.slice(0, 10)}...` : 'null');
    
    try {
        if (!seed || typeof seed !== 'string') {
            throw new Error('Seed is required');
        }

        const cleanSeed = seed.trim();
        console.log('Clean seed length:', cleanSeed.length);
        
        if (cleanSeed.length === 0) {
            throw new Error('Seed cannot be empty');
        }

        // Let the XRPL library handle validation - it knows the formats
        let wallet;
        try {
            wallet = xrpl.Wallet.fromSeed(cleanSeed);
        } catch (xrplError) {
            console.log('XRPL fromSeed error:', xrplError.message);
            // If fromSeed fails, the seed format is definitely wrong
            throw new Error(`Invalid seed format: ${xrplError.message}`);
        }
        
        const walletData = {
            address: wallet.classicAddress,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            seed: wallet.seed
        };

        console.log(`✅ Wallet imported successfully: ${walletData.address}`);
        return walletData;
        
    } catch (error) {
        console.error('❌ Wallet import failed:', error.message);
        throw new Error(`Wallet import failed: ${error.message}`);
    }
}

async function exportKeystore(seed, password) {
    console.log('📤 Exporting wallet keystore...');
    
    try {
        // Simple mock export for now
        const wallet = await importWallet(seed);
        
        const keystore = {
            address: wallet.address,
            encrypted: `encrypted_${password.length}_chars`,
            timestamp: Date.now()
        };

        console.log(`✅ Wallet exported: ${wallet.address}`);
        return keystore;
        
    } catch (error) {
        console.error('❌ Export failed:', error.message);
        throw new Error(`Export failed: ${error.message}`);
    }
}

module.exports = {
    generateWallet,
    importWallet,
    exportKeystore
};