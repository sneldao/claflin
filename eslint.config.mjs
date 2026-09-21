import next from 'eslint-config-next/core-web-vitals';
import reactHooks from 'eslint-plugin-react-hooks';

const config = [
  ...next,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      // The legacy voice/wallet hooks that remain trip the new react-hooks 7.x rules.
      // These are warnings until the remaining voice code is removed or refactored.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // We intentionally memoize the trading desk surface and callbacks;
      // React Compiler is not enabled and the legacy rules are not a signal here.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    ignores: ['.next/', 'out/', 'node_modules/'],
  },
];

export default config;
