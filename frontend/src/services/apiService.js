import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: 'http://localhost:3001/api',
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
        seed: seed.trim() 
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
  async getTransactions(address, limit = 20) {
    try {
      const response = await api.get(`/transactions/${address}?limit=${limit}`);
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

  // Utility functions
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
      return words.every(word => word.length >= 2 && /^[a-zA-Z]+$/.test(word));
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
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }
};

export default apiService;