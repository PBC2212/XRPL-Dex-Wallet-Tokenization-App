-- RWA Tokenization Platform Database Schema

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallets table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    address VARCHAR(34) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    encrypted_seed TEXT NOT NULL,
    is_activated BOOLEAN DEFAULT FALSE,
    balance DECIMAL(20,6) DEFAULT 0,
    sequence INTEGER DEFAULT 0,
    owner_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    last_refreshed TIMESTAMP
);

-- Assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    asset_type VARCHAR(50) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    location TEXT,
    owner_wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    owner_address VARCHAR(34) NOT NULL,
    documents JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    verification_status VARCHAR(20) DEFAULT 'unverified',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tokenized_at TIMESTAMP,
    redeemed_at TIMESTAMP,
    redeemed_by VARCHAR(34)
);

-- Tokenization data table
CREATE TABLE tokenizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    currency_code VARCHAR(3) NOT NULL,
    total_supply DECIMAL(20,6) NOT NULL,
    available_supply DECIMAL(20,6) NOT NULL,
    issuer_address VARCHAR(34) NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    ledger_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table (DEX orders)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    wallet_address VARCHAR(34) NOT NULL,
    taker_gets JSONB NOT NULL,
    taker_pays JSONB NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    ledger_index INTEGER NOT NULL,
    offer_sequence INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    order_type VARCHAR(20) DEFAULT 'limit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancel_transaction_hash VARCHAR(64)
);

-- Trades table
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    wallet_address VARCHAR(34) NOT NULL,
    taker_gets JSONB NOT NULL,
    taker_pays JSONB NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    ledger_index INTEGER NOT NULL,
    executed_trades JSONB DEFAULT '[]',
    trade_type VARCHAR(20) DEFAULT 'market',
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trustlines table
CREATE TABLE trustlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    wallet_address VARCHAR(34) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    issuer_address VARCHAR(34) NOT NULL,
    balance DECIMAL(20,6) DEFAULT 0,
    limit_amount DECIMAL(20,6) DEFAULT 0,
    limit_peer DECIMAL(20,6) DEFAULT 0,
    quality INTEGER DEFAULT 0,
    flags INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_address, currency_code, issuer_address)
);

-- Indexes for better performance
CREATE INDEX idx_wallets_address ON wallets(address);
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_assets_owner_wallet ON assets(owner_wallet_id);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_orders_wallet ON orders(wallet_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_trades_wallet ON trades(wallet_id);
CREATE INDEX idx_trustlines_wallet ON trustlines(wallet_id);
CREATE INDEX idx_trustlines_currency ON trustlines(currency_code, issuer_address);