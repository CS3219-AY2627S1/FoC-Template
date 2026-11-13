/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'
import { initCredentialWatcher } from './router/index.ts'
import { generatePolyfills } from './util/polyfill.ts';

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'
import '@/styles/tailwind.css'

generatePolyfills();
const app = createApp(App)

registerPlugins(app)
initCredentialWatcher();

app.mount('#app')
