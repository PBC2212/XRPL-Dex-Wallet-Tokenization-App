import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiService from '../services/apiService';

const Dashboard = ({ currentWallet, networkInfo }) => {
  // EXISTING STATE (maintained for compatibility)
  const [balance, setBalance] = useState(null);
  const [trustlines, setTrustlines] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalBalance: 0,
    activeTokens: 0,
    totalTransactions: 0,
    portfolioValue: 0
  });

  // NEW STATE for enhanced features
  // Removed dashboardData since it's not being used in the render
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userTokens, setUserTokens] = useState([]);

  const resetDashboardState = useCallback(() => {
    setBalance(null);
    setTrustlines([]);
    setRecentTransactions([]);
    setUserTokens([]);
    // Removed dashboardData reset since we removed the state
    setStats({
      totalBalance: 0,
      activeTokens: 0,
      totalTransactions: 0,
      portfolioValue: 0
    });
  }, []);

  // Load dashboard data - wrapped in useCallback to fix dependency warning
  const loadDashboardData = useCallback(async () => {
    if (!currentWallet) return;

    try {
      setLoading(true);
      setError(null);
      
      // TRY NEW: Enhanced dashboard endpoint first
      try {
        const response = await apiService.getDashboardData(currentWallet.address);
        
        if (response && response.success) {
          const data = response.data;
          // Removed setDashboardData since we removed the state
          
          // Update existing state for backward compatibility
          setBalance(data.balance);
          setTrustlines(data.trustlines || []);
          setRecentTransactions(data.recentTransactions || []);
          setUserTokens(data.userTokens || []);
          
          // Enhanced stats
          setStats({
            totalBalance: data.stats?.totalBalance || parseFloat(data.balance?.xrpBalance || 0),
            activeTokens: data.stats?.activeTokens || (data.trustlines || []).filter(tl => parseFloat(tl.balance || 0) > 0).length,
            totalTransactions: data.stats?.totalTransactions || (data.recentTransactions || []).length,
            portfolioValue: data.stats?.portfolioValue || parseFloat(data.balance?.xrpBalance || 0) * 0.5,
            createdTokens: data.stats?.createdTokens || (data.userTokens || []).length
          });
          
          console.log('✅ Dashboard data loaded from enhanced endpoint');
          return;
        }
      } catch (enhancedError) {
        console.log('Enhanced dashboard endpoint failed, using fallback method');
      }

      // FALLBACK: Use original individual API calls (maintains existing functionality)
      console.log('📋 Loading dashboard data using individual API calls...');
      
      // Load balance
      const balanceResponse = await apiService.getBalance(currentWallet.address);
      setBalance(balanceResponse.data);

      // Load trustlines (with error handling for new accounts)
      let trustlinesData = [];
      try {
        const trustlinesResponse = await apiService.getTrustlines(currentWallet.address);
        trustlinesData = trustlinesResponse.data.trustlines || [];
      } catch (trustlineError) {
        console.log('No trustlines found (account may be new)');
        trustlinesData = [];
      }
      setTrustlines(trustlinesData);

      // Load recent transactions (with error handling)
      let transactionsData = [];
      try {
        const transactionsResponse = await apiService.getTransactions(currentWallet.address, 5);
        transactionsData = transactionsResponse.data.transactions || [];
      } catch (transactionError) {
        console.log('No transactions found');
        transactionsData = [];
      }
      setRecentTransactions(transactionsData);

      // Calculate stats using original method
      const xrpBalance = parseFloat(balanceResponse.data.xrpBalance || 0);
      const activeTokensCount = trustlinesData.filter(tl => parseFloat(tl.balance) > 0).length;
      const totalTxCount = transactionsData.length;

      setStats({
        totalBalance: xrpBalance,
        activeTokens: activeTokensCount,
        totalTransactions: totalTxCount,
        portfolioValue: xrpBalance * 0.5, // Mock portfolio value
        createdTokens: 0 // Will be enhanced later
      });

      console.log('✅ Dashboard data loaded using fallback method');

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentWallet]); // Add currentWallet as dependency since it's used in the function

  // Load dashboard data - fixed dependency array
  useEffect(() => {
    if (currentWallet) {
      loadDashboardData();
    } else {
      setLoading(false);
      resetDashboardState();
    }
  }, [currentWallet, loadDashboardData, resetDashboardState]);

  const refreshData = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // EXISTING: No wallet connected state (unchanged)
  if (!currentWallet) {
    return (
      <div className="dashboard">
        <div className="welcome-section">
          <div className="welcome-card">
            <div className="welcome-icon">🏗️</div>
            <h2>Welcome to XRPL Tokenization Platform</h2>
            <p>
              Create, manage, and trade tokenized assets on the XRP Ledger. 
              Get started by creating or importing a wallet.
            </p>
            <Link to="/wallet" className="btn btn-primary">
              Get Started
            </Link>
          </div>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">👛</div>
            <h3>Secure Wallet Management</h3>
            <p>Create and manage XRPL wallets with industry-standard encryption</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏠</div>
            <h3>Real Estate Tokenization</h3>
            <p>Tokenize real estate properties for fractional ownership</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💎</div>
            <h3>Investment Opportunities</h3>
            <p>Browse and invest in tokenized assets with complete transparency</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Portfolio Tracking</h3>
            <p>Monitor your investments and track performance in real-time</p>
          </div>
        </div>
      </div>
    );
  }

  // EXISTING: Loading state (unchanged)
  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-section">
          <div className="loading-spinner"></div>
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  // NEW: Error state
  if (error) {
    return (
      <div className="dashboard">
        <div className="error-section">
          <div className="error-card">
            <h3>❌ Error Loading Dashboard</h3>
            <p>{error}</p>
            <button onClick={loadDashboardData} className="btn btn-primary">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* ENHANCED: Header with refresh button */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Dashboard</h1>
          <p>Welcome back! Here's your portfolio overview.</p>
        </div>
        <button 
          onClick={refreshData} 
          disabled={refreshing}
          className="btn btn-secondary"
        >
          {refreshing ? (
            <>
              <div className="spinner spinner-sm"></div>
              Refreshing...
            </>
          ) : (
            <>🔄 Refresh</>
          )}
        </button>
      </div>

      {/* ENHANCED: Stats Grid with new metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>XRP Balance</h3>
            <p className="stat-value">{apiService.formatXRP(stats.totalBalance)}</p>
            <span className="stat-change neutral">
              {balance?.accountData ? 'Active' : 'Not Activated'}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🪙</div>
          <div className="stat-content">
            <h3>Active Tokens</h3>
            <p className="stat-value">{stats.activeTokens}</p>
            <span className="stat-change neutral">Holdings</span>
          </div>
        </div>

        {/* NEW: Created Tokens stat */}
        <div className="stat-card">
          <div className="stat-icon">🏗️</div>
          <div className="stat-content">
            <h3>Created Tokens</h3>
            <p className="stat-value">{stats.createdTokens || 0}</p>
            <span className="stat-change neutral">Issued</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <h3>Transactions</h3>
            <p className="stat-value">{stats.totalTransactions}</p>
            <span className="stat-change neutral">Total</span>
          </div>
        </div>
      </div>

      {/* EXISTING: Main Content Grid (enhanced) */}
      <div className="content-grid">
        {/* Quick Actions - unchanged */}
        <div className="panel">
          <div className="panel-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="quick-actions">
            <Link to="/tokens" className="action-button">
              <div className="action-icon">🏗️</div>
              <div className="action-content">
                <h4>Create Token</h4>
                <p>Tokenize a new asset</p>
              </div>
            </Link>
            <Link to="/invest" className="action-button">
              <div className="action-icon">💎</div>
              <div className="action-content">
                <h4>Browse Assets</h4>
                <p>Find investment opportunities</p>
              </div>
            </Link>
            <Link to="/wallet" className="action-button">
              <div className="action-icon">👛</div>
              <div className="action-content">
                <h4>Manage Wallet</h4>
                <p>Wallet operations</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Token Holdings - enhanced but backward compatible */}
        <div className="panel">
          <div className="panel-header">
            <h3>Token Holdings</h3>
            <Link to="/invest" className="panel-link">View All</Link>
          </div>
          <div className="token-list">
            {trustlines.length > 0 ? (
              trustlines.slice(0, 5).map((trustline, index) => (
                <div key={index} className="token-item">
                  <div className="token-icon">{trustline.currency}</div>
                  <div className="token-info">
                    <h4>{trustline.currency}</h4>
                    <p>{apiService.truncateAddress(trustline.account)}</p>
                  </div>
                  <div className="token-amount">
                    <p className="amount">{apiService.formatTokenAmount(trustline.balance, trustline.currency)}</p>
                    <p className="limit">Limit: {apiService.formatTokenAmount(trustline.limit, trustline.currency)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No token holdings yet</p>
                <Link to="/invest" className="btn btn-primary btn-sm">Browse Assets</Link>
              </div>
            )}
          </div>
        </div>

        {/* NEW: Created Tokens section */}
        <div className="panel">
          <div className="panel-header">
            <h3>Your Created Tokens</h3>
            <Link to="/tokens" className="panel-link">Create New</Link>
          </div>
          <div className="token-list">
            {userTokens && userTokens.length > 0 ? (
              userTokens.slice(0, 5).map((token, index) => (
                <div key={index} className="token-item">
                  <div className="token-icon">{token.currencyCode}</div>
                  <div className="token-info">
                    <h4>{token.name}</h4>
                    <p>{token.currencyCode} • {token.totalSupply?.toLocaleString()}</p>
                  </div>
                  <div className="token-amount">
                    <p className="amount">Supply: {token.totalSupply?.toLocaleString()}</p>
                    <p className="limit">Created: {new Date(token.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No tokens created yet</p>
                <Link to="/tokens" className="btn btn-primary btn-sm">Create Token</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity - enhanced */}
        <div className="panel">
          <div className="panel-header">
            <h3>Recent Activity</h3>
            <Link to="/transactions" className="panel-link">View All</Link>
          </div>
          <div className="activity-list">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">
                    {apiService.getTransactionIcon(tx.type || tx.transaction?.TransactionType)}
                  </div>
                  <div className="activity-info">
                    <h4>{tx.description || tx.transaction?.TransactionType || 'Transaction'}</h4>
                    <p>{apiService.formatTimestamp(tx.timestamp || tx.transaction?.date)}</p>
                  </div>
                  <div className="activity-amount">
                    <p>{tx.transaction?.Amount ? apiService.formatXRP(tx.transaction.Amount / 1000000) : 'N/A'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No recent transactions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ENHANCED: Account & Network Status */}
      <div className="bottom-grid">
        {/* Account Information */}
        <div className="panel">
          <div className="panel-header">
            <h3>Account Information</h3>
          </div>
          <div className="account-details">
            <div className="detail-row">
              <span className="detail-label">Address:</span>
              <span className="detail-value">{apiService.truncateAddress(currentWallet.address, 10, 8)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value">
                {balance?.accountData ? (
                  <span className="status-indicator status-success">
                    <span className="status-dot"></span>
                    Active
                  </span>
                ) : (
                  <span className="status-indicator status-warning">
                    <span className="status-dot"></span>
                    Not Activated
                  </span>
                )}
              </span>
            </div>
            {balance?.accountData && (
              <>
                <div className="detail-row">
                  <span className="detail-label">Sequence:</span>
                  <span className="detail-value">{balance.accountData.Sequence}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reserve:</span>
                  <span className="detail-value">{((balance.accountData.OwnerCount || 0) * 2 + 10).toFixed(6)} XRP</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Network Status */}
        {networkInfo && (
          <div className="panel">
            <div className="panel-header">
              <h3>Network Status</h3>
            </div>
            <div className="network-details">
              <div className="detail-row">
                <span className="detail-label">Network:</span>
                <span className="detail-value">
                  <span className={`status-indicator status-${networkInfo.network?.toLowerCase() === 'mainnet' ? 'success' : 'warning'}`}>
                    <span className="status-dot"></span>
                    {networkInfo.network}
                  </span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Ledger:</span>
                <span className="detail-value">{networkInfo.serverInfo?.validated_ledger?.seq?.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Base Reserve:</span>
                <span className="detail-value">{networkInfo.serverInfo?.validated_ledger?.reserve_base_xrp} XRP</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Owner Reserve:</span>
                <span className="detail-value">{networkInfo.serverInfo?.validated_ledger?.reserve_inc_xrp} XRP</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EXISTING STYLES (maintained for compatibility) */}
      <style jsx>{`
        .dashboard {
          max-width: 1400px;
          margin: 0 auto;
        }

        .welcome-section {
          text-align: center;
          margin-bottom: 3rem;
        }

        .welcome-card {
          background: white;
          border-radius: 16px;
          padding: 3rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
          max-width: 600px;
          margin: 0 auto;
        }

        .welcome-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .welcome-card h2 {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 1rem;
        }

        .welcome-card p {
          color: #6b7280;
          font-size: 1.1rem;
          margin-bottom: 2rem;
          line-height: 1.6;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
          margin-top: 3rem;
        }

        .feature-card {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .feature-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .feature-card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.75rem;
        }

        .feature-card p {
          color: #6b7280;
          line-height: 1.5;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .header-content h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .header-content p {
          color: #6b7280;
          margin: 0;
        }

        .loading-section {
          text-align: center;
          padding: 4rem 0;
        }

        .error-section {
          text-align: center;
          padding: 4rem 0;
        }

        .error-card {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          max-width: 400px;
          margin: 0 auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .error-card h3 {
          color: #ef4444;
          margin-bottom: 1rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .stat-icon {
          font-size: 2.5rem;
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
          font-size: 1.75rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .stat-change {
          font-size: 0.875rem;
          font-weight: 500;
        }

        .stat-change.positive { color: #10b981; }
        .stat-change.negative { color: #ef4444; }
        .stat-change.neutral { color: #6b7280; }

        .content-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
        }

        .bottom-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .panel {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          overflow: hidden;
        }

        .panel-header {
          padding: 1.5rem 1.5rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #f3f4f6;
        }

        .panel-header h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
        }

        .panel-link {
          color: #3b82f6;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .panel-link:hover {
          color: #1d4ed8;
        }

        .quick-actions {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: background-color 0.2s;
        }

        .action-button:hover {
          background: #e2e8f0;
        }

        .action-icon {
          font-size: 1.5rem;
        }

        .action-content h4 {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .action-content p {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .token-list,
        .activity-list {
          padding: 1rem;
        }

        .token-item,
        .activity-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .token-item:last-child,
        .activity-item:last-child {
          border-bottom: none;
        }

        .token-icon,
        .activity-icon {
          font-size: 1.5rem;
          width: 40px;
          text-align: center;
        }

        .token-info,
        .activity-info {
          flex: 1;
        }

        .token-info h4,
        .activity-info h4 {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .token-info p,
        .activity-info p {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .token-amount {
          text-align: right;
        }

        .token-amount .amount,
        .activity-amount p {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .token-amount .limit {
          font-size: 0.75rem;
          color: #6b7280;
          margin: 0;
        }

        .empty-state {
          text-align: center;
          padding: 2rem 0;
          color: #6b7280;
        }

        .account-details,
        .network-details {
          padding: 1rem 1.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          font-weight: 500;
          color: #6b7280;
        }

        .detail-value {
          font-weight: 600;
          color: #1f2937;
        }

        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-success {
          background-color: #dcfce7;
          color: #166534;
        }

        .status-warning {
          background-color: #fef3c7;
          color: #92400e;
        }

        .status-error {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: currentColor;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .content-grid,
          .bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .welcome-card {
            padding: 2rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;