const { generateWallet } = require('./src/wallet/wallet-manager');

async function test() {
    try {
        console.log('Testing wallet generation...');
        const wallet = await generateWallet();
        console.log('Success:', wallet);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();