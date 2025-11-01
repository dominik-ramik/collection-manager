/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Composables
import { createVuetify } from 'vuetify'
// Styles
import '@mdi/font/css/materialdesignicons.css'

import 'vuetify/styles'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'collectionGreen',
    themes: {
      collectionGreen: {
        dark: false,
        colors: {
          primary: '#43a047', // green-600, softer material green
          secondary: '#3949ab',
          accent: '#5c6bc0',
          // Remove background color so it defaults to white
        },
      },
    },
  },
})
