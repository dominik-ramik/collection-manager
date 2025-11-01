/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'

const app = createApp(App)

registerPlugins(app)

import { useAppStore } from '@/stores/app'

const moduleNames = [
  'specimen_photos_selector',
  'taxa_photos_selector',
  'symbiota_manager', // <-- update to new module name
  'collection_healthcheck',
]

async function loadModules() {
  const modules = []
  for (const name of moduleNames) {
    try {
      const settings = await import(`@/modules/${name}/settings.json`)
      modules.push({ name, ...settings })
    } catch (e) {
      const appStore = useAppStore()
      appStore.setError(`Module "${name}" settings.json missing or malformed.`)
      return []
    }
  }
  return modules
}

async function bootstrap() {
  const appStore = useAppStore()
  const modules = await loadModules()
  appStore.setModules(modules)
  // Optionally, load data sources here in a similar way
  app.mount('#app')
}

bootstrap()
