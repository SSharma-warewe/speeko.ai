const path = require('path');
const nodeExternals = require('webpack-node-externals');

const contractsDist = path.resolve(
  __dirname,
  '../../packages/contracts/dist/index.js',
);

/**
 * Bundle @call-agent/contracts from compiled ESM dist (not TS source).
 * Source uses NodeNext `.js` specifiers that webpack cannot resolve.
 * Leaving the package external would `require()` ESM from Nest's CJS bundle.
 */
module.exports = function (options) {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      alias: {
        ...(options.resolve && options.resolve.alias),
        '@call-agent/contracts': contractsDist,
      },
    },
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100', /^@call-agent\/contracts/],
      }),
    ],
  };
};
