const path = require('path');

const PACKAGE_ROOT_PATH = process.cwd();
const PACKAGE = require(path.join(PACKAGE_ROOT_PATH, 'package.json'));

function removeKey(obj, key) {
    if (typeof obj !== 'object') return obj;
    const result = { ...obj };
    delete result[key];
    return result;
}

const productionConfig = require('./webpack.config.production.js');

const developmentConfig = productionConfig.map(conf => ({
    ...conf,
    devtool: 'eval-source-map',
    entry: removeKey(conf.entry, `${PACKAGE.name}-light`),  // skip building pdbe-molstar-light in dev mode
}));

module.exports = developmentConfig;
