const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
	{
		ignores: ['node_modules/**'],
		languageOptions: {
			parser: require('@typescript-eslint/parser'),
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module',
				project: './tsconfig.json'
			}
		},
		plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
		rules: {
			'prettier/prettier': 'error',
			'no-console': 'warn',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
		}
	}
];
