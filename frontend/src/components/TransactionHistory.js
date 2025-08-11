import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../services/apiService';

const TransactionHistory = ({ currentWallet }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    hasMore: false,
    totalCount: 0
  });
  const [filter, setFilter] = useState({
    type: 'all',
    status: 'all',
    search: ''
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = useCallback(async (isRefresh = false) => {
    if (!currentWallet) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await apiService.getTransactions(
        currentWallet.address,
        pagination.limit,
        pagination.offset
      );

      if (response && response.success) {
        let filteredTransactions = response.data.transactions || [];

        // Apply filters
        if (filter.type !== 'all') {
          filteredTransactions = filteredTransactions.filter(tx => 
            tx.type === filter.type
          );
        }

        if (filter.status !== 'all') {
          filteredTransactions = filteredTransactions.filter(tx => 
            tx.status?.toLowerCase() === filter.status.toLowerCase()
          );
        }

        if (filter.search) {
          const searchLower = filter.search.toLowerCase();
          filteredTransactions = filteredTransactions.filter(tx => 
            tx.description?.toLowerCase().includes(searchLower) ||
            tx.type?.toLowerCase().includes(searchLower) ||
            tx.id?.toLowerCase().includes(searchLower)
          );
        }

        setTransactions(filteredTransactions);
        setPagination(prev => ({
          ...prev,
          hasMore: response.data.pagination?.hasMore || false,
          totalCount: response.data.totalCount || 0
        }));
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentWallet, pagination.limit, pagination.offset, filter]);

  useEffect(() => {
    if (currentWallet) {
      loadTransactions();
    } else {
      setTransactions([]);
      setLoading(false);
    }
  }, [currentWallet, loadTransactions]);

  const handleRefresh = () => {
    setPagination(prev => ({ ...prev, offset: 0 }));
    loadTransactions(true);
  };

  const handleLoadMore = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  const handleFilterChange = (key, value) => {
    setFilter(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const getTransactionTypeDisplay = (type) => {
    const types = {
      'WALLET_CREATED': 'Wallet Created',
      'WALLET_IMPORTED': 'Wallet Imported',
      'TOKEN_CREATED': 'Token Created',
      'TRUSTLINE_CREATED': 'Trustline Created',
      'PAYMENT': 'Payment',
      'ACCOUNT_ACTIVATION': 'Account Activation'
    };
    return types[type] || type?.replace('_', ' ') || 'Unknown';
  };

  const getStatusDisplay = (status) => {
    const statuses = {
      'SUCCESS': 'Success',
      'PENDING': 'Pending',
      'FAILED': 'Failed'
    };
    return statuses[status] || status || 'Success';
  };

  if (!currentWallet) {
    return (
      <div className="container">
        <div className="mb-6">
          <h1>Transaction History</h1>
          <p>View your transaction history and activity</p>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ marginBottom: '1rem' }}>No Wallet Connected</h3>
          <p style={{ marginBottom: '2rem', color: '#64748b' }}>
            Connect a wallet to view your transaction history.
          </p>
          <a href="/wallet" className="btn btn-primary">
            Go to Wallet Manager
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="mb-6">
        <div className="header-section">
          <div>
            <h1>Transaction History</h1>
            <p>Track all your wallet activities and transactions</p>
          </div>
          <button
            onClick={handleRefresh}
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
      </div>

      {/* Wallet Info */}
      <div className="card" style={{ 
        border: '1px solid #10b981', 
        backgroundColor: '#f0fdf4',
        marginBottom: '2rem'
      }}>
        <h4 style={{ color: '#059669', marginBottom: '0.5rem' }}>
          Connected Wallet
        </h4>
        <p style={{ fontFamily: 'monospace', fontSize: '0.9rem', marginBottom: 0 }}>
          <strong>Address:</strong> {currentWallet.address}
        </p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Filters</h4>
        <div className="filters-grid">
          <div className="form-group">
            <label className="form-label">Transaction Type</label>
            <select
              value={filter.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="form-control"
            >
              <option value="all">All Types</option>
              <option value="WALLET_CREATED">Wallet Created</option>
              <option value="WALLET_IMPORTED">Wallet Imported</option>
              <option value="TOKEN_CREATED">Token Created</option>
              <option value="TRUSTLINE_CREATED">Trustline Created</option>
              <option value="PAYMENT">Payment</option>
              <option value="ACCOUNT_ACTIVATION">Account Activation</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              value={filter.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="form-control"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Search</label>
            <input
              type="text"
              value={filter.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search transactions..."
              className="form-control"
            />
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Total Transactions</h3>
            <p className="stat-value">{pagination.totalCount}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Successful</h3>
            <p className="stat-value">
              {transactions.filter(tx => (tx.status || 'SUCCESS') === 'SUCCESS').length}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>Pending</h3>
            <p className="stat-value">
              {transactions.filter(tx => tx.status === 'PENDING').length}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <h3>Failed</h3>
            <p className="stat-value">
              {transactions.filter(tx => tx.status === 'FAILED').length}
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

      {/* Transactions List */}
      <div className="card">
        <div className="card-header">
          <h3>Transaction History</h3>
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Showing {transactions.length} of {pagination.totalCount} transactions
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="loading-spinner"></div>
            <p>Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <h3 style={{ marginBottom: '1rem' }}>No Transactions Found</h3>
            <p style={{ color: '#6b7280' }}>
              {filter.type !== 'all' || filter.status !== 'all' || filter.search
                ? 'No transactions match your current filters.'
                : 'You haven\'t made any transactions yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="transactions-list">
              {transactions.map((transaction, index) => (
                <div key={transaction.id || index} className="transaction-item">
                  <div className="transaction-icon">
                    {apiService.getTransactionIcon(transaction.type)}
                  </div>
                  
                  <div className="transaction-main">
                    <div className="transaction-header">
                      <h4>{transaction.description || getTransactionTypeDisplay(transaction.type)}</h4>
                      <span className={`status-badge status-${(transaction.status || 'success').toLowerCase()}`}>
                        {getStatusDisplay(transaction.status)}
                      </span>
                    </div>
                    
                    <div className="transaction-details">
                      <span className="transaction-type">
                        {getTransactionTypeDisplay(transaction.type)}
                      </span>
                      <span className="transaction-time">
                        {apiService.formatTimestamp(transaction.timestamp)}
                      </span>
                      {transaction.id && (
                        <span className="transaction-id">
                          ID: {apiService.truncateAddress(transaction.id, 8, 6)}
                        </span>
                      )}
                    </div>

                    {/* Transaction Details */}
                    {transaction.details && (
                      <div className="transaction-metadata">
                        {transaction.details.tokenId && (
                          <div className="metadata-item">
                            <span className="metadata-label">Token ID:</span>
                            <span className="metadata-value">
                              {apiService.truncateAddress(transaction.details.tokenId, 8, 6)}
                            </span>
                          </div>
                        )}
                        {transaction.details.currencyCode && (
                          <div className="metadata-item">
                            <span className="metadata-label">Currency:</span>
                            <span className="metadata-value">{transaction.details.currencyCode}</span>
                          </div>
                        )}
                        {transaction.details.name && (
                          <div className="metadata-item">
                            <span className="metadata-label">Name:</span>
                            <span className="metadata-value">{transaction.details.name}</span>
                          </div>
                        )}
                        {transaction.details.totalSupply && (
                          <div className="metadata-item">
                            <span className="metadata-label">Supply:</span>
                            <span className="metadata-value">
                              {apiService.formatNumber(transaction.details.totalSupply)}
                            </span>
                          </div>
                        )}
                        {transaction.details.address && (
                          <div className="metadata-item">
                            <span className="metadata-label">Address:</span>
                            <span className="metadata-value">
                              {apiService.truncateAddress(transaction.details.address)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {pagination.hasMore && (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="btn btn-secondary"
                >
                  {loading ? (
                    <>
                      <div className="spinner spinner-sm"></div>
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
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

        .transactions-list {
          padding: 0;
        }

        .transaction-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          transition: background-color 0.2s;
        }

        .transaction-item:hover {
          background-color: #f9fafb;
        }

        .transaction-item:last-child {
          border-bottom: none;
        }

        .transaction-icon {
          font-size: 1.5rem;
          width: 40px;
          height: 40px;
          background: #f3f4f6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .transaction-main {
          flex: 1;
          min-width: 0;
        }

        .transaction-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .transaction-header h4 {
          font-size: 1rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
          flex: 1;
          margin-right: 1rem;
        }

        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }

        .status-badge.status-success {
          background-color: #dcfce7;
          color: #166534;
        }

        .status-badge.status-pending {
          background-color: #fef3c7;
          color: #92400e;
        }

        .status-badge.status-failed {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .transaction-details {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .transaction-type,
        .transaction-time,
        .transaction-id {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .transaction-metadata {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.5rem;
          background: #f8fafc;
          border-radius: 6px;
          padding: 0.75rem;
          margin-top: 0.75rem;
        }

        .metadata-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metadata-label {
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 500;
        }

        .metadata-value {
          font-size: 0.75rem;
          color: #1f2937;
          font-weight: 600;
          font-family: monospace;
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

          .transaction-header {
            flex-direction: column;
            gap: 0.5rem;
          }

          .transaction-details {
            flex-direction: column;
            gap: 0.25rem;
          }

          .metadata-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default TransactionHistory;