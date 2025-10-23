import rocketseat from '@rocketseat/eslint-config/node.mjs'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
  {
    ignores: ['node_modules', 'build', 'dist'],
  },
  ...rocketseat,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      camelcase: 'off',
      'no-useless-constructor': 'off',
      'simple-import-sort/imports': 'error',
      '@stylistic/max-len': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/indent': 'off',
      '@stylistic/brace-style': 'off',
    },
  },
]
