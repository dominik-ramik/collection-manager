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

export default createVuetify({
  theme: {
    defaultTheme: 'lagoon',
    themes: {
      lagoon: {
        dark: false,
        colors: {
          // Muted teal → indigo palette for calmer, readable UI
          primary: '#2D6A7E',    // muted teal
          secondary: '#6B72AE',  // soft indigo
          accent: '#8BAE8C',     // sage accent for highlights
          surface: '#F7FAFC',
          background: '#FFFFFF',
          success: '#22C55E',
          warning: '#F59E0B',
          error:   '#EF4444',
          info:    '#0EA5E9',
        },
      },
    },
  },
})
