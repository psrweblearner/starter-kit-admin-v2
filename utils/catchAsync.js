'use strict';

/**
 * Wraps an asynchronous function and catches any errors, passing them to the next middleware.
 * @param {Function} fn - The asynchronous function to wrap.
 * @returns {Function} - The wrapped function.
 */
module.exports = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
