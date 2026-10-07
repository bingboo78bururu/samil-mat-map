// 코드 스타일(들여쓰기·줄바꿈)은 강제하지 않고, 실수와 구조 위반만 잡습니다.
//   npm run lint
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'reference/mockup_v8.html'] },

  js.configs.recommended,

  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/supabase.js'],
          message: 'DB 접근은 api.js(또는 auth.js)를 거쳐 주세요.',
        }],
      }],
    },
  },

  // supabase 클라이언트를 직접 쓸 수 있는 파일은 이 둘뿐입니다.
  {
    files: ['src/api.js', 'src/auth.js'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['reference/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
