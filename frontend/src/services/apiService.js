import axios from 'axios';

// Production API URL configuration
const getApiBaseUrl = () => {
  // Use environment variable first, then fallback based on environment
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.endsWith('/api') 
      ? process.env.REACT_APP_API_URL 
      : `${process.env.REACT_APP_API_URL}/api`;
  }
  
  // Fallback for different environments
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = window.location.hostname === 'localhost';
  
  if (isProduction && !isLocalhost) {
    // Production deployment - use relative API path
    return `${window.location.protocol}//${window.location.host}/api`;
  } else {
    // Local development
    return 'http://localhost:3001/api';
  }
};

// Create axios instance with production URL support
const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Production logging (less verbose in production)
const isProduction = process.env.NODE_ENV === 'production';

// Request interceptor
api.interceptors.request.use(
  (config) => {
    if (!isProduction) {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
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
    if (!isProduction) {
      console.log(`API Response: ${response.status}`, response.data);
    }
    return response.data;
  },
  (error) => {
    if (!isProduction) {
      console.error('API Error:', error.response?.data || error.message);
    }

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
  // WALLET METHODS
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
  // DASHBOARD METHODS
  // ================================

  // Get dashboard data
  async getDashboardData(address) {
    try {
      const response = await api.get(`/dashboard/${address}`);
      return response;
    } catch (error) {
      console.error('Get dashboard data error:', error);
      // Fallback to individual API calls if dashboard endpoint fails
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
        throw error;
      }
    }
  },

  // ================================
  // TOKEN METHODS
  // ================================

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

  // Get all tokens
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
  // INVESTMENT PORTAL METHODS
  // ================================

  // Get investment opportunities
  async getInvestmentOpportunities() {
    try {
      const response = await api.get('/investments/opportunities');
      return response;
    } catch (error) {
      console.error('Get investment opportunities error:', error);
      // Fallback to regular tokens if investment endpoint fails
      try {
        const tokensResponse = await this.getTokens();
        if (tokensResponse.success) {
          // Convert regular tokens to investment opportunities format
          const opportunities = tokensResponse.data.tokens.map(token => ({
            ...token,
            currentPrice: (Math.random() * 10 + 0.1).toFixed(4),
            availableTokens: Math.floor(token.totalSupply * 0.7),
            investors: Math.floor(Math.random() * 50) + 1,
            marketCap: (Math.random() * 1000000).toFixed(2),
            performance24h: (Math.random() - 0.5) * 20,
            minInvestment: 10,
            category: this.getCategoryFromDescription(token.description || token.name),
            availableForInvestment: true
          }));
          
          return {
            success: true,
            data: {
              opportunities,
              totalOpportunities: opportunities.length,
              totalMarketCap: opportunities.reduce((sum, token) => sum + parseFloat(token.marketCap || 0), 0)
            }
          };
        }
      } catch (fallbackError) {
        console.error('Investment opportunities fallback failed:', fallbackError);
      }
      throw error;
    }
  },

  // Create investment trustline
  async createInvestmentTrustline(investorSeed, tokenCode, issuerAddress, limit = '1000000') {
    try {
      const response = await api.post('/investments/create-trustline', {
        investorSeed,
        tokenCode,
        issuerAddress,
        limit
      });
      return response;
    } catch (error) {
      console.error('Create investment trustline error:', error);
      throw error;
    }
  },

  // Execute investment
  async executeInvestment(investmentData) {
    try {
      const response = await api.post('/investments/execute', investmentData);
      return response;
    } catch (error) {
      console.error('Execute investment error:', error);
      throw error;
    }
  },

  // Get investment portfolio
  async getInvestmentPortfolio(address) {
    try {
      const response = await api.get(`/investments/portfolio/${address}`);
      return response;
    } catch (error) {
      console.error('Get investment portfolio error:', error);
      throw error;
    }
  },

  // Get token market data
  async getTokenMarketData(tokenCode, issuer) {
    try {
      const response = await api.get(`/investments/market-data/${tokenCode}/${issuer}`);
      return response;
    } catch (error) {
      console.error('Get token market data error:', error);
      throw error;
    }
  },

  // ================================
  // NETWORK & TRANSACTION METHODS
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

  // Get transactions
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
  // WEBSOCKET CONNECTION
  // ================================

  // WebSocket connection with production support
  connectWebSocket(onMessage, onError) {
    try {
      const isLocalhost = window.location.hostname === 'localhost';
      let wsUrl;
      
      if (isLocalhost) {
        // Development
        wsUrl = 'ws://localhost:3001/ws';
      } else {
        // Production - convert current URL to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }

      if (!isProduction) {
        console.log('Connecting to WebSocket:', wsUrl);
      }
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!isProduction) {
          console.log('📡 WebSocket connected');
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!isProduction) {
            console.log('📨 WebSocket message:', data);
          }
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
        if (!isProduction) {
          console.log('📡 WebSocket closed:', event.code, event.reason);
        }
      };

      return ws;
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (onError) onError(error);
      return null;
    }
  },

  // ================================
  // UTILITY FUNCTIONS
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

  getCategoryFromDescription(description) {
    if (!description) return 'Mixed Assets';
    const desc = description.toLowerCase();
    if (desc.includes('real estate') || desc.includes('property')) return 'Real Estate';
    if (desc.includes('art') || desc.includes('collectible')) return 'Art & Collectibles';
    if (desc.includes('gold') || desc.includes('metal')) return 'Precious Metals';
    if (desc.includes('business') || desc.includes('company')) return 'Business Equity';
    return 'Mixed Assets';
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
      case 'Payment': return '💸';
      case 'TrustSet': return '🤝';
      case 'OfferCreate': return '📈';
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
  // PRODUCTION PERFORMANCE OPTIMIZATION
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

  // Get API base URL for debugging
  getApiBaseUrl() {
    return getApiBaseUrl();
  }
};

export default apiService;