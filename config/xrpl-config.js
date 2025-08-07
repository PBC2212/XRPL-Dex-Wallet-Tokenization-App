/**
 * XRPL Network Configuration
 * Production-ready configuration for XRPL connections
 */

const XRPL_CONFIG = {
    // Network endpoints
    NETWORKS: {
        MAINNET: 'wss://xrplcluster.com',
        TESTNET: 'wss://s.altnet.rippletest.net:51233',
        DEVNET: 'wss://s.devnet.rippletest.net:51233'
    },

    // Default network (change to MAINNET for production)
    DEFAULT_NETWORK: 'TESTNET',

    // Transaction settings
    TRANSACTION: {
        // Fee in drops (1 XRP = 1,000,000 drops)
        DEFAULT_FEE: '12',
        // Maximum fee willing to pay (in drops)
        MAX_FEE: '100',
        // Transaction timeout in seconds
        TIMEOUT: 30,
        // Number of ledger versions to wait for validation
        LAST_LEDGER_OFFSET: 75
    },

    // Reserve requirements (in drops)
    RESERVES: {
        // Base reserve for account
        ACCOUNT_RESERVE: 10000000, // 10 XRP
        // Additional reserve per owned object (trustline, offer, etc.)
        OBJECT_RESERVE: 2000000,   // 2 XRP
        // Minimum for trustline
        TRUSTLINE_RESERVE: 2000000 // 2 XRP
    },

    // Wallet security settings
    WALLET: {
        // Encryption algorithm for keystore
        ENCRYPTION_ALGORITHM: 'aes-256-gcm',
        // Key derivation iterations
        PBKDF2_ITERATIONS: 100000,
        // Salt length for key derivation
        SALT_LENGTH: 32,
        // IV length for encryption
        IV_LENGTH: 16
    },

    // Token/IOU settings
    TOKEN: {
        // Maximum currency code length (3 chars for standard, 40 hex for custom)
        MAX_CURRENCY_CODE_LENGTH: 3,
        // Custom currency code length (hex)
        CUSTOM_CURRENCY_LENGTH: 40,
        // Default token precision
        DEFAULT_PRECISION: 6,
        // Maximum trustline limit
        MAX_TRUSTLINE_LIMIT: '9999999999999999e80'
    },

    // Validation patterns
    VALIDATION: {
        // XRP address regex
        ADDRESS_REGEX: /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/,
        // Currency code regex (3 chars or 40 hex)
        CURRENCY_REGEX: /^([A-Z0-9]{3}|[A-F0-9]{40})$/,
        // Hex pattern for custom currency codes
        HEX_REGEX: /^[A-F0-9]+$/i
    },

    // IPFS configuration (for metadata storage)
    IPFS: {
        // Pinata API endpoint
        PINATA_API: 'https://api.pinata.cloud',
        // NFT.Storage API endpoint
        NFT_STORAGE_API: 'https://api.nft.storage',
        // Default gateway for reading
        DEFAULT_GATEWAY: 'https://ipfs.io/ipfs/'
    },

    // Error messages
    ERRORS: {
        NETWORK_CONNECTION: 'Failed to connect to XRPL network',
        INVALID_ADDRESS: 'Invalid XRP address format',
        INVALID_CURRENCY: 'Invalid currency code format',
        INSUFFICIENT_FUNDS: 'Insufficient XRP balance for transaction',
        TRUSTLINE_EXISTS: 'Trustline already exists',
        INVALID_AMOUNT: 'Invalid amount specified',
        TRANSACTION_FAILED: 'Transaction failed to validate',
        WALLET_NOT_FOUND: 'Wallet not found or invalid',
        ENCRYPTION_ERROR: 'Failed to encrypt/decrypt wallet data'
    },

    // Success messages
    SUCCESS: {
        WALLET_CREATED: 'Wallet created successfully',
        TOKEN_ISSUED: 'Token issued successfully',
        TRUSTLINE_CREATED: 'Trustline established successfully',
        TRANSACTION_SUBMITTED: 'Transaction submitted successfully',
        BALANCE_UPDATED: 'Balance updated successfully'
    }
};

module.exports = XRPL_CONFIG;