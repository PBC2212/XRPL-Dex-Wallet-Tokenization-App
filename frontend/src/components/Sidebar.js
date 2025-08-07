import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import apiService from '../services/apiService';

const Sidebar = ({ isOpen, onToggle, currentWallet, networkInfo }) => {
  const location = useLocation();

  const menuItems = [
    {
      path: '/',
      icon: '📊',
      label: 'Dashboard',
      description: 'Overview & Statistics'
    },
    {
      path: '/wallet',
      icon: '💼',
      label: 'Wallet Manager',
      description: 'Create & Import Wallets'
    },
    {
      path: '/tokens',
      icon: '🪙',
      label: 'Token Creator',
      description: 'Tokenize Assets'
    },
    {
      path: '/invest',
      icon: '💎',
      label: 'Investment Portal',
      description: 'Browse & Invest'
    },
    {
      path: '/transactions',
      icon: '📋',
      label: 'Transactions',
      description: 'Transaction History'
    }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && window.innerWidth <= 768 && (
        <div className="sidebar-overlay" onClick={onToggle} />
      )}
      
      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Logo & Title */}
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏛️</span>
            <span className="logo-text">XRPL Platform</span>
          </div>
        </div>

        {/* Current Wallet Info */}
        {currentWallet && (
          <div className="wallet-info">
            <div className="wallet-card">
              <div className="wallet-label">Active Wallet</div>
              <div className="wallet-address">
                {apiService.truncateAddress(currentWallet.address, 8, 6)}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {menuItems.map((item) => (
              <li key={item.path} className="nav-item">
                <Link
                  to={item.path}
                  className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <div className="nav-content">
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-description">{item.description}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Network Status */}
        {networkInfo && (
          <div className="network-info">
            <div className="network-card">
              <div className="network-status-sidebar">
                <span className={`status-dot ${networkInfo.network ? networkInfo.network.toLowerCase() : 'testnet'}`}></span>
                <div>
                  <div className="network-name">
                    {networkInfo.network || 'TESTNET'}
                  </div>
                  <div className="network-desc">
                    Ledger: {networkInfo.serverInfo?.validated_ledger?.seq?.toLocaleString() || 'Loading...'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="version-info">Version 1.0.0</div>
          <div className="powered-by">Powered by XRPL</div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;