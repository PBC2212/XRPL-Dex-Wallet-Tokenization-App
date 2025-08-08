import React, { useState } from 'react';
import apiService from '../services/apiService';

const TokenCreator = ({ currentWallet }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', content: '' });
  const [formData, setFormData] = useState({
    tokenCode: '',
    totalSupply: '',
    tokenName: '',
    description: '',
    assetType: 'real-estate',
    transferFee: '0',
    requireAuth: false
  });
  const [createdToken, setCreatedToken] = useState(null);

  const showMessage = (type, content) => {
    setMessage({ type, content });
    setTimeout(() => setMessage({ type: '', content: '' }), 6000);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    const errors = [];

    if (!formData.tokenCode.trim()) {
      errors.push('Token code is required');
    } else if (formData.tokenCode.length < 3 || formData.tokenCode.length > 20) {
      errors.push('Token code must be 3-20 characters');
    } else if (!/^[A-Za-z0-9]+$/.test(formData.tokenCode)) {
      errors.push('Token code can only contain letters and numbers');
    }

    if (!formData.totalSupply.trim()) {
      errors.push('Total supply is required');
    } else if (isNaN(formData.totalSupply) || parseInt(formData.totalSupply) <= 0) {
      errors.push('Total supply must be a positive number');
    } else if (parseInt(formData.totalSupply) > 1000000000) {
      errors.push('Total supply cannot exceed 1 billion');
    }

    if (!formData.tokenName.trim()) {
      errors.push('Token name is required');
    }

    if (formData.transferFee && (isNaN(formData.transferFee) || parseFloat(formData.transferFee) < 0)) {
      errors.push('Transfer fee must be a positive number');
    }

    return errors;
  };

  const handleCreateToken = async () => {
    if (!currentWallet) {
      showMessage('error', 'Please connect a wallet first');
      return;
    }

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      showMessage('error', validationErrors[0]);
      return;
    }

    try {
      setLoading(true);
      showMessage('info', 'Creating token on XRPL...');

      // Prepare token metadata
      const metadata = {
        name: formData.tokenName,
        description: formData.description,
        assetType: formData.assetType,
        created: new Date().toISOString(),
        issuer: currentWallet.address
      };

      // Create token using the API
      const response = await apiService.createToken({
        issuerSeed: currentWallet.seed,
        tokenCode: formData.tokenCode.toUpperCase(),
        totalSupply: parseInt(formData.totalSupply),
        metadata: metadata,
        transferFee: parseFloat(formData.transferFee) || 0,
        requireAuth: formData.requireAuth
      });

      if (response && response.success) {
        setCreatedToken({
          ...response.data,
          metadata: metadata,
          formData: formData
        });
        showMessage('success', 'Token created successfully on XRPL!');
        
        // Reset form
        setFormData({
          tokenCode: '',
          totalSupply: '',
          tokenName: '',
          description: '',
          assetType: 'real-estate',
          transferFee: '0',
          requireAuth: false
        });
      } else {
        throw new Error('Failed to create token');
      }
    } catch (error) {
      console.error('Token creation error:', error);
      showMessage('error', `Token creation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      showMessage('success', `${label} copied to clipboard!`);
    } catch (error) {
      showMessage('error', 'Failed to copy to clipboard');
    }
  };

  if (!currentWallet) {
    return (
      <div className="container">
        <div className="mb-6">
          <h1>Token Creator</h1>
          <p>Create and manage tokenized assets on the XRPL</p>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔐</div>
          <h3 style={{ marginBottom: '1rem' }}>Wallet Required</h3>
          <p style={{ marginBottom: '2rem', color: '#64748b' }}>
            You need to connect a wallet before you can create tokens. 
            Please go to the Wallet Manager to create or import a wallet.
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
        <h1>Token Creator</h1>
        <p>Create tokenized assets on the XRPL for real estate, art, and other valuable assets</p>
      </div>

      {/* Connected Wallet Info */}
      <div className="card" style={{ 
        border: '1px solid #10b981', 
        backgroundColor: '#f0fdf4',
        marginBottom: '2rem'
      }}>
        <h4 style={{ color: '#059669', marginBottom: '0.5rem' }}>
          Connected Wallet
        </h4>
        <p style={{ marginBottom: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {currentWallet.address}
        </p>
      </div>

      {/* Status Messages */}
      {message.content && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '2rem' }}>
          <strong>
            {message.type === 'success' && 'Success: '}
            {message.type === 'error' && 'Error: '}
            {message.type === 'info' && 'Info: '}
          </strong>
          {message.content}
        </div>
      )}

      {/* Token Creation Form */}
      <div className="card">
        <div className="card-header">
          <h3>Create New Token</h3>
          <p>Tokenize your asset on the XRPL blockchain</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Left Column */}
          <div>
            <div className="form-group">
              <label className="form-label">Token Code *</label>
              <input
                type="text"
                value={formData.tokenCode}
                onChange={(e) => handleInputChange('tokenCode', e.target.value.toUpperCase())}
                placeholder="e.g., PROP, ART, GOLD"
                className="form-control"
                maxLength="20"
                disabled={loading}
                style={{ textTransform: 'uppercase' }}
              />
              <div className="form-text">
                3-20 characters, letters and numbers only
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Total Supply *</label>
              <input
                type="number"
                value={formData.totalSupply}
                onChange={(e) => handleInputChange('totalSupply', e.target.value)}
                placeholder="e.g., 1000000"
                className="form-control"
                min="1"
                max="1000000000"
                disabled={loading}
              />
              <div className="form-text">
                Number of tokens to create (1 - 1 billion)
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Asset Type</label>
              <select
                value={formData.assetType}
                onChange={(e) => handleInputChange('assetType', e.target.value)}
                className="form-control"
                disabled={loading}
              >
                <option value="real-estate">Real Estate</option>
                <option value="art">Art & Collectibles</option>
                <option value="precious-metals">Precious Metals</option>
                <option value="business-equity">Business Equity</option>
                <option value="intellectual-property">Intellectual Property</option>
                <option value="other">Other Asset</option>
              </select>
            </div>
          </div>

          {/* Right Column */}
          <div>
            <div className="form-group">
              <label className="form-label">Token Name *</label>
              <input
                type="text"
                value={formData.tokenName}
                onChange={(e) => handleInputChange('tokenName', e.target.value)}
                placeholder="e.g., Miami Beach Condo Token"
                className="form-control"
                maxLength="100"
                disabled={loading}
              />
              <div className="form-text">
                Descriptive name for your token
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe your asset..."
                className="form-control"
                rows="3"
                maxLength="500"
                disabled={loading}
              />
              <div className="form-text">
                Optional description of the tokenized asset
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Transfer Fee (%)</label>
              <input
                type="number"
                value={formData.transferFee}
                onChange={(e) => handleInputChange('transferFee', e.target.value)}
                placeholder="0"
                className="form-control"
                min="0"
                max="100"
                step="0.01"
                disabled={loading}
              />
              <div className="form-text">
                Optional fee for token transfers (0-100%)
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Options */}
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={formData.requireAuth}
              onChange={(e) => handleInputChange('requireAuth', e.target.checked)}
              disabled={loading}
            />
            <span className="form-label" style={{ margin: 0 }}>
              Require authorization for trustlines
            </span>
          </label>
          <div className="form-text">
            If enabled, you must approve each holder before they can receive tokens
          </div>
        </div>

        {/* Create Button */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button 
            onClick={handleCreateToken}
            disabled={loading}
            className="btn btn-lg btn-primary"
            style={{ fontSize: '1.1rem', padding: '1rem 2.5rem' }}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Creating Token...
              </>
            ) : (
              '🚀 Create Token on XRPL'
            )}
          </button>
        </div>
      </div>

      {/* Token Creation Success */}
      {createdToken && (
        <div className="card" style={{ 
          backgroundColor: '#f0fdf4', 
          border: '2px solid #bbf7d0',
          marginTop: '2rem'
        }}>
          <h4 style={{ color: '#059669', marginBottom: '1rem' }}>
            ✅ Token Created Successfully!
          </h4>

          <div className="grid grid-cols-1 gap-4">
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              padding: '1rem',
              borderRadius: '8px'
            }}>
              <div className="flex justify-between items-center mb-2">
                <strong>Token Information</strong>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Token Code</label>
                  <div className="flex gap-2">
                    <div className="code-block flex-1" style={{ marginBottom: 0 }}>
                      {createdToken.formData.tokenCode}
                    </div>
                    <button 
                      onClick={() => copyToClipboard(createdToken.formData.tokenCode, 'Token code')}
                      className="btn btn-sm btn-secondary"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">Total Supply</label>
                  <div className="code-block" style={{ marginBottom: 0 }}>
                    {parseInt(createdToken.formData.totalSupply).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="form-label">Token Name</label>
                  <div className="code-block" style={{ marginBottom: 0 }}>
                    {createdToken.formData.tokenName}
                  </div>
                </div>
                <div>
                  <label className="form-label">Asset Type</label>
                  <div className="code-block" style={{ marginBottom: 0 }}>
                    {createdToken.formData.assetType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              padding: '1rem',
              borderRadius: '8px'
            }}>
              <label className="form-label">Issuer Address</label>
              <div className="flex gap-2">
                <div className="code-block flex-1" style={{ marginBottom: 0, fontSize: '0.9rem' }}>
                  {currentWallet.address}
                </div>
                <button 
                  onClick={() => copyToClipboard(currentWallet.address, 'Issuer address')}
                  className="btn btn-sm btn-secondary"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="alert alert-info">
              <strong>Next Steps:</strong><br/>
              • Your token is now live on the XRPL<br/>
              • Investors can create trustlines to hold your token<br/>
              • You can issue tokens to investors through the Investment Portal
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button 
              onClick={() => setCreatedToken(null)}
              className="btn btn-secondary"
              style={{ marginRight: '1rem' }}
            >
              Create Another Token
            </button>
            <a href="/invest" className="btn btn-primary">
              Go to Investment Portal
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenCreator;