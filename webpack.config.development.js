const productionConfig = require('./webpack.config.production.js');

const developmentConfig = productionConfig.map(conf => ({
    ...conf,
    devtool: 'eval-source-map',
}));

module.exports = developmentConfig;
