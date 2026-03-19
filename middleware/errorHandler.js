'use strict';

const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

module.exports = (err, req, res, next) => {
    let error = err;

    // Handle Zod validation errors
    if (err.name === 'ZodError') {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: (err.errors || []).map(e => ({
                field: (e.path || []).join('.'),
                message: e.message
            }))
        });
    }

    // Handle Sequelize Unique Constraint errors
    if (err.name === 'SequelizeUniqueConstraintError') {
        const field = err.errors[0].path;
        const value = err.errors[0].value;
        error = new AppError(`${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`, 400);
    }

    // Convert unknown errors to AppError
    if (!(error instanceof AppError)) {
        error = new AppError(
            error.message || 'Internal Server Error',
            error.statusCode || 500
        );
    }

    // Log error with requestId correlation
    logger.error({
        requestId: req.requestId,
        message: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
        path: req.originalUrl,
        method: req.method
    });

    res.status(error.statusCode).json({
        status: error.status,
        message: error.message
    });
};
