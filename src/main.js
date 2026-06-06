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

// New: static settings imports
import spSettingsMod from '@/modules/specimen_photos_selector/settings.json'
import taxaSettingsMod from '@/modules/taxa_photos_selector/settings.json'
import symSettingsMod from '@/modules/symbiota_manager/settings.json'
import hcSettingsMod from '@/modules/collection_healthcheck/settings.json'
import gazeteerSettingsMod from '@/modules/gazeteer/settings.json'

// Removed dynamic import loop; build modules statically
async function bootstrap() {
  const appStore = useAppStore()
  const modules = [
    { name: 'specimen_photos_selector', ...((spSettingsMod?.default) ?? spSettingsMod) },
    { name: 'taxa_photos_selector', ...((taxaSettingsMod?.default) ?? taxaSettingsMod) },
    { name: 'symbiota_manager', ...((symSettingsMod?.default) ?? symSettingsMod) },
    { name: 'collection_healthcheck', ...((hcSettingsMod?.default) ?? hcSettingsMod) },
    { name: 'gazeteer', ...((gazeteerSettingsMod?.default) ?? gazeteerSettingsMod) },
  ]
  appStore.setModules(modules)
  // Optionally, load data sources here in a similar way
  app.mount('#app')
}

bootstrap()
