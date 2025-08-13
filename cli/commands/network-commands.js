/**
 * Network Management Commands for XRPL CLI
 * Handles XRPL network monitoring, status checks, and network analytics
 * 
 * Path: E:\XRPL-Dex-Wallet-Tokenization-App\cli\commands\network-commands.js
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { table } = require('table');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const ApiService = require('../utils/api-service');

class NetworkCommands {
    constructor(configDir) {
        this.configDir = configDir;
        this.configFile = path.join(configDir, 'config.json');
        this.api = new ApiService();
        this.currentWallet = null;
    }

    async loadConfig() {
        try {
            if (await fs.pathExists(this.configFile)) {
                const config = await fs.readJson(this.configFile);
                this.currentWallet = config.currentWallet;
            }
        } catch (error) {
            console.log('Warning: Could not load config');
        }
    }

    /**
     * Check XRPL network status and health
     */
    async checkNetworkStatus() {
        console.log('\n🌐 XRPL Network Status\n');

        try {
            const spinner = ora('Checking XRPL network status...').start();
            
            const response = await this.api.getNetworkInfo();
            
            spinner.succeed('Network status retrieved!');

            if (response.success && response.data) {
                const networkData = response.data;

                console.log('✅ XRPL Network Health Check:\n');

                const statusTable = [
                    ['Property', 'Value', 'Status'],
                    ['Network Type', networkData.networkType || 'TESTNET', '🟢 Active'],
                    ['Server State', networkData.serverState || 'full', networkData.serverState === 'full' ? '🟢 Healthy' : '🟡 Limited'],
                    ['Ledger Index', (networkData.ledgerIndex || 0).toLocaleString(), '🟢 Current'],
                    ['Ledger Hash', this.truncateHash(networkData.ledgerHash || 'Unknown'), '🟢 Valid'],
                    ['Validated', networkData.validated ? 'Yes' : 'No', networkData.validated ? '🟢 Confirmed' : '🟡 Pending'],
                    ['Reserve Base', this.api.formatXRP(networkData.reserveBase || 10), '📊 Info'],
                    ['Reserve Inc', this.api.formatXRP(networkData.reserveInc || 2), '📊 Info'],
                    ['Fee Base', `${networkData.feeBase || 10} drops`, '💰 Info'],
                    ['Load Factor', `${networkData.loadFactor || 1}x`, networkData.loadFactor > 1 ? '🟡 High Load' : '🟢 Normal']
                ];

                console.log(table(statusTable));

                // Additional network metrics if available
                if (networkData.peers || networkData.uptime || networkData.performance) {
                    console.log('\n📊 Network Performance:\n');
                    
                    const perfTable = [
                        ['Metric', 'Value']
                    ];

                    if (networkData.peers) {
                        perfTable.push(['Connected Peers', networkData.peers.toString()]);
                    }
                    if (networkData.uptime) {
                        perfTable.push(['Server Uptime', this.formatUptime(networkData.uptime)]);
                    }
                    if (networkData.performance) {
                        perfTable.push(['Performance Score', `${networkData.performance}%`]);
                    }
                    if (networkData.txPerSecond) {
                        perfTable.push(['Transactions/sec', networkData.txPerSecond.toString()]);
                    }

                    console.log(table(perfTable));
                }

                return networkData;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to check network status:', error.message);
            
            // Provide fallback information
            console.log('\n💡 Network Information:');
            console.log('   This command provides real-time XRPL network status');
            console.log('   Requires API server connection to fetch live data');
            console.log('   Check API connection with: node xrpl-cli.js health');
            
            throw error;
        }
    }

    /**
     * Get detailed network information and statistics
     */
    async getNetworkInfo() {
        console.log('\n📊 Detailed Network Information\n');

        try {
            const spinner = ora('Fetching detailed network data...').start();
            
            const [networkResponse, statsResponse] = await Promise.all([
                this.api.getNetworkInfo(),
                this.api.getNetworkStats().catch(() => ({ success: false }))
            ]);
            
            spinner.succeed('Network information retrieved!');

            if (networkResponse.success && networkResponse.data) {
                const network = networkResponse.data;

                // Basic Network Info
                console.log('🌐 Network Overview:\n');
                const overviewTable = [
                    ['Property', 'Value'],
                    ['Network ID', network.networkId || 'TESTNET'],
                    ['Network Type', network.networkType || 'Test Network'],
                    ['Chain ID', network.chainId || '1'],
                    ['Protocol Version', network.protocolVersion || 'Unknown'],
                    ['Server Version', network.serverVersion || 'rippled'],
                    ['Last Validated', new Date(network.lastValidated || Date.now()).toLocaleString()],
                    ['Validation Quorum', (network.validationQuorum || 0).toString()],
                    ['Validator Count', (network.validatorCount || 0).toString()]
                ];

                console.log(table(overviewTable));

                // Ledger Information
                console.log('\n📚 Current Ledger:\n');
                const ledgerTable = [
                    ['Property', 'Value'],
                    ['Ledger Index', (network.ledgerIndex || 0).toLocaleString()],
                    ['Ledger Hash', network.ledgerHash || 'Unknown'],
                    ['Parent Hash', network.parentHash || 'Unknown'],
                    ['Close Time', new Date((network.closeTime || 0) * 1000).toLocaleString()],
                    ['Account Hash', network.accountHash || 'Unknown'],
                    ['Transaction Hash', network.transactionHash || 'Unknown'],
                    ['Total Coins', this.api.formatXRP(network.totalCoins || '100000000000')]
                ];

                console.log(table(ledgerTable));

                // Fee Information
                console.log('\n💰 Fee Structure:\n');
                const feeTable = [
                    ['Fee Type', 'Amount', 'Description'],
                    ['Base Fee', `${network.feeBase || 10} drops`, 'Minimum transaction fee'],
                    ['Reserve Base', this.api.formatXRP(network.reserveBase || 10), 'Account reserve requirement'],
                    ['Reserve Increment', this.api.formatXRP(network.reserveInc || 2), 'Per-object reserve cost'],
                    ['Owner Reserve', this.api.formatXRP((network.reserveInc || 2) * 5), 'Typical owner reserve'],
                    ['Load Factor', `${network.loadFactor || 1}x`, 'Current fee multiplier']
                ];

                console.log(table(feeTable));

                // Statistics if available
                if (statsResponse.success && statsResponse.data) {
                    const stats = statsResponse.data;
                    
                    console.log('\n📈 Network Statistics:\n');
                    const statsTable = [
                        ['Metric', 'Value', 'Period'],
                        ['Total Transactions', (stats.totalTransactions || 0).toLocaleString(), 'All Time'],
                        ['24h Transactions', (stats.transactions24h || 0).toLocaleString(), 'Last 24 Hours'],
                        ['Active Accounts', (stats.activeAccounts || 0).toLocaleString(), 'Current'],
                        ['New Accounts (24h)', (stats.newAccounts24h || 0).toLocaleString(), 'Last 24 Hours'],
                        ['Average TPS', (stats.averageTPS || 0).toFixed(2), 'Transactions/sec'],
                        ['Network Load', `${(stats.networkLoad || 0).toFixed(1)}%`, 'Current']
                    ];

                    console.log(table(statsTable));
                }

                return network;
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            console.log('❌ Failed to get network information:', error.message);
            throw error;
        }
    }

    /**
     * Monitor network performance metrics
     */
    async monitorNetwork(options = {}) {
        console.log('\n📡 Network Performance Monitor\n');

        try {
            const duration = options.duration || 60; // Default 60 seconds
            const interval = options.interval || 5;  // Default 5 second intervals

            console.log(`🕐 Monitoring network for ${duration} seconds (${interval}s intervals)...\n`);

            const startTime = Date.now();
            const endTime = startTime + (duration * 1000);
            const metrics = [];

            while (Date.now() < endTime) {
                try {
                    const response = await this.api.getNetworkInfo();
                    
                    if (response.success && response.data) {
                        const data = response.data;
                        const timestamp = new Date().toLocaleTimeString();
                        
                        const metric = {
                            timestamp,
                            ledgerIndex: data.ledgerIndex || 0,
                            loadFactor: data.loadFactor || 1,
                            peers: data.peers || 0,
                            validated: data.validated
                        };

                        metrics.push(metric);

                        // Display current metrics
                        console.log(`${timestamp} | Ledger: ${metric.ledgerIndex.toLocaleString()} | Load: ${metric.loadFactor}x | Peers: ${metric.peers} | Validated: ${metric.validated ? '✅' : '⏳'}`);
                    }
                } catch (error) {
                    console.log(`${new Date().toLocaleTimeString()} | ❌ Error: ${error.message}`);
                }

                // Wait for next interval
                if (Date.now() < endTime) {
                    await new Promise(resolve => setTimeout(resolve, interval * 1000));
                }
            }

            // Display summary
            if (metrics.length > 0) {
                console.log('\n📊 Monitoring Summary:\n');
                
                const avgLoadFactor = metrics.reduce((sum, m) => sum + m.loadFactor, 0) / metrics.length;
                const avgPeers = metrics.reduce((sum, m) => sum + m.peers, 0) / metrics.length;
                const validatedCount = metrics.filter(m => m.validated).length;
                const ledgerProgress = metrics[metrics.length - 1].ledgerIndex - metrics[0].ledgerIndex;

                const summaryTable = [
                    ['Metric', 'Value'],
                    ['Data Points', metrics.length.toString()],
                    ['Time Range', `${metrics[0].timestamp} - ${metrics[metrics.length - 1].timestamp}`],
                    ['Average Load Factor', `${avgLoadFactor.toFixed(2)}x`],
                    ['Average Peers', Math.round(avgPeers).toString()],
                    ['Validation Rate', `${((validatedCount / metrics.length) * 100).toFixed(1)}%`],
                    ['Ledger Progress', `${ledgerProgress} ledgers`],
                    ['Network Health', avgLoadFactor < 2 && validatedCount > metrics.length * 0.9 ? '🟢 Healthy' : '🟡 Degraded']
                ];

                console.log(table(summaryTable));
            }

            return metrics;

        } catch (error) {
            console.log('❌ Network monitoring failed:', error.message);
            throw error;
        }
    }

    /**
     * Test network connectivity and latency
     */
    async testConnectivity() {
        console.log('\n🔌 Network Connectivity Test\n');

        try {
            const tests = [
                { name: 'API Health Check', test: () => this.api.getSystemHealth() },
                { name: 'Network Info', test: () => this.api.getNetworkInfo() },
                { name: 'Token List', test: () => this.api.getTokens() }
            ];

            const results = [];

            for (const testCase of tests) {
                const startTime = Date.now();
                let status, latency, error;

                try {
                    await testCase.test();
                    latency = Date.now() - startTime;
                    status = latency < 1000 ? '🟢 Fast' : latency < 3000 ? '🟡 Slow' : '🔴 Very Slow';
                } catch (err) {
                    latency = Date.now() - startTime;
                    status = '❌ Failed';
                    error = err.message;
                }

                results.push({
                    test: testCase.name,
                    status,
                    latency: `${latency}ms`,
                    error: error || 'None'
                });
            }

            // Display results
            console.log('🧪 Connectivity Test Results:\n');
            const testTable = [
                ['Test', 'Status', 'Latency', 'Error']
            ];

            results.forEach(result => {
                testTable.push([
                    result.test,
                    result.status,
                    result.latency,
                    result.error === 'None' ? result.error : this.truncateText(result.error, 30)
                ]);
            });

            console.log(table(testTable));

            // Overall assessment
            const successCount = results.filter(r => !r.status.includes('❌')).length;
            const avgLatency = results.reduce((sum, r) => sum + parseInt(r.latency), 0) / results.length;
            
            console.log('\n📋 Assessment:');
            console.log(`   Success Rate: ${successCount}/${results.length} (${((successCount / results.length) * 100).toFixed(0)}%)`);
            console.log(`   Average Latency: ${Math.round(avgLatency)}ms`);
            console.log(`   Overall Health: ${successCount === results.length && avgLatency < 2000 ? '🟢 Excellent' : successCount > results.length / 2 ? '🟡 Good' : '🔴 Poor'}`);

            return results;

        } catch (error) {
            console.log('❌ Connectivity test failed:', error.message);
            throw error;
        }
    }

    /**
     * Display network configuration recommendations
     */
    async showNetworkConfig() {
        console.log('\n⚙️ Network Configuration & Recommendations\n');

        try {
            await this.loadConfig();

            console.log('🔧 Current Configuration:\n');
            const configTable = [
                ['Setting', 'Value', 'Status'],
                ['API Endpoint', this.api.getConfig().baseUrl, '🟢 Connected'],
                ['Timeout', `${this.api.getConfig().timeout / 1000}s`, '🟢 Standard'],
                ['Network Type', 'TESTNET', '🟡 Development'],
                ['Active Wallet', this.currentWallet ? this.currentWallet.name : 'None', this.currentWallet ? '🟢 Ready' : '🟡 Not Set']
            ];

            console.log(table(configTable));

            console.log('\n💡 Recommendations:\n');
            
            const recommendations = [
                {
                    category: 'Performance',
                    items: [
                        'Keep API timeout at 30s for reliable RWA transactions',
                        'Monitor network load factor before high-value transactions',
                        'Use connection pooling for high-frequency operations'
                    ]
                },
                {
                    category: 'Security',
                    items: [
                        'Always verify ledger validation before trusting data',
                        'Monitor reserve requirements for account funding',
                        'Use TESTNET for development and testing only'
                    ]
                },
                {
                    category: 'Reliability',
                    items: [
                        'Implement retry logic for network operations',
                        'Monitor server state for optimal transaction timing',
                        'Keep local wallet backups for recovery'
                    ]
                }
            ];

            recommendations.forEach(rec => {
                console.log(`${this.getCategoryIcon(rec.category)} ${rec.category}:`);
                rec.items.forEach(item => {
                    console.log(`   • ${item}`);
                });
                console.log('');
            });

        } catch (error) {
            console.log('❌ Failed to show network config:', error.message);
            throw error;
        }
    }

    // Utility methods
    truncateHash(hash, length = 16) {
        if (!hash || hash.length <= length) return hash;
        return `${hash.slice(0, length)}...`;
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return `${text.slice(0, maxLength)}...`;
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    getCategoryIcon(category) {
        const icons = {
            'Performance': '⚡',
            'Security': '🔒',
            'Reliability': '🛡️',
            'Network': '🌐',
            'Configuration': '⚙️'
        };
        return icons[category] || '📋';
    }

    getStatusIcon(status) {
        if (status === 'healthy' || status === 'active') return '🟢';
        if (status === 'degraded' || status === 'slow') return '🟡';
        if (status === 'failed' || status === 'down') return '🔴';
        return '⚪';
    }
}

module.exports = NetworkCommands;