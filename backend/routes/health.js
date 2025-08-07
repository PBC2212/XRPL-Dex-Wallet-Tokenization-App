const express = require('express');
const router = express.Router();
const xrplService = require('../services/xrplService');
const walletService = require('../services/walletService');
const os = require('os');

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Success response helper
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

// Format uptime helper
const formatUptime = (uptimeSeconds) => {
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
};

/**
 * @route   GET /health
 * @desc    Basic health check - quick response for load balancers
 * @access  Public
 */
router.get('/', (req, res) => {
    const uptime = process.uptime();
    
    successResponse(res, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    }, 'Service is healthy');
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with all service statuses
 * @access  Public
 */
router.get('/detailed', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Check XRPL connection
    let xrplCheck;
    try {
        await xrplService.initialize();
        const serverInfo = await xrplService.getServerInfo();
        const currentFee = await xrplService.getCurrentFee();
        
        xrplCheck = {
            status: 'healthy',
            connected: true,
            network: serverInfo.networkLedger || 'unknown',
            ledgerIndex: serverInfo.validatedLedger?.seq || 0,
            serverVersion: serverInfo.buildVersion,
            networkFee: currentFee.baseFee,
            reserveBase: serverInfo.reserveBase,
            reserveInc: serverInfo.reserveInc
        };
    } catch (error) {
        xrplCheck = {
            status: 'error',
            connected: false,
            error: error.message,
            lastError: new Date().toISOString()
        };
    }

    // Check system resources
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercent = (usedMemory / totalMemory) * 100;
    const processMemory = process.memoryUsage();

    let memoryStatus = 'healthy';
    if (usagePercent > 90) {
        memoryStatus = 'error';
    } else if (usagePercent > 75) {
        memoryStatus = 'warning';
    }

    const systemCheck = {
        status: 'healthy',
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'unknown',
            loadAverage: {
                '1min': Math.round(os.loadavg()[0] * 100) / 100,
                '5min': Math.round(os.loadavg()[1] * 100) / 100,
                '15min': Math.round(os.loadavg()[2] * 100) / 100
            }
        },
        uptime: Math.floor(os.uptime()),
        platform: os.platform(),
        architecture: os.arch()
    };

    const memoryCheck = {
        status: memoryStatus,
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

    // Get wallet service status
    let walletServiceStatus;
    try {
        const stats = walletService.getWalletStats();
        walletServiceStatus = {
            status: 'healthy',
            ...stats
        };
    } catch (error) {
        walletServiceStatus = {
            status: 'error',
            error: error.message
        };
    }

    // Determine overall status
    const allChecks = [xrplCheck, systemCheck, memoryCheck, walletServiceStatus];
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
        uptimeFormatted: formatUptime(process.uptime()),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {
            xrpl: xrplCheck,
            system: systemCheck,
            memory: memoryCheck,
            walletService: walletServiceStatus
        }
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json({
        success: overallStatus !== 'unhealthy',
        message: `System is ${overallStatus}`,
        data: healthData,
        timestamp: new Date().toISOString()
    });
}));

/**
 * @route   GET /health/xrpl
 * @desc    XRPL network status
 * @access  Public
 */
router.get('/xrpl', asyncHandler(async (req, res) => {
    try {
        await xrplService.initialize();
        const serverInfo = await xrplService.getServerInfo();
        const currentFee = await xrplService.getCurrentFee();

        const xrplStatus = {
            status: 'healthy',
            connected: true,
            network: serverInfo.networkLedger || 'unknown',
            ledgerIndex: serverInfo.validatedLedger?.seq || 0,
            serverVersion: serverInfo.buildVersion,
            networkFee: currentFee.baseFee,
            reserveBase: serverInfo.reserveBase,
            reserveInc: serverInfo.reserveInc,
            endpoint: process.env.XRPL_WEBSOCKET_URL
        };

        successResponse(res, xrplStatus, 'XRPL network is healthy');
    } catch (error) {
        const xrplStatus = {
            status: 'error',
            connected: false,
            error: error.message,
            endpoint: process.env.XRPL_WEBSOCKET_URL,
            lastError: new Date().toISOString()
        };

        res.status(503).json({
            success: false,
            message: 'XRPL network connection failed',
            data: xrplStatus,
            timestamp: new Date().toISOString()
        });
    }
}));

/**
 * @route   GET /health/system
 * @desc    System resources status
 * @access  Public
 */
router.get('/system', (req, res) => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercent = (usedMemory / totalMemory) * 100;
    const processMemory = process.memoryUsage();

    const systemStatus = {
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'unknown',
            loadAverage: {
                '1min': Math.round(os.loadavg()[0] * 100) / 100,
                '5min': Math.round(os.loadavg()[1] * 100) / 100,
                '15min': Math.round(os.loadavg()[2] * 100) / 100
            }
        },
        memory: {
            system: {
                total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
                used: `${Math.round(usedMemory / 1024 / 1024)}MB`,
                free: `${Math.round(freeMemory / 1024 / 1024)}MB`,
                usagePercent: `${Math.round(usagePercent)}%`
            },
            process: {
                heapUsed: `${Math.round(processMemory.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(processMemory.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(processMemory.rss / 1024 / 1024)}MB`
            }
        },
        uptime: Math.floor(os.uptime()),
        uptimeFormatted: formatUptime(os.uptime()),
        platform: os.platform(),
        architecture: os.arch(),
        processUptime: Math.floor(process.uptime()),
        processUptimeFormatted: formatUptime(process.uptime())
    };

    successResponse(res, systemStatus, 'System health check completed');
});

/**
 * @route   GET /health/ready
 * @desc    Readiness check - for Kubernetes readiness probes
 * @access  Public
 */
router.get('/ready', asyncHandler(async (req, res) => {
    try {
        // Check if XRPL is connected and responsive
        await xrplService.initialize();
        await xrplService.getServerInfo();

        successResponse(res, {
            ready: true,
            timestamp: new Date().toISOString(),
            services: ['xrpl', 'wallet', 'api']
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
}));

/**
 * @route   GET /health/live
 * @desc    Liveness check - for Kubernetes liveness probes
 * @access  Public
 */
router.get('/live', (req, res) => {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Basic liveness checks
    if (uptime < 1) {
        return res.status(503).json({
            success: false,
            message: 'Service just started',
            data: { alive: false, uptime },
            timestamp: new Date().toISOString()
        });
    }

    // Memory usage check (basic memory leak detection)
    const memoryLimitMB = 512;
    const currentMemoryMB = memoryUsage.heapUsed / 1024 / 1024;

    if (currentMemoryMB > memoryLimitMB) {
        return res.status(503).json({
            success: false,
            message: 'Memory usage too high',
            data: { 
                alive: false, 
                memoryUsage: `${Math.round(currentMemoryMB)}MB`,
                limit: `${memoryLimitMB}MB`
            },
            timestamp: new Date().toISOString()
        });
    }

    successResponse(res, {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        memoryUsage: `${Math.round(currentMemoryMB)}MB`
    }, 'Service is alive');
});

/**
 * @route   GET /health/ping
 * @desc    Simple ping endpoint
 * @access  Public
 */
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'pong',
        data: {
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router;