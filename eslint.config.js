import vuetify from 'eslint-config-vuetify'

export default [
  ...vuetify(),
  {
    rules: {
      'vue/attributes-order': 'off',
    },
  },
]
