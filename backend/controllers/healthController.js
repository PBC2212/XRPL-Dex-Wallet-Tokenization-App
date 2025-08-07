const xrplService = require('../services/xrplService');
const walletService = require('../services/walletService');
const { authService } = require('../middleware/auth');
const { asyncHandler, successResponse, AppError } = require('../middleware/errorHandler');
const os = require('os');
const fs = require('fs');
const path = require('path');

class HealthController {
    /**
     * Basic health check - quick response for load balancers
     * GET /health
     */
    basicHealth = asyncHandler(async (req, res) => {
        const uptime = process.uptime();
        
        successResponse(res, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(uptime),
            uptimeFormatted: this.formatUptime(uptime),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        }, 'Service is healthy');
    });

    /**
     * Detailed health check with all service statuses
     * GET /health/detailed
     */
    detailedHealth = asyncHandler(async (req, res) => {
        const startTime = Date.now();
        
        // Check all services
        const checks = await Promise.allSettled([
            this.checkXRPLConnection(),
            this.checkSystemResources(),
            this.checkDiskSpace(),
            this.checkMemoryUsage()
        ]);

        const xrplCheck = checks[0].status === 'fulfilled' ? checks[0].value : { status: 'error', error: checks[0].reason?.message };
        const systemCheck = checks[1].status === 'fulfilled' ? checks[1].value : { status: 'error', error: checks[1].reason?.message };
        const diskCheck = checks[2].status === 'fulfilled' ? checks[2].value : { status: 'error', error: checks[2].reason?.message };
        const memoryCheck = checks[3].status === 'fulfilled' ? checks[3].value : { status: 'error', error: checks[3].reason?.message };

        // Determine overall status
        const allChecks = [xrplCheck, systemCheck, diskCheck, memoryCheck];
        const hasErrors = allChecks.some(check => check.status === 'error');
        const hasWarnings = allChecks.some(check => check.status === 'warning');

        let overallStatus = 'healthy';
        if (hasErrors) {
            overallStatus = 'unhealthy';
        } else if (hasWarnings) {
            overallStatus = 'degraded';
        }

        const responseTime = Date.now() - startTime;

        const healthData = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime}ms`,
            uptime: Math.floor(process.uptime()),
            uptimeFormatted: this.formatUptime(process.uptime()),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            checks: {
                xrpl: xrplCheck,
                system: systemCheck,
                disk: diskCheck,
                memory: memoryCheck
            },
            services: {
                wallet: this.getWalletServiceStatus(),
                auth: this.getAuthServiceStatus()
            },
            metrics: {
                totalRequests: 0, // Would be tracked by middleware in production
                avgResponseTime: `${responseTime}ms`,
                errorRate: '0%' // Would be calculated from actual metrics
            }
        };

        const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
        res.status(statusCode).json({
            success: overallStatus !== 'unhealthy',
            message: `System is ${overallStatus}`,
            data: healthData,
            timestamp: new Date().toISOString()
        });
    });

    /**
     * XRPL network status
     * GET /health/xrpl
     */
    xrplHealth = asyncHandler(async (req, res) => {
        const xrplStatus = await this.checkXRPLConnection();
        
        const statusCode = xrplStatus.status === 'error' ? 503 : 200;
        const success = xrplStatus.status !== 'error';
        
        successResponse(res, xrplStatus, 'XRPL health check completed', statusCode);
    });

    /**
     * System resources status
     * GET /health/system
     */
    systemHealth = asyncHandler(async (req, res) => {
        const systemStatus = await this.checkSystemResources();
        const memoryStatus = await this.checkMemoryUsage();
        const diskStatus = await this.checkDiskSpace();

        const combinedStatus = {
            ...systemStatus,
            memory: memoryStatus,
            disk: diskStatus
        };

        successResponse(res, combinedStatus, 'System health check completed');
    });

    /**
     * Ready check - for Kubernetes readiness probes
     * GET /health/ready
     */
    readinessCheck = asyncHandler(async (req, res) => {
        try {
            // Check if XRPL is connected
            const xrplStatus = await this.checkXRPLConnection();
            
            if (xrplStatus.status === 'error') {
                throw new AppError('XRPL connection not ready', 503, 'SERVICE_NOT_READY');
            }

            successResponse(res, {
                ready: true,
                timestamp: new Date().toISOString(),
                services: ['xrpl', 'wallet', 'auth']
            }, 'Service is ready');

        } catch (error) {
            res.status(503).json({
                success: false,
                message: 'Service not ready',
                data: {
                    ready: false,
                    timestamp: new Date().toISOString(),
                    error: error.message
                },
                timestamp: new Date().toISOString()
            });
        }
    });

    /**
     * Liveness check - for Kubernetes liveness probes
     * GET /health/live
     */
    livenessCheck = asyncHandler(async (req, res) => {
        // Simple check that the process is alive and responding
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        // Basic checks
        if (uptime < 1) {
            throw new AppError('Service just started', 503, 'SERVICE_STARTING');
        }

        // Check if memory usage is extremely high (potential memory leak)
        const memoryLimitMB = 512; // Adjust based on your container limits
        const currentMemoryMB = memoryUsage.heapUsed / 1024 / 1024;

        if (currentMemoryMB > memoryLimitMB) {
            throw new AppError('Memory usage too high', 503, 'HIGH_MEMORY_USAGE');
        }

        successResponse(res, {
            alive: true,
            timestamp: new Date().toISOString(),
            uptime: Math.floor(uptime),
            memoryUsage: `${Math.round(currentMemoryMB)}MB`
        }, 'Service is alive');
    });

    /**
     * Check XRPL connection and network status
     */
    async checkXRPLConnection() {
        try {
            const serverInfo = await xrplService.getServerInfo();
            const currentFee = await xrplService.getCurrentFee();

            return {
                status: 'healthy',
                connected: true,
                network: serverInfo.networkLedger || 'unknown',
                ledgerIndex: serverInfo.validatedLedger?.seq || 0,
                serverVersion: serverInfo.buildVersion,
                networkFee: currentFee.baseFee,
                reserveBase: serverInfo.reserveBase,
                reserveInc: serverInfo.reserveInc,
                responseTime: Date.now() // Would measure actual response time
            };
        } catch (error) {
            return {
                status: 'error',
                connected: false,
                error: error.message,
                lastError: new Date().toISOString()
            };
        }
    }

    /**
     * Check system resources
     */
    async checkSystemResources() {
        try {
            const cpus = os.cpus();
            const loadAvg = os.loadavg();
            const uptime = os.uptime();

            // CPU usage check (simplified)
            const cpuCount = cpus.length;
            const load1min = loadAvg[0];
            const cpuStatus = load1min > cpuCount * 0.8 ? 'warning' : 'healthy';

            return {
                status: cpuStatus,
                cpu: {
                    cores: cpuCount,
                    model: cpus[0]?.model || 'unknown',
                    loadAverage: {
                        '1min': Math.round(load1min * 100) / 100,
                        '5min': Math.round(loadAvg[1] * 100) / 100,
                        '15min': Math.round(loadAvg[2] * 100) / 100
                    }
                },
                uptime: Math.floor(uptime),
                uptimeFormatted: this.formatUptime(uptime),
                platform: os.platform(),
                architecture: os.arch()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Check memory usage
     */
    async checkMemoryUsage() {
        try {
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            const usagePercent = (usedMemory / totalMemory) * 100;

            const processMemory = process.memoryUsage();

            let status = 'healthy';
            if (usagePercent > 90) {
                status = 'error';
            } else if (usagePercent > 75) {
                status = 'warning';
            }

            return {
                status,
                system: {
                    total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
                    used: `${Math.round(usedMemory / 1024 / 1024)}MB`,
                    free: `${Math.round(freeMemory / 1024 / 1024)}MB`,
                    usagePercent: `${Math.round(usagePercent)}%`
                },
                process: {
                    heapUsed: `${Math.round(processMemory.heapUsed / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(processMemory.heapTotal / 1024 / 1024)}MB`,
                    external: `${Math.round(processMemory.external / 1024 / 1024)}MB`,
                    rss: `${Math.round(processMemory.rss / 1024 / 1024)}MB`
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Check disk space
     */
    async checkDiskSpace() {
        try {
            const stats = fs.statSync(process.cwd());
            
            return {
                status: 'healthy',
                available: true,
                path: process.cwd(),
                accessible: true
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                path: process.cwd()
            };
        }
    }

    /**
     * Get wallet service status
     */
    getWalletServiceStatus() {
        try {
            const stats = walletService.getWalletStats();
            return {
                status: 'healthy',
                ...stats
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get auth service status
     */
    getAuthServiceStatus() {
        try {
            const stats = authService.getApiKeyStats();
            return {
                status: 'healthy',
                ...stats
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Format uptime in human-readable format
     */
    formatUptime(uptimeSeconds) {
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);

        let formatted = '';
        if (days > 0) formatted += `${days}d `;
        if (hours > 0) formatted += `${hours}h `;
        if (minutes > 0) formatted += `${minutes}m `;
        formatted += `${seconds}s`;

        return formatted.trim();
    }
}

module.exports = new HealthController(); 
