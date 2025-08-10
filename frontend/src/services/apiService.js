import axios from 'axios';

// Create axios instance with production URL support
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status}`, response.data);
    return response.data;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    } else if (error.message) {
      throw new Error(error.message);
    } else {
      throw new Error('Network error occurred');
    }
  }
);

const apiService = {
  // ================================
  // EXISTING WALLET METHODS (UNCHANGED)
  // ================================

  // Generate new wallet
  async generateWallet() {
    try {
      const response = await api.post('/wallets');
      return response;
    } catch (error) {
      console.error('Generate wallet error:', error);
      throw error;
    }
  },

  // Import wallet
  async importWallet(seed) {
    try {
      if (!seed || !seed.trim()) {
        throw new Error('Seed phrase is required');
      }

      const response = await api.post('/wallets/import', {
        seed: seed.trim(),
      });
      return response;
    } catch (error) {
      console.error('Import wallet error:', error);
      throw error;
    }
  },

  // Export wallet
  async exportWallet(seed, password) {
    try {
      const response = await api.post('/wallets/export', { seed, password });
      return response;
    } catch (error) {
      console.error('Export wallet error:', error);
      throw error;
    }
  },

  // Get balance
  async getBalance(address) {
    try {
      const response = await api.get(`/wallets/${address}/balance`);
      return response;
    } catch (error) {
      console.error('Get balance error:', error);
      throw error;
    }
  },

  // ================================
  // NEW: ENHANCED DASHBOARD METHOD
  // ================================

  // Get dashboard data (NEW)
  async getDashboardData(address) {
    try {
      const response = await api.get(`/dashboard/${address}`);
      return response;
    } catch (error) {
      console.error('Get dashboard data error:', error);
      // Fallback to individual API calls if dashboard endpoint fails
      console.log('Falling back to individual API calls...');
      try {
        const [balance, trustlines, transactions] = await Promise.allSettled([
          this.getBalance(address),
          this.getTrustlines(address),
          this.getTransactions(address, 5)
        ]);

        const fallbackData = {
          balance: balance.status === 'fulfilled' ? balance.value.data : { xrpBalance: '0', accountData: null },
          trustlines: trustlines.status === 'fulfilled' ? (trustlines.value.data.trustlines || []) : [],
          recentTransactions: transactions.status === 'fulfilled' ? (transactions.value.data.transactions || []) : [],
          userTokens: [],
          stats: {
            totalBalance: 0,
            activeTokens: 0,
            totalTransactions: 0,
            portfolioValue: 0,
            createdTokens: 0
          }
        };

        return { success: true, data: fallbackData };
      } catch (fallbackError) {
        throw error; // Throw original error if fallback also fails
      }
    }
  },

  // ================================
  // EXISTING NETWORK & TOKEN METHODS (UNCHANGED)
  // ================================

  // Get network info
  async getNetworkInfo() {
    try {
      const response = await api.get('/network/info');
      return response;
    } catch (error) {
      console.error('Get network info error:', error);
      throw error;
    }
  },

  // Create token
  async createToken(tokenData) {
    try {
      console.log('Creating token:', tokenData.tokenCode);
      const response = await api.post('/tokens', tokenData);
      return response;
    } catch (error) {
      console.error('Create token error:', error);
      throw error;
    }
  },

  // ================================
  // NEW: ENHANCED TRANSACTION METHODS
  // ================================

  // Get transactions (ENHANCED)
  async getTransactions(address, limit = 20, offset = 0) {
    try {
      const response = await api.get(`/transactions/${address}?limit=${limit}&offset=${offset}`);
      return response;
    } catch (error) {
      console.error('Get transactions error:', error);
      throw error;
    }
  },

  // Get trustlines
  async getTrustlines(address) {
    try {
      const response = await api.get(`/trustlines/${address}`);
      return response;
    } catch (error) {
      console.error('Get trustlines error:', error);
      throw error;
    }
  },

  // ================================
  // NEW: TOKEN MANAGEMENT METHODS
  // ================================

  // Get token info (NEW)
  async getToken(tokenId) {
    try {
      const response = await api.get(`/tokens/${tokenId}`);
      return response;
    } catch (error) {
      console.error('Get token error:', error);
      throw error;
    }
  },

  // List all tokens (NEW)
  async getTokens() {
    try {
      const response = await api.get('/tokens');
      return response;
    } catch (error) {
      console.error('Get tokens error:', error);
      throw error;
    }
  },

  // ================================
  // NEW: WEBSOCKET CONNECTION
  // ================================

  // WebSocket connection (NEW) with production support
  connectWebSocket(onMessage, onError) {
    try {
      // Determine WebSocket URL based on environment
      const isProduction = process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost';
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      
      let wsUrl;
      if (isProduction) {
        // In production, convert HTTPS API URL to WSS WebSocket URL
        wsUrl = apiUrl.replace('https://', 'wss://').replace('/api', '/ws');
      } else {
        // In development, use localhost WebSocket
        wsUrl = 'ws://localhost:3001/ws';
      }

      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('📡 WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket message:', data);
          if (onMessage) onMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('📡 WebSocket error:', error);
        if (onError) onError(error);
      };

      ws.onclose = (event) => {
        console.log('📡 WebSocket closed:', event.code, event.reason);
      };

      return ws;
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (onError) onError(error);
      return null;
    }
  },

  // ================================
  // EXISTING UTILITY FUNCTIONS (UNCHANGED)
  // ================================

  formatXRP(amount) {
    if (!amount) return '0.000000 XRP';
    const num = parseFloat(amount);
    if (isNaN(num)) return '0.000000 XRP';
    return `${num.toFixed(6)} XRP`;
  },

  formatTokenAmount(amount, tokenCode = '') {
    if (!amount) return `0 ${tokenCode}`;
    const num = parseFloat(amount);
    if (isNaN(num)) return `0 ${tokenCode}`;
    return `${num.toLocaleString()} ${tokenCode}`;
  },

  formatCurrency(amount, decimals = 6) {
    if (!amount && amount !== 0) return '0';
    const num = parseFloat(amount);
    if (isNaN(num)) return '0';
    return num.toFixed(decimals);
  },

  formatNumber(number) {
    if (!number && number !== 0) return '0';
    const num = parseFloat(number);
    if (isNaN(num)) return '0';
    return num.toLocaleString();
  },

  truncateAddress(address, start = 6, end = 4) {
    if (!address) return '';
    if (address.length <= start + end) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
  },

  isValidAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^r[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(address);
  },

  isValidSeed(seed) {
    if (!seed || typeof seed !== 'string') return false;
    const trimmed = seed.trim();

    // Check for XRPL encoded seed (starts with 's')
    if (/^s[1-9A-HJ-NP-Za-km-z]{28,29}$/.test(trimmed)) {
      return true;
    }

    // Check for hex seed (64 characters)
    if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
      return true;
    }

    // Check for mnemonic phrase (12-24 words)
    const words = trimmed.split(/\s+/);
    if (words.length >= 12 && words.length <= 24) {
      return words.every((word) => word.length >= 2 && /^[a-zA-Z]+$/.test(word));
    }

    return false;
  },

  formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid Date';
    }
  },

  // ================================
  // NEW: ENHANCED UTILITY FUNCTIONS
  // ================================

  formatRelativeTime(timestamp) {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  },

  // Status helpers
  getTransactionStatusColor(status) {
    switch (status?.toLowerCase()) {
      case 'success': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  },

  getTransactionIcon(type) {
    switch (type) {
      case 'WALLET_CREATED': return '👛';
      case 'WALLET_IMPORTED': return '📥';
      case 'TOKEN_CREATED': return '🪙';
      case 'TRUSTLINE_CREATED': return '🤝';
      case 'PAYMENT': return '💸';
      case 'ACCOUNT_ACTIVATION': return '✅';
      default: return '🔄';
    }
  },

  // Validation helpers
  validateTokenData(tokenData) {
    const errors = [];

    if (!tokenData.tokenCode) {
      errors.push('Token code is required');
    } else if (tokenData.tokenCode.length < 3 || tokenData.tokenCode.length > 20) {
      errors.push('Token code must be 3-20 characters');
    } else if (!/^[A-Za-z0-9]+$/.test(tokenData.tokenCode)) {
      errors.push('Token code can only contain letters and numbers');
    }

    if (!tokenData.totalSupply) {
      errors.push('Total supply is required');
    } else if (isNaN(tokenData.totalSupply) || parseInt(tokenData.totalSupply) <= 0) {
      errors.push('Total supply must be a positive number');
    }

    if (!tokenData.name) {
      errors.push('Token name is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // ================================
  // NEW: CACHE MANAGEMENT
  // ================================

  _cache: new Map(),
  _cacheTimeout: 5 * 60 * 1000, // 5 minutes

  setCache(key, data) {
    this._cache.set(key, {
      data,
      timestamp: Date.now()
    });
  },

  getCache(key) {
    const cached = this._cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this._cacheTimeout) {
      this._cache.delete(key);
      return null;
    }

    return cached.data;
  },

  clearCache() {
    this._cache.clear();
  },

  // ================================
  // NEW: ENHANCED ERROR HANDLING
  // ================================

  handleError(error, context = 'API call') {
    console.error(`${context} failed:`, error);

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.data?.message || error.response.data?.error || error.message;
      
      switch (status) {
        case 400:
          throw new Error(`Bad request: ${message}`);
        case 401:
          throw new Error('Unauthorized access');
        case 403:
          throw new Error('Access forbidden');
        case 404:
          throw new Error('Resource not found');
        case 429:
          throw new Error('Rate limit exceeded. Please try again later.');
        case 500:
          throw new Error('Server error. Please try again later.');
        default:
          throw new Error(`Request failed: ${message}`);
      }
    } else if (error.request) {
      // Request made but no response received
      throw new Error('Network error: Unable to connect to server');
    } else {
      // Something else happened
      throw new Error(error.message || 'Unknown error occurred');
    }
  }
};

export default apiService;