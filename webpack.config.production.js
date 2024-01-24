const path = require('path');
const webpack = require('webpack');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const PACKAGE_ROOT_PATH = process.cwd();
const PACKAGE = require(path.join(PACKAGE_ROOT_PATH, 'package.json'));

/** Webpack configuration for building the plugin bundle (pdbe-molstar-plugin-*.js, pdbe-molstar-*.css).
 * Also builds the light-skin version (pdbe-molstar-light-plugin-*.js, pdbe-molstar-light-*.css). */
const molstarConfig = {
    entry: {
        [PACKAGE.name]: path.resolve(__dirname, 'lib/index.js'),
        [PACKAGE.name + '-light']: path.resolve(__dirname, 'lib/index(light).js'),
    },
    output: {
        filename: `[name]-plugin-${PACKAGE.version}.js`,
        path: path.resolve(__dirname, 'build/'),
    },
    target: 'web',
    module: {
        rules: [
            {
                test: /\.(html|ico)$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: { name: '[name].[ext]' },
                    },
                ],
            },
            {
                test: /\.(s*)css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { sourceMap: false } },
                    { loader: 'sass-loader', options: { sourceMap: false } },
                ],
            },
        ],
    },
    plugins: [
        new ExtraWatchWebpackPlugin({
            files: ['./lib/**/*.scss', './lib/**/*.html'],
        }),
        new webpack.DefinePlugin({
            'process.env.DEBUG': JSON.stringify(process.env.DEBUG),
            __MOLSTAR_DEBUG_TIMESTAMP__: webpack.DefinePlugin.runtimeValue(() => `${new Date().valueOf()}`, true),
        }),
        new MiniCssExtractPlugin({
            filename: `[name]-${PACKAGE.version}.css`,
        }),
    ],
    resolve: {
        modules: ['node_modules', path.resolve(__dirname, 'lib/')],
        fallback: {
            fs: false,
            crypto: require.resolve('crypto-browserify'),
            path: require.resolve('path-browserify'),
            stream: require.resolve('stream-browserify'),
        },
        alias: {
            Molstar: 'molstar/lib',
        },
    },
    watchOptions: {
        aggregateTimeout: 750,
    },
};

/** Webpack configuration for building a part of the web-component bundle,
 * which will be concatenated with the plugin bundle to build the full
 * web-component bundle (pdbe-molstar-component-*.js) */
const componentConfig = {
    entry: path.resolve(__dirname, `src/web-component/index.js`),
    output: {
        filename: `${PACKAGE.name}-component-build-${PACKAGE.version}.js`,
        path: path.resolve(__dirname, 'lib/'),
    },
    target: 'web',
    resolve: {
        extensions: ['.js'],
    },
    externals: {
        PDBeMolstarPlugin: 'PDBeMolstarPlugin',
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', { loader: 'css-loader', options: { importLoaders: 1 } }],
            },
            {
                test: /.(jpg|jpeg|png|svg)$/,
                use: ['url-loader'],
            },
            {
                test: /\.(js)$/,
                exclude: function excludeCondition(path) {
                    const nonEs5SyntaxPackages = ['lit-element', 'lit-html'];

                    // DO transpile these packages
                    if (nonEs5SyntaxPackages.some(pkg => path.match(pkg))) {
                        return false;
                    }

                    // Ignore all other modules that are in node_modules
                    if (path.match(/node_modules\\/)) {
                        return true;
                    } else return false;
                },
                use: {
                    loader: 'babel-loader',
                    options: {
                        babelrc: false,
                        plugins: [
                            [
                                '@babel/plugin-transform-runtime',
                                {
                                    regenerator: true,
                                },
                            ],
                        ],
                    },
                },
            },
        ],
    },
};

module.exports = [molstarConfig, componentConfig];
