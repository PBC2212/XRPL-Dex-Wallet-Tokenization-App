import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Import components
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import WalletManager from './components/WalletManager';
import TokenCreator from './components/TokenCreator';
import InvestmentPortal from './components/InvestmentPortal';
import TransactionHistory from './components/TransactionHistory';

// API service
import apiService from './services/apiService';

function App() {
  const [currentWallet, setCurrentWallet] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load network information on app start
  useEffect(() => {
    loadNetworkInfo();
  }, []);

  const loadNetworkInfo = async () => {
    try {
      const response = await apiService.getNetworkInfo();
      console.log('Network info loaded:', response);
      
      if (response && response.success) {
        setNetworkInfo(response.data);
      } else {
        console.error('Invalid network info response:', response);
        // Set default network info if API fails
        setNetworkInfo({
          network: 'TESTNET',
          serverInfo: {
            validated_ledger: {
              seq: 'Loading...'
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load network info:', error);
      // Set default network info if API fails
      setNetworkInfo({
        network: 'TESTNET',
        serverInfo: {
          validated_ledger: {
            seq: 'Unavailable'
          }
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWalletSelect = (wallet) => {
    setCurrentWallet(wallet);
    // Store in localStorage for persistence
    if (wallet) {
      localStorage.setItem('currentWallet', JSON.stringify({
        address: wallet.address,
        publicKey: wallet.publicKey
      }));
    } else {
      localStorage.removeItem('currentWallet');
    }
  };

  // Load saved wallet on app start
  useEffect(() => {
    const savedWallet = localStorage.getItem('currentWallet');
    if (savedWallet) {
      try {
        const wallet = JSON.parse(savedWallet);
        setCurrentWallet(wallet);
      } catch (error) {
        console.error('Failed to load saved wallet:', error);
        localStorage.removeItem('currentWallet');
      }
    }
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1rem'
        }}></div>
        <p style={{ color: '#6b7280', fontWeight: '500' }}>
          Connecting to XRPL Network...
        </p>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        <Sidebar 
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          currentWallet={currentWallet}
          networkInfo={networkInfo}
        />
        
        <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <header className="app-header">
            <button 
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            
            <h1>XRPL Tokenization Platform</h1>
            
            {networkInfo && networkInfo.network && (
              <div className="network-status">
                <span className={`status-dot ${networkInfo.network.toLowerCase()}`}></span>
                {networkInfo.network}
              </div>
            )}
          </header>

          <div className="content">
            <Routes>
              <Route 
                path="/" 
                element={
                  <Dashboard 
                    currentWallet={currentWallet}
                    networkInfo={networkInfo}
                  />
                } 
              />
              
              <Route 
                path="/wallet" 
                element={
                  <WalletManager 
                    currentWallet={currentWallet}
                    onWalletSelect={handleWalletSelect}
                  />
                } 
              />
              
              <Route 
                path="/tokens" 
                element={
                  <TokenCreator 
                    currentWallet={currentWallet}
                  />
                } 
              />
              
              <Route 
                path="/invest" 
                element={
                  <InvestmentPortal 
                    currentWallet={currentWallet}
                  />
                } 
              />
              
              <Route 
                path="/transactions" 
                element={
                  <TransactionHistory 
                    currentWallet={currentWallet}
                  />
                } 
              />
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;