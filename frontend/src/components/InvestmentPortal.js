import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiService from '../services/apiService';

const InvestmentPortal = ({ currentWallet }) => {
  const [availableTokens, setAvailableTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [investmentCurrency, setInvestmentCurrency] = useState('XRP');
  const [investing, setInvesting] = useState(false);
  const [filter, setFilter] = useState({
    assetType: 'all',
    search: '',
    sortBy: 'newest'
  });
  const [showInvestModal, setShowInvestModal] = useState(false);

  useEffect(() => {
    loadAvailableTokens();
  }, []);

  const loadAvailableTokens = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getTokens();
      
      if (response && response.success) {
        let tokens = response.data.tokens || [];
        
        // Add mock investment data for display purposes
        tokens = tokens.map(token => ({
          ...token,
          currentPrice: generateMockPrice(token),
          availableTokens: Math.floor(token.totalSupply * 0.7), // 70% available for investment
          investors: Math.floor(Math.random() * 50) + 1,
          marketCap: generateMockMarketCap(token),
          performance24h: (Math.random() - 0.5) * 20, // -10% to +10%
          minInvestment: 10, // Minimum $10 investment
          category: getAssetCategory(token.description || token.name)
        }));
        
        setAvailableTokens(tokens);
      } else {
        throw new Error('Failed to load available tokens');
      }
    } catch (error) {
      console.error('Failed to load tokens:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateMockPrice = (token) => {
    // Generate realistic price based on token supply
    const basePrice = 1000 / token.totalSupply;
    return Math.max(0.01, basePrice * (0.5 + Math.random())).toFixed(4);
  };

  const generateMockMarketCap = (token) => {
    const price = parseFloat(generateMockPrice(token));
    return (price * token.totalSupply * 0.3).toFixed(2); // 30% of tokens are traded
  };

  const getAssetCategory = (description) => {
    const desc = description.toLowerCase();
    if (desc.includes('real estate') || desc.includes('property')) return 'Real Estate';
    if (desc.includes('art') || desc.includes('collectible')) return 'Art & Collectibles';
    if (desc.includes('gold') || desc.includes('metal')) return 'Precious Metals';
    if (desc.includes('business') || desc.includes('company')) return 'Business Equity';
    return 'Mixed Assets';
  };

  const filteredTokens = availableTokens.filter(token => {
    if (filter.assetType !== 'all' && token.category !== filter.assetType) return false;
    if (filter.search && !token.name.toLowerCase().includes(filter.search.toLowerCase()) && 
        !token.currencyCode.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    switch (filter.sortBy) {
      case 'newest':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'price-low':
        return parseFloat(a.currentPrice) - parseFloat(b.currentPrice);
      case 'price-high':
        return parseFloat(b.currentPrice) - parseFloat(a.currentPrice);
      case 'performance':
        return b.performance24h - a.performance24h;
      default:
        return 0;
    }
  });

  const handleInvestClick = (token) => {
    if (!currentWallet) {
      alert('Please connect a wallet to invest in tokens.');
      return;
    }
    setSelectedToken(token);
    setShowInvestModal(true);
  };

  const handleInvestment = async () => {
    if (!selectedToken || !investmentAmount || !currentWallet) return;

    try {
      setInvesting(true);
      
      // Calculate token amount based on investment
      const tokenAmount = (parseFloat(investmentAmount) / parseFloat(selectedToken.currentPrice)).toFixed(6);
      
      // In a real implementation, this would:
      // 1. Create a trustline to the token
      // 2. Execute a payment from investor to issuer
      // 3. Issue tokens to the investor
      
      // For now, we'll simulate the investment
      alert(`Investment Simulation:\n\nInvestment: ${investmentAmount} ${investmentCurrency}\nTokens to receive: ${tokenAmount} ${selectedToken.currencyCode}\nPrice per token: $${selectedToken.currentPrice}\n\nIn a real implementation, this would:\n1. Create trustline to ${selectedToken.currencyCode}\n2. Send ${investmentAmount} ${investmentCurrency} to issuer\n3. Receive ${tokenAmount} ${selectedToken.currencyCode} tokens`);
      
      setShowInvestModal(false);
      setInvestmentAmount('');
      
    } catch (error) {
      console.error('Investment failed:', error);
      alert('Investment failed: ' + error.message);
    } finally {
      setInvesting(false);
    }
  };

  if (!currentWallet) {
    return (
      <div className="container">
        <div className="mb-6">
          <h1>Investment Portal</h1>
          <p>Discover and invest in tokenized assets on the XRPL</p>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💎</div>
          <h3 style={{ marginBottom: '1rem' }}>Connect Wallet to Invest</h3>
          <p style={{ marginBottom: '2rem', color: '#64748b' }}>
            Connect your wallet to browse and invest in tokenized assets. 
            Discover real estate, art, precious metals, and more.
          </p>
          <Link to="/wallet" className="btn btn-primary">
            Connect Wallet
          </Link>
        </div>

        {/* Preview of available assets */}
        <div style={{ marginTop: '3rem' }}>
          <h3 style={{ textAlign: 'center', marginBottom: '2rem' }}>Available Investment Opportunities</h3>
          <div className="preview-grid">
            <div className="preview-card">
              <div className="preview-icon">🏠</div>
              <h4>Real Estate Tokens</h4>
              <p>Fractional ownership of premium properties</p>
            </div>
            <div className="preview-card">
              <div className="preview-icon">🎨</div>
              <h4>Art & Collectibles</h4>
              <p>Invest in valuable art pieces and collectibles</p>
            </div>
            <div className="preview-card">
              <div className="preview-icon">🥇</div>
              <h4>Precious Metals</h4>
              <p>Digital ownership of gold, silver, and platinum</p>
            </div>
            <div className="preview-card">
              <div className="preview-icon">🏢</div>
              <h4>Business Equity</h4>
              <p>Participate in business growth and profits</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="mb-6">
        <div className="header-section">
          <div>
            <h1>Investment Portal</h1>
            <p>Discover and invest in tokenized assets using XRP or USDT</p>
          </div>
          <button
            onClick={loadAvailableTokens}
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? (
              <>
                <div className="spinner spinner-sm"></div>
                Loading...
              </>
            ) : (
              <>🔄 Refresh</>
            )}
          </button>
        </div>
      </div>

      {/* Connected Wallet Info */}
      <div className="card" style={{ 
        border: '1px solid #3b82f6', 
        backgroundColor: '#eff6ff',
        marginBottom: '2rem'
      }}>
        <h4 style={{ color: '#1e40af', marginBottom: '0.5rem' }}>
          💎 Investment Wallet Connected
        </h4>
        <p style={{ fontFamily: 'monospace', fontSize: '0.9rem', marginBottom: 0 }}>
          <strong>Address:</strong> {currentWallet.address}
        </p>
      </div>

      {/* Filters and Search */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Filter Investment Opportunities</h4>
        <div className="filters-grid">
          <div className="form-group">
            <label className="form-label">Asset Category</label>
            <select
              value={filter.assetType}
              onChange={(e) => setFilter(prev => ({ ...prev, assetType: e.target.value }))}
              className="form-control"
            >
              <option value="all">All Categories</option>
              <option value="Real Estate">Real Estate</option>
              <option value="Art & Collectibles">Art & Collectibles</option>
              <option value="Precious Metals">Precious Metals</option>
              <option value="Business Equity">Business Equity</option>
              <option value="Mixed Assets">Mixed Assets</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Search</label>
            <input
              type="text"
              value={filter.search}
              onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search tokens..."
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Sort By</label>
            <select
              value={filter.sortBy}
              onChange={(e) => setFilter(prev => ({ ...prev, sortBy: e.target.value }))}
              className="form-control"
            >
              <option value="newest">Newest First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="performance">Best Performance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Market Statistics */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-icon">🪙</div>
          <div className="stat-content">
            <h3>Available Tokens</h3>
            <p className="stat-value">{availableTokens.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Market Cap</h3>
            <p className="stat-value">
              ${availableTokens.reduce((sum, token) => sum + parseFloat(token.marketCap || 0), 0).toFixed(2)}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Total Investors</h3>
            <p className="stat-value">
              {availableTokens.reduce((sum, token) => sum + (token.investors || 0), 0)}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <h3>Avg 24h Change</h3>
            <p className="stat-value">
              {availableTokens.length > 0 
                ? (availableTokens.reduce((sum, token) => sum + token.performance24h, 0) / availableTokens.length).toFixed(2) + '%'
                : '0%'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '2rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Investment Opportunities */}
      <div className="card">
        <div className="card-header">
          <h3>Investment Opportunities</h3>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {filteredTokens.length} tokens available
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="loading-spinner"></div>
            <p>Loading investment opportunities...</p>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <h3 style={{ marginBottom: '1rem' }}>No Investment Opportunities Found</h3>
            <p style={{ color: '#6b7280' }}>
              {filter.assetType !== 'all' || filter.search
                ? 'No tokens match your current filters.'
                : 'No tokens are available for investment yet.'}
            </p>
            <Link to="/tokens" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Create Your Own Token
            </Link>
          </div>
        ) : (
          <div className="tokens-grid">
            {filteredTokens.map((token, index) => (
              <div key={index} className="token-card">
                <div className="token-header">
                  <div className="token-info">
                    <div className="token-symbol">{token.currencyCode}</div>
                    <h4>{token.name}</h4>
                    <span className="token-category">{token.category}</span>
                  </div>
                  <div className="token-performance">
                    <span className={`performance ${token.performance24h >= 0 ? 'positive' : 'negative'}`}>
                      {token.performance24h >= 0 ? '+' : ''}{token.performance24h.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="token-metrics">
                  <div className="metric">
                    <span className="metric-label">Price</span>
                    <span className="metric-value">${token.currentPrice}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Market Cap</span>
                    <span className="metric-value">${token.marketCap}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Available</span>
                    <span className="metric-value">{token.availableTokens.toLocaleString()}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Investors</span>
                    <span className="metric-value">{token.investors}</span>
                  </div>
                </div>

                <div className="token-description">
                  <p>{token.description || 'Tokenized asset available for investment.'}</p>
                </div>

                <div className="token-details">
                  <div className="detail-item">
                    <span>Total Supply:</span>
                    <span>{token.totalSupply.toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span>Issuer:</span>
                    <span>{apiService.truncateAddress(token.issuer, 6, 4)}</span>
                  </div>
                  <div className="detail-item">
                    <span>Created:</span>
                    <span>{new Date(token.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="detail-item">
                    <span>Min Investment:</span>
                    <span>${token.minInvestment}</span>
                  </div>
                </div>

                <div className="token-actions">
                  <button
                    onClick={() => handleInvestClick(token)}
                    className="btn btn-primary btn-full"
                  >
                    💎 Invest Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Investment Modal */}
      {showInvestModal && selectedToken && (
        <div className="modal-overlay" onClick={() => setShowInvestModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invest in {selectedToken.name}</h3>
              <button
                onClick={() => setShowInvestModal(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>

            <div className="modal-content">
              <div className="investment-summary">
                <div className="summary-item">
                  <span>Token:</span>
                  <span>{selectedToken.currencyCode}</span>
                </div>
                <div className="summary-item">
                  <span>Price per Token:</span>
                  <span>${selectedToken.currentPrice}</span>
                </div>
                <div className="summary-item">
                  <span>Available Tokens:</span>
                  <span>{selectedToken.availableTokens.toLocaleString()}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Investment Currency</label>
                <select
                  value={investmentCurrency}
                  onChange={(e) => setInvestmentCurrency(e.target.value)}
                  className="form-control"
                >
                  <option value="XRP">XRP</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Investment Amount ({investmentCurrency})</label>
                <input
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Enter ${investmentCurrency} amount`}
                  className="form-control"
                  min={selectedToken.minInvestment}
                  step="0.01"
                />
                <div className="form-text">
                  Minimum investment: ${selectedToken.minInvestment}
                </div>
              </div>

              {investmentAmount && (
                <div className="investment-calculation">
                  <h4>You will receive:</h4>
                  <div className="calculation-result">
                    {(parseFloat(investmentAmount) / parseFloat(selectedToken.currentPrice)).toFixed(6)} {selectedToken.currencyCode}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  onClick={() => setShowInvestModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvestment}
                  disabled={investing || !investmentAmount || parseFloat(investmentAmount) < selectedToken.minInvestment}
                  className="btn btn-primary"
                >
                  {investing ? (
                    <>
                      <div className="spinner spinner-sm"></div>
                      Processing...
                    </>
                  ) : (
                    'Confirm Investment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }

        .preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
        }

        .preview-card {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .preview-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .preview-card h4 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.75rem;
        }

        .preview-card p {
          color: #6b7280;
          line-height: 1.5;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .stat-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .stat-icon {
          font-size: 2rem;
          opacity: 0.8;
        }

        .stat-content h3 {
          font-size: 0.875rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        .tokens-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2rem;
          padding: 2rem;
        }

        .token-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .token-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .token-header {
          padding: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .token-symbol {
          font-size: 1.5rem;
          font-weight: 700;
          color: #3b82f6;
          margin-bottom: 0.5rem;
        }

        .token-header h4 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .token-category {
          font-size: 0.875rem;
          color: #6b7280;
          background: #f3f4f6;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
        }

        .token-performance {
          text-align: right;
        }

        .performance {
          font-size: 1.25rem;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 8px;
        }

        .performance.positive {
          color: #059669;
          background: #dcfce7;
        }

        .performance.negative {
          color: #dc2626;
          background: #fee2e2;
        }

        .token-metrics {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          padding: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .metric {
          text-align: center;
        }

        .metric-label {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }

        .metric-value {
          font-size: 1rem;
          font-weight: 600;
          color: #1f2937;
        }

        .token-description {
          padding: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .token-description p {
          color: #6b7280;
          line-height: 1.5;
          margin: 0;
        }

        .token-details {
          padding: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          font-size: 0.875rem;
        }

        .detail-item span:first-child {
          color: #6b7280;
        }

        .detail-item span:last-child {
          color: #1f2937;
          font-weight: 500;
        }

        .token-actions {
          padding: 1.5rem;
        }

        .btn-full {
          width: 100%;
          justify-content: center;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: white;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          padding: 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h3 {
          margin: 0;
          color: #1f2937;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
        }

        .modal-content {
          padding: 1.5rem;
        }

        .investment-summary {
          background: #f8fafc;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          font-size: 0.875rem;
        }

        .summary-item span:first-child {
          color: #6b7280;
        }

        .summary-item span:last-child {
          color: #1f2937;
          font-weight: 600;
        }

        .investment-calculation {
          background: #eff6ff;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
          text-align: center;
        }

        .calculation-result {
          font-size: 1.5rem;
          font-weight: 700;
          color: #3b82f6;
          margin-top: 0.5rem;
        }

        .modal-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .modal-actions .btn {
          flex: 1;
        }

        @media (max-width: 768px) {
          .container {
            padding: 16px;
          }

          .header-section {
            flex-direction: column;
            gap: 1rem;
          }

          .filters-grid {
            grid-template-columns: 1fr;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .tokens-grid {
            grid-template-columns: 1fr;
            padding: 1rem;
          }

          .token-metrics {
            grid-template-columns: 1fr;
          }

          .modal {
            width: 95%;
            margin: 1rem;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .preview-grid {
            grid-template-columns: 1fr;
          }

          .modal-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default InvestmentPortal;