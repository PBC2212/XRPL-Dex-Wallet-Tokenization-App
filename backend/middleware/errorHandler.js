const fs = require('fs');
const path = require('path');

/**
 * Production-ready error handler middleware
 * Handles all types of errors and provides consistent API responses
 */

// Create error log file if it doesn't exist
const errorLogPath = path.join(__dirname, '..', 'logs', 'error.log');
const logError = (error, req = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code || 'UNKNOWN'
        },
        request: req ? {
            method: req.method,
            url: req.url,
            headers: req.headers,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        } : null,
        environment: process.env.NODE_ENV
    };

    // Log to file in production
    if (process.env.NODE_ENV === 'production') {
        fs.appendFileSync(errorLogPath, JSON.stringify(logEntry) + '\n');
    }

    // Always log to console
    console.error(`[ERROR ${timestamp}]`, error.message);
    if (process.env.NODE_ENV === 'development') {
        console.error(error.stack);
    }
};

// XRPL specific error handler
const handleXRPLError = (error) => {
    const xrplErrors = {
        'tecNO_DST_INSUF_XRP': {
            status: 400,
            message: 'Destination account does not have enough XRP for transaction'
        },
        'tecUNFUNDED_PAYMENT': {
            status: 400,
            message: 'Insufficient funds for payment'
        },
        'tecNO_TARGET': {
            status: 400,
            message: 'Target account does not exist'
        },
        'tecNO_AUTH': {
            status: 401,
            message: 'Not authorized to perform this operation'
        },
        'tecNO_LINE': {
            status: 400,
            message: 'Trust line does not exist'
        },
        'tecPATH_DRY': {
            status: 400,
            message: 'No liquidity available for this trade'
        },
        'tecINSUF_RESERVE_LINE': {
            status: 400,
            message: 'Insufficient XRP reserve for trust line'
        },
        'tecNO_PERMISSION': {
            status: 403,
            message: 'No permission to perform this action'
        }
    };

    // Check if it's a known XRPL error
    for (const [code, details] of Object.entries(xrplErrors)) {
        if (error.message.includes(code) || error.code === code) {
            return {
                status: details.status,
                message: details.message,
                code: code
            };
        }
    }

    // Generic XRPL connection errors
    if (error.message.includes('WebSocket') || error.message.includes('connection')) {
        return {
            status: 503,
            message: 'XRPL network connection error. Please try again.',
            code: 'XRPL_CONNECTION_ERROR'
        };
    }

    // Transaction submission errors
    if (error.message.includes('submit') || error.message.includes('transaction')) {
        return {
            status: 400,
            message: 'Transaction submission failed. Please check your parameters.',
            code: 'XRPL_TRANSACTION_ERROR'
        };
    }

    return null;
};

// Validation error handler
const handleValidationError = (error) => {
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return {
            status: 400,
            message: 'Validation failed',
            details: messages
        };
    }
    return null;
};

// Database error handler (for future database integration)
const handleDatabaseError = (error) => {
    // PostgreSQL errors
    if (error.code === '23505') {
        return {
            status: 409,
            message: 'Resource already exists'
        };
    }
    
    if (error.code === '23503') {
        return {
            status: 400,
            message: 'Referenced resource does not exist'
        };
    }

    // MongoDB errors
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        if (error.code === 11000) {
            return {
                status: 409,
                message: 'Resource already exists'
            };
        }
    }

    return null;
};

// Main error handler middleware
const errorHandler = (error, req, res, next) => {
    // Log the error
    logError(error, req);

    // Default error response
    let status = error.statusCode || error.status || 500;
    let message = error.message || 'Internal server error';
    let code = error.code || 'INTERNAL_ERROR';
    let details = null;

    // Handle specific error types
    const xrplError = handleXRPLError(error);
    const validationError = handleValidationError(error);
    const dbError = handleDatabaseError(error);

    if (xrplError) {
        status = xrplError.status;
        message = xrplError.message;
        code = xrplError.code;
    } else if (validationError) {
        status = validationError.status;
        message = validationError.message;
        details = validationError.details;
    } else if (dbError) {
        status = dbError.status;
        message = dbError.message;
    }

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
        status = 401;
        message = 'Invalid token';
        code = 'INVALID_TOKEN';
    } else if (error.name === 'TokenExpiredError') {
        status = 401;
        message = 'Token expired';
        code = 'TOKEN_EXPIRED';
    }

    // Handle rate limiting
    if (error.statusCode === 429) {
        status = 429;
        message = 'Too many requests, please try again later';
        code = 'RATE_LIMIT_EXCEEDED';
    }

    // Handle CORS errors
    if (error.message && error.message.includes('CORS')) {
        status = 403;
        message = 'Cross-origin request blocked';
        code = 'CORS_ERROR';
    }

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production' && status === 500) {
        message = 'Internal server error';
        details = null;
    }

    // Prepare error response
    const errorResponse = {
        success: false,
        message,
        data: null,
        timestamp: new Date().toISOString(),
        ...(details && { details }),
        ...(process.env.NODE_ENV === 'development' && { 
            stack: error.stack,
            code: code 
        })
    };

    // Send error response
    res.status(status).json(errorResponse);
};

// Async error wrapper for controllers
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error class for application-specific errors
class AppError extends Error {
    constructor(message, statusCode, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Success response helper
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    errorHandler,
    asyncHandler,
    AppError,
    successResponse,
    logError
}; 
