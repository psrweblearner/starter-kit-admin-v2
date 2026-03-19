'use strict';

const fs = require('fs');
const path = require('path');

const controllers = {};

fs.readdirSync(__dirname)
    .filter(file =>
        file !== 'index.js' &&
        file.endsWith('.controller.js')
    )
    .forEach(file => {
        const name = file.replace('.controller.js', '');
        const key = name.charAt(0).toUpperCase() + name.slice(1);
        controllers[key] = require(path.join(__dirname, file));
    });

module.exports = controllers;
