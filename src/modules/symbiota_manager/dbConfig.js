import { useAppStore } from '@/stores/app'

export async function getDbConfig() {
  const appStore = useAppStore()
  const dsSettings = await import('@/data_sources/symbiota/settings.json')
  const user = appStore.symbiota?.token?.user || ''
  const pass = appStore.symbiota?.token?.pass || ''
  return {
    host: dsSettings.settings.host,
    port: dsSettings.settings.port,
    user,
    pass,
    database: dsSettings.settings.database
  }
}
