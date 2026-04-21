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
        clearTimeout: 'readonly',
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
        template_Tube: 'readonly',
        template_Tonbo_NLX_G78: 'readonly',
        template_Tonbo_NLX_M40: 'readonly',
        template_Tonbo_CL_G78: 'readonly',
        template_Tonbo_CL_M40: 'readonly',
        template_Tonbo_CL_M22: 'readonly',
        template_Tonbo_CL_M18: 'readonly',
        template_Tonbo_CL_M15: 'readonly',
        template_Tonbo_CL_M12: 'readonly'
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
