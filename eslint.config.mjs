import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * テンプレートディレクトリの JS ファイルから `const template_XXXX` 宣言を
 * すべて検出し、ESLint globals オブジェクトを自動生成する。
 *
 * - ファイル名ではなく内容を走査するため、1 ファイル複数変数・
 *   ファイル名と変数名が異なるケース（例: data_template_G18_6.55.js →
 *   template_G18_655）にも対応する。
 * - テンプレートを追加しても eslint.config.mjs の手動更新は不要。
 */
function buildTemplateGlobals() {
  const templateDir = join(__dirname, 'NC-PROG-GEN', 'テンプレート');
  const globals = {};
  const files = readdirSync(templateDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const content = readFileSync(join(templateDir, file), 'utf8');
    // BOM 付きファイル（UTF-8 BOM, \uFEFF）では ^ が行頭にマッチしないため
    // \b を使って単語境界でマッチする
    for (const [, varName] of content.matchAll(/\bconst\s+(template_\w+)/g)) {
      globals[varName] = 'readonly';
    }
  }
  return globals;
}

const templateGlobals = buildTemplateGlobals();

export default [
  {
    ignores: ['参考フォルダ/**', 'node_modules/**']
  },
  {
    files: ['NC-PROG-GEN/assets/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        // Browser built-ins
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
        // data.js / data-v2.js globals
        machines: 'readonly',
        tubeData: 'readonly',
        // テンプレートグローバル（テンプレートディレクトリから自動生成）
        ...templateGlobals
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
    files: ['NC-PROG-GEN/assets/data-v2.js'],
    rules: {
      'no-redeclare': 'off'
    }
  },
  {
    // Playwrightのpage.evaluate()コールバック内はブラウザ上で実行されるコードのため、
    // このファイルに限りブラウザ組み込みオブジェクトもグローバルとして許可する
    files: ['scripts/test-e2e-validation.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        CompositionEvent: 'readonly',
        InputEvent: 'readonly'
      }
    }
  }
];
