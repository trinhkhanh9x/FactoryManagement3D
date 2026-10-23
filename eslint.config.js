import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';

export default [
    { ignores: ['node_modules/**', 'public/**', 'coverage/**', 'test-results/**'] },
    {
        files: [
            'resources/js/**/*.{js,jsx,mjs}',
            'tests/js/**/*.{js,jsx,mjs}',
            '*.{js,mjs}',
            'tools/**/*.mjs',
            'tests/e2e/**/*.mjs',
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y, react },
        rules: {
            ...js.configs.recommended.rules,
            ...a11y.configs.recommended.rules,
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^(React|_)' },
            ],
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'react/jsx-uses-vars': 'error',
        },
    },
];
