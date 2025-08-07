import React, { useState, useEffect } from 'react';
import apiService from '../services/apiService';

const WalletManager = ({ currentWallet, onWalletSelect }) => {
  const [activeTab, setActiveTab] = useState('create');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', content: '' });
  const [newWallet, setNewWallet] = useState(null);
  const [importSeed, setImportSeed] = useState('');
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (currentWallet) {
      loadWalletBalance();
    }
  }, [currentWallet]);

  const loadWalletBalance = async () => {
    if (!currentWallet) return;
    try {
      const response = await apiService.getBalance(currentWallet.address);
      if (response && response.success) {
        setBalance(response.data);
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const showMessage = (type, content) => {
    setMessage({ type, content });
    setTimeout(() => setMessage({ type: '', content: '' }), 5000);
  };

  const handleCreateWallet = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', content: 'Generating secure wallet...' });
      
      const response = await apiService.generateWallet();
      
      if (response && response.success && response.data) {
        setNewWallet(response.data);
        setMessage({ type: 'success', content: 'Wallet generated successfully!' });
      } else {
        throw new Error('Failed to generate wallet');
      }
    } catch (error) {
      console.error('Wallet generation error:', error);
      setMessage({ type: 'error', content: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleImportWallet = async () => {
    if (!importSeed.trim()) {
      setMessage({ type: 'error', content: 'Please enter a seed phrase' });
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: 'info', content: 'Importing wallet...' });
      
      const response = await apiService.importWallet(importSeed.trim());
      
      if (response && response.success && response.data) {
        onWalletSelect({
          address: response.data.address,
          publicKey: response.data.publicKey,
          imported: true
        });
        setMessage({ type: 'success', content: 'Wallet imported successfully!' });
        setImportSeed('');
        setActiveTab('create');
      } else {
        throw new Error('Failed to import wallet');
      }
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', content: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWallet = (wallet) => {
    onWalletSelect({
      address: wallet.address,
      publicKey: wallet.publicKey,
      seed: wallet.seed
    });
    setMessage({ type: 'success', content: 'Wallet selected successfully!' });
    setNewWallet(null);
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ type: 'success', content: `${label} copied to clipboard` });
    } catch (error) {
      setMessage({ type: 'error', content: 'Failed to copy to clipboard' });
    }
  };

  return (
    <div className="container">
      <div className="mb-6">
        <h1>Wallet Management</h1>
        <p>Create, import, and manage your XRPL wallets securely</p>
      </div>

      {currentWallet && (
        <div className="card" style={{ border: '2px solid #10b981', backgroundColor: '#f0fdf4' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ color: '#059669', marginBottom: 0 }}>Active Wallet</h3>
            <button onClick={loadWalletBalance} className="btn btn-sm btn-secondary">
              Refresh Balance
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="form-label">Wallet Address</label>
              <div className="flex gap-2">
                <div className="code-block flex-1" style={{ marginBottom: 0 }}>
                  {currentWallet.address}
                </div>
                <button 
                  onClick={() => copyToClipboard(currentWallet.address, 'Address')}
                  className="btn btn-sm btn-secondary"
                >
                  Copy
                </button>
              </div>
            </div>
            
            {balance && (
              <div>
                <label className="form-label">Balance</label>
                <div className="text-xl font-semibold" style={{ color: '#059669' }}>
                  {apiService.formatXRP(balance.xrpBalance)}
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <button 
              onClick={() => onWalletSelect(null)}
              className="btn btn-secondary"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}

      {message.content && (
        <div className={`alert alert-${message.type}`}>
          <strong>
            {message.type === 'success' && 'Success: '}
            {message.type === 'error' && 'Error: '}
            {message.type === 'info' && 'Info: '}
          </strong>
          {message.content}
        </div>
      )}

      <div className="card">
        <div className="flex border-b mb-6">
          <button
            onClick={() => setActiveTab('create')}
            className="px-4 py-2 font-medium border-b-2"
            style={{ 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'create' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'create' ? '#3b82f6' : '#64748b'
            }}
          >
            Create Wallet
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className="px-4 py-2 font-medium border-b-2 ml-8"
            style={{ 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'import' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'import' ? '#3b82f6' : '#64748b'
            }}
          >
            Import Wallet
          </button>
        </div>

        {activeTab === 'create' && (
          <div>
            <h3>Create New Wallet</h3>
            <p className="mb-4">Generate a new XRPL wallet with a unique seed phrase</p>
            
            <div className="text-center mb-6">
              <button 
                onClick={handleCreateWallet}
                disabled={loading}
                className="btn btn-lg btn-primary"
              >
                {loading ? (
                  <>
                    <div className="spinner spinner-sm"></div>
                    Generating...
                  </>
                ) : (
                  'Generate New Wallet'
                )}
              </button>
            </div>

            {newWallet && (
              <div className="card" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <h4 style={{ color: '#059669' }}>Wallet Generated Successfully</h4>
                
                <div className="alert alert-warning mb-4">
                  <strong>Important:</strong> Save your seed phrase in a secure location. This is the only way to recover your wallet!
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="form-label">Wallet Address</label>
                    <div className="flex gap-2">
                      <div className="code-block flex-1" style={{ marginBottom: 0 }}>
                        {newWallet.address}
                      </div>
                      <button 
                        onClick={() => copyToClipboard(newWallet.address, 'Address')}
                        className="btn btn-sm btn-secondary"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Seed Phrase (Keep Secret!)</label>
                    <div className="flex gap-2">
                      <div className="code-block code-block-danger flex-1" style={{ marginBottom: 0 }}>
                        {newWallet.seed}
                      </div>
                      <button 
                        onClick={() => copyToClipboard(newWallet.seed, 'Seed phrase')}
                        className="btn btn-sm btn-secondary"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Public Key</label>
                    <div className="flex gap-2">
                      <div className="code-block flex-1" style={{ marginBottom: 0 }}>
                        {newWallet.publicKey}
                      </div>
                      <button 
                        onClick={() => copyToClipboard(newWallet.publicKey, 'Public key')}
                        className="btn btn-sm btn-secondary"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={() => handleSelectWallet(newWallet)}
                    className="btn btn-success"
                  >
                    Use This Wallet
                  </button>
                  <button 
                    onClick={() => setNewWallet(null)}
                    className="btn btn-secondary"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div>
            <h3>Import Existing Wallet</h3>
            <p className="mb-4">Restore your wallet using your seed phrase</p>

            <div className="form-group">
              <label className="form-label">Seed Phrase</label>
              <textarea
                value={importSeed}
                onChange={(e) => setImportSeed(e.target.value)}
                placeholder="Enter your seed phrase here..."
                className="form-control"
                rows="4"
                disabled={loading}
                style={{ fontFamily: 'monospace' }}
              />
              <div className="form-text">
                Enter your 12-24 word recovery phrase or hex seed
              </div>
            </div>

            <div className="text-center">
              <button 
                onClick={handleImportWallet}
                disabled={loading || !importSeed.trim()}
                className="btn btn-lg btn-primary"
              >
                {loading ? (
                  <>
                    <div className="spinner spinner-sm"></div>
                    Importing...
                  </>
                ) : (
                  'Import Wallet'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletManager;