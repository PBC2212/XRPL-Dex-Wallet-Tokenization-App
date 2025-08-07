const { Pool } = require('pg');

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            const dbConfig = {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'rwa_platform',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'password',
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            };

            if (process.env.DATABASE_URL) {
                this.pool = new Pool({
                    connectionString: process.env.DATABASE_URL,
                    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
                });
            } else {
                this.pool = new Pool(dbConfig);
            }

            await this.testConnection();
            this.isConnected = true;
            console.log(`[DB] Connected to PostgreSQL database: ${dbConfig.database}`);
            return this.pool;
        } catch (error) {
            console.error('[DB] Failed to initialize database:', error.message);
            this.isConnected = false;
            throw error;
        }
    }

    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time');
            console.log(`[DB] Connection test successful`);
        } finally {
            client.release();
        }
    }

    async query(text, params = []) {
        if (!this.isConnected) {
            await this.initialize();
        }

        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } catch (error) {
            console.error('[DB] Query error:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('[DB] Database connections closed');
        }
    }
}

const database = new Database();
module.exports = database;