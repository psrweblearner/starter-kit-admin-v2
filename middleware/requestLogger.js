'use strict';

const logger = require('../utils/logger');

module.exports = (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationMs =
            Number(process.hrtime.bigint() - start) / 1_000_000;

        logger.info('HTTP Request', {
            requestId: req.requestId,
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${durationMs.toFixed(2)}ms`,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            apiClientId: req.apiClient?.id || null
        });
    });

    next();
};
