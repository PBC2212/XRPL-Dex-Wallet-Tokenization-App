/**
 * XRPL Token Issuer
 * Production-ready IOU token creation and management on XRPL
 */

const xrpl = require('xrpl');
const crypto = require('crypto');
const XRPL_CONFIG = require('../../config/xrpl-config');
const XRPLValidators = require('../utils/validators');
const { getXRPLClient } = require('../utils/xrpl-client');
require('dotenv').config();

class TokenIssuer {
  constructor() {
    this.issuedTokens = new Map(); // Track issued tokens
    this.client = getXRPLClient();
  }

  async createToken(tokenData, issuerWallet) {
    try {
      console.log('🪙 Creating new IOU token on XRPL...');
      const validation = XRPLValidators.validateTokenData(tokenData);
      if (!validation.isValid) {
        throw new Error(`Token validation failed: ${validation.errors.join(', ')}`);
      }

      const validated = validation.validated;
      await this.validateIssuerAccount(issuerWallet.classicAddress);

      const tokenMetadata = {
        tokenId: this.generateTokenId(),
        currencyCode: validated.currencyCode,
        issuer: issuerWallet.classicAddress,
        name: tokenData.name || `Token ${validated.currencyCode}`,
        symbol: tokenData.symbol || validated.currencyCode,
        decimals: tokenData.decimals || parseInt(process.env.DEFAULT_TOKEN_DECIMALS) || XRPL_CONFIG.TOKEN.DEFAULT_PRECISION,
        totalSupply: tokenData.totalSupply || '0',
        description: tokenData.description || '',
        metadata: validated.metadata || {},
        ipfsHash: validated.ipfsHash || null,
        createdAt: new Date().toISOString(),
        network: this.client.getNetworkType()
      };

      await this.configureIssuerAccount(issuerWallet, tokenData.settings || {});
      const memo = await this.createTokenMemo(tokenMetadata);
      this.issuedTokens.set(tokenMetadata.tokenId, tokenMetadata);

      console.log('✅ Token created successfully');
      console.log(`   Token ID: ${tokenMetadata.tokenId}`);
      console.log(`   Currency: ${tokenMetadata.currencyCode}`);
      console.log(`   Issuer: ${tokenMetadata.issuer}`);

      return {
        success: true,
        tokenId: tokenMetadata.tokenId,
        tokenInfo: tokenMetadata,
        memo: memo
      };
    } catch (error) {
      console.error('❌ Token creation failed:', error.message);
      throw new Error(`Token creation failed: ${error.message}`);
    }
  }

  async issueTokens(tokenId, destinationAddress, amount, issuerWallet, options = {}) {
    try {
      console.log(`💸 Issuing tokens: ${amount} ${tokenId}`);
      const tokenInfo = this.issuedTokens.get(tokenId);
      if (!tokenInfo) throw new Error('Token not found');

      const addressValidation = XRPLValidators.validateAddress(destinationAddress);
      if (!addressValidation.isValid) throw new Error(`Invalid destination address: ${addressValidation.error}`);

      const amountValidation = XRPLValidators.validateAmount(amount, 'IOU');
      if (!amountValidation.isValid) throw new Error(`Invalid amount: ${amountValidation.error}`);

      const trustlineExists = await this.checkTrustlineExists(
        destinationAddress,
        tokenInfo.currencyCode,
        issuerWallet.classicAddress
      );
      if (!trustlineExists) {
        throw new Error(`No trustline found for ${destinationAddress} to ${tokenInfo.currencyCode}`);
      }

      const payment = {
        TransactionType: 'Payment',
        Account: issuerWallet.classicAddress,
        Destination: destinationAddress,
        Amount: {
          currency: tokenInfo.currencyCode,
          value: amountValidation.amount,
          issuer: issuerWallet.classicAddress
        },
        DestinationTag: options.destinationTag || undefined,
        Memos: options.memo ? [this.createMemoObject(options.memo)] : undefined
      };

      const result = await this.client.submitAndWait(payment, issuerWallet);
      this.updateTokenSupply(tokenId, amount, 'issued');

      console.log('✅ Tokens issued successfully');
      console.log(`   Amount: ${amount} ${tokenInfo.currencyCode}`);
      console.log(`   To: ${destinationAddress}`);
      console.log(`   TX Hash: ${result.result.hash}`);

      return {
        success: true,
        transactionHash: result.result.hash,
        amount: amount,
        currency: tokenInfo.currencyCode,
        destination: destinationAddress,
        issuer: issuerWallet.classicAddress
      };
    } catch (error) {
      console.error('❌ Token issuance failed:', error.message);
      throw new Error(`Token issuance failed: ${error.message}`);
    }
  }

  async configureIssuerAccount(issuerWallet, settings = {}) {
    try {
      console.log('⚙️ Configuring issuer account settings...');
      const transactions = [];

      if (settings.defaultRipple !== undefined) {
        transactions.push({
          TransactionType: 'AccountSet',
          Account: issuerWallet.classicAddress,
          SetFlag: settings.defaultRipple ? xrpl.AccountSetAsfFlags.asfDefaultRipple : undefined,
          ClearFlag: !settings.defaultRipple ? xrpl.AccountSetAsfFlags.asfDefaultRipple : undefined
        });
      }

      if (settings.requireAuth !== undefined) {
        transactions.push({
          TransactionType: 'AccountSet',
          Account: issuerWallet.classicAddress,
          SetFlag: settings.requireAuth ? xrpl.AccountSetAsfFlags.asfRequireAuth : undefined,
          ClearFlag: !settings.requireAuth ? xrpl.AccountSetAsfFlags.asfRequireAuth : undefined
        });
      }

      if (settings.transferRate !== undefined) {
        transactions.push({
          TransactionType: 'AccountSet',
          Account: issuerWallet.classicAddress,
          TransferRate: settings.transferRate
        });
      }

      if (settings.domain) {
        const domain = Buffer.from(settings.domain, 'utf8').toString('hex').toUpperCase();
        transactions.push({
          TransactionType: 'AccountSet',
          Account: issuerWallet.classicAddress,
          Domain: domain
        });
      }

      const results = [];
      for (const tx of transactions) {
        const result = await this.client.submitAndWait(tx, issuerWallet);
        results.push(result.result.hash);
        console.log(`✅ Account setting applied: ${result.result.hash}`);
      }

      return {
        success: true,
        transactionHashes: results,
        settingsApplied: Object.keys(settings).length
      };
    } catch (error) {
      console.error('❌ Account configuration failed:', error.message);
      throw new Error(`Account configuration failed: ${error.message}`);
    }
  }

  async createTokenMemo(tokenMetadata) {
    const memoData = {
      type: 'token_creation',
      tokenId: tokenMetadata.tokenId,
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      decimals: tokenMetadata.decimals,
      ipfsHash: tokenMetadata.ipfsHash,
      createdAt: tokenMetadata.createdAt
    };

    const memoString = JSON.stringify(memoData);
    const validation = XRPLValidators.validateMemo(memoString);

    if (!validation.isValid) {
      console.warn('Memo too large, using basic metadata');
      return this.createMemoObject(
        JSON.stringify({ type: 'token_creation', tokenId: tokenMetadata.tokenId, symbol: tokenMetadata.symbol })
      );
    }

    return this.createMemoObject(memoString);
  }

  createMemoObject(data, type = 'application/json', format = 'text/plain') {
    return {
      Memo: {
        MemoType: Buffer.from(type, 'utf8').toString('hex').toUpperCase(),
        MemoData: Buffer.from(data, 'utf8').toString('hex').toUpperCase(),
        MemoFormat: Buffer.from(format, 'utf8').toString('hex').toUpperCase()
      }
    };
  }

  async checkTrustlineExists(accountAddress, currencyCode, issuerAddress) {
    try {
      const trustlines = await this.client.getTrustlines(accountAddress);
      return trustlines.some(line => line.currency === currencyCode && line.account === issuerAddress);
    } catch (error) {
      console.error('Failed to check trustline:', error.message);
      return false;
    }
  }

  async validateIssuerAccount(issuerAddress) {
    try {
      const accountInfo = await this.client.getAccountInfo(issuerAddress);
      const balance = parseFloat(xrpl.dropsToXrp(accountInfo.Balance));
      const requiredReserve = parseFloat(
        xrpl.dropsToXrp(process.env.XRPL_ACCOUNT_RESERVE || XRPL_CONFIG.RESERVES.ACCOUNT_RESERVE)
      );

      if (balance < requiredReserve) {
        throw new Error(`Insufficient XRP balance. Required: ${requiredReserve} XRP, Available: ${balance} XRP`);
      }

      console.log(`✅ Issuer account validated - Balance: ${balance} XRP`);
    } catch (error) {
      if (error.message.includes('Account not found')) {
        throw new Error('Issuer account does not exist or is not activated');
      }
      throw error;
    }
  }

  getTokenInfo(tokenId) {
    return this.issuedTokens.get(tokenId);
  }

  listTokens() {
    return Array.from(this.issuedTokens.values());
  }

  updateTokenSupply(tokenId, amount, operation) {
    const tokenInfo = this.issuedTokens.get(tokenId);
    if (tokenInfo) {
      const currentSupply = parseFloat(tokenInfo.totalSupply || '0');
      const changeAmount = parseFloat(amount);

      if (operation === 'issued') {
        tokenInfo.totalSupply = (currentSupply + changeAmount).toString();
      } else if (operation === 'burned') {
        tokenInfo.totalSupply = Math.max(0, currentSupply - changeAmount).toString();
      }

      tokenInfo.lastUpdated = new Date().toISOString();
      this.issuedTokens.set(tokenId, tokenInfo);
    }
  }

  generateTokenId() {
    return `token_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  async burnTokens(tokenId, amount, holderWallet, issuerAddress) {
    try {
      console.log(`🔥 Burning tokens: ${amount} ${tokenId}`);
      const tokenInfo = this.issuedTokens.get(tokenId);
      if (!tokenInfo) throw new Error('Token not found');

      const amountValidation = XRPLValidators.validateAmount(amount, 'IOU');
      if (!amountValidation.isValid) throw new Error(`Invalid amount: ${amountValidation.error}`);

      const payment = {
        TransactionType: 'Payment',
        Account: holderWallet.classicAddress,
        Destination: issuerAddress,
        Amount: {
          currency: tokenInfo.currencyCode,
          value: amountValidation.amount,
          issuer: issuerAddress
        }
      };

      const result = await this.client.submitAndWait(payment, holderWallet);
      this.updateTokenSupply(tokenId, amount, 'burned');

      console.log('✅ Tokens burned successfully');
      console.log(`   TX Hash: ${result.result.hash}`);

      return {
        success: true,
        transactionHash: result.result.hash,
        amount: amount,
        currency: tokenInfo.currencyCode
      };
    } catch (error) {
      console.error('❌ Token burning failed:', error.message);
      throw error;
    }
  }

  async getTokenBalance(accountAddress, currencyCode, issuerAddress) {
    try {
      const trustlines = await this.client.getTrustlines(accountAddress);
      const trustline = trustlines.find(line => line.currency === currencyCode && line.account === issuerAddress);
      return trustline ? trustline.balance : '0';
    } catch (error) {
      console.error('Failed to get token balance:', error.message);
      return '0';
    }
  }
}

module.exports = new TokenIssuer(); // ✅ Exporting instance instead of class
