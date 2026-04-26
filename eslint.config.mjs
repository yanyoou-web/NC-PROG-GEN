export default [
  {
    ignores: ['参考フォルダ/**', 'node_modules/**']
  },
  {
    files: ['assets/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        alert: 'readonly',
        Event: 'readonly',
        ResizeObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        FileReader: 'readonly',
        machines: 'readonly',
        tubeData: 'readonly',
        template_M12BAITO: 'readonly',
        template_M12HSS: 'readonly',
        template_M12HGDR: 'readonly',
        template_M15: 'readonly',
        template_M18: 'readonly',
        template_M22: 'readonly',
        template_M40: 'readonly',
        template_G78: 'readonly',
        template_G18_40: 'readonly',
        template_G18_42: 'readonly',
        template_G18_62: 'readonly',
        template_G18_655: 'readonly',
        template_G18_6175: 'readonly',
        template_Tube: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error'
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error'
    }
  },
  {
    files: ['assets/data.js'],
    rules: {
      'no-redeclare': 'off'
    }
  }
];
