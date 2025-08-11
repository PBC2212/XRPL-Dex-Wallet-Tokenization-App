/**
 * XRPL RWA Web Admin Interface
 * Production-ready web UI for RWA tokenization platform
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\web-admin\app.js
 */

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.WEB_PORT || 4000;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

// Demo users (in production, use database)
const users = [
    {
        id: 1,
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        name: 'System Administrator'
    },
    {
        id: 2,
        username: 'manager',
        password: bcrypt.hashSync('manager123', 10),
        role: 'manager',
        name: 'Asset Manager'
    }
];

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'xrpl-rwa-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy((username, password, done) => {
    const user = users.find(u => u.username === username);
    if (!user) return done(null, false, { message: 'Invalid username' });
    
    if (bcrypt.compareSync(password, user.password)) {
        return done(null, user);
    } else {
        return done(null, false, { message: 'Invalid password' });
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user);
});

// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// API service wrapper
class WebApiService {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    async request(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: { 'Content-Type': 'application/json' }
            };
            if (data) config.data = data;
            
            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`API Error: ${error.message}`);
            throw new Error(error.response?.data?.message || error.message);
        }
    }

    // API methods
    async getSystemHealth() { return this.request('GET', '/status'); }
    async getNetworkInfo() { return this.request('GET', '/network/info'); }
    async createWallet(data) { return this.request('POST', '/wallets', data); }
    async importWallet(data) { return this.request('POST', '/wallets/import', data); }
    async getWalletBalance(address) { return this.request('GET', `/wallets/${address}/balance`); }
    async createToken(data) { return this.request('POST', '/tokens', data); }
    async getTokens() { return this.request('GET', '/tokens'); }
    async getInvestmentOpportunities() { return this.request('GET', '/investments/opportunities'); }
    async getTrustlines(address) { return this.request('GET', `/trustlines/${address}`); }
    async getDashboardData(address) { return this.request('GET', `/dashboard/${address}`); }
}

const apiService = new WebApiService();

// Routes

// Login page
app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error });
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login?error=Invalid credentials'
}));

// Logout
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// Dashboard
app.get('/', ensureAuthenticated, (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const [systemHealth, tokens, opportunities] = await Promise.all([
            apiService.getSystemHealth(),
            apiService.getTokens(),
            apiService.getInvestmentOpportunities()
        ]);

        res.render('dashboard', {
            user: req.user,
            systemHealth,
            tokens: tokens.data?.tokens || [],
            opportunities: opportunities.data?.opportunities || [],
            stats: {
                totalTokens: tokens.data?.tokens?.length || 0,
                totalOpportunities: opportunities.data?.opportunities?.length || 0,
                totalMarketCap: opportunities.data?.totalMarketCap || 0
            }
        });
    } catch (error) {
        res.render('dashboard', {
            user: req.user,
            error: error.message,
            systemHealth: null,
            tokens: [],
            opportunities: [],
            stats: { totalTokens: 0, totalOpportunities: 0, totalMarketCap: 0 }
        });
    }
});

// Wallet Management
app.get('/wallets', ensureAuthenticated, (req, res) => {
    res.render('wallets', { user: req.user });
});

app.post('/wallets/create', ensureAuthenticated, async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await apiService.createWallet({ name, description });
        res.json({ success: true, data: result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/wallets/import', ensureAuthenticated, async (req, res) => {
    try {
        const { seed, name } = req.body;
        const result = await apiService.importWallet({ seed, name });
        res.json({ success: true, data: result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/wallets/balance/:address', ensureAuthenticated, async (req, res) => {
    try {
        const result = await apiService.getWalletBalance(req.params.address);
        res.json({ success: true, data: result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Token Management
app.get('/tokens', ensureAuthenticated, async (req, res) => {
    try {
        const tokens = await apiService.getTokens();
        res.render('tokens', { 
            user: req.user, 
            tokens: tokens.data?.tokens || [] 
        });
    } catch (error) {
        res.render('tokens', { 
            user: req.user, 
            tokens: [], 
            error: error.message 
        });
    }
});

app.post('/tokens/create', ensureAuthenticated, async (req, res) => {
    try {
        const tokenData = req.body;
        const result = await apiService.createToken(tokenData);
        res.json({ success: true, data: result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Investment Management
app.get('/investments', ensureAuthenticated, async (req, res) => {
    try {
        const opportunities = await apiService.getInvestmentOpportunities();
        res.render('investments', { 
            user: req.user, 
            opportunities: opportunities.data?.opportunities || [] 
        });
    } catch (error) {
        res.render('investments', { 
            user: req.user, 
            opportunities: [], 
            error: error.message 
        });
    }
});

// System Management
app.get('/system', ensureAuthenticated, async (req, res) => {
    try {
        const [systemHealth, networkInfo] = await Promise.all([
            apiService.getSystemHealth(),
            apiService.getNetworkInfo().catch(() => null)
        ]);

        res.render('system', {
            user: req.user,
            systemHealth,
            networkInfo
        });
    } catch (error) {
        res.render('system', {
            user: req.user,
            error: error.message,
            systemHealth: null,
            networkInfo: null
        });
    }
});

// API endpoint for real-time updates
app.get('/api/health', ensureAuthenticated, async (req, res) => {
    try {
        const health = await apiService.getSystemHealth();
        res.json({ success: true, data: health });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('\n🌐 ===================================');
    console.log('🌐 XRPL RWA WEB ADMIN INTERFACE');
    console.log('🌐 ===================================');
    console.log(`🌐 Server running on: http://localhost:${PORT}`);
    console.log(`🔗 API Backend: ${API_BASE_URL}`);
    console.log('👤 Demo Credentials:');
    console.log('   Admin: admin / admin123');
    console.log('   Manager: manager / manager123');
    console.log('🌐 ===================================\n');
});

module.exports = app;