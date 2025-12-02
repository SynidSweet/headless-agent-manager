/**
 * ESLint Rules for @headless-agent-manager/client
 *
 * Custom ESLint rules to catch common mistakes when using the module.
 *
 * ## Setup
 *
 * 1. Install eslint-plugin-local (or similar):
 *    ```bash
 *    npm install --save-dev eslint-plugin-local
 *    ```
 *
 * 2. Configure ESLint to use these rules:
 *    ```js
 *    // .eslintrc.js
 *    module.exports = {
 *      plugins: ['local'],
 *      rules: {
 *        'local/no-raw-message-access': 'error',
 *      },
 *    };
 *    ```
 *
 * 3. Create `.eslint-rules` directory in your project root:
 *    ```bash
 *    mkdir .eslint-rules
 *    cp node_modules/@headless-agent-manager/client/eslint-rules/no-raw-message-access.js .eslint-rules/
 *    ```
 *
 * OR use the simpler TypeScript approach (see README).
 */

module.exports = {
  rules: {
    'no-raw-message-access': require('./no-raw-message-access'),
  },
  configs: {
    recommended: {
      plugins: ['@headless-agent-manager'],
      rules: {
        '@headless-agent-manager/no-raw-message-access': 'error',
      },
    },
  },
};
