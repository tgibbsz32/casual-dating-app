import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android shell.
 *
 * The APK is a thin native wrapper around the same web build: it loads the
 * deployed site, so server-side fixes ship without an app-store release.
 *
 * Set the backend origin at sync time:
 *
 *   SPARK_SERVER_URL=https://your-site.example npm run build
 *   SPARK_SERVER_URL=https://your-site.example npx cap sync android
 *   npm run apk:debug
 *
 * With no SPARK_SERVER_URL the config bundles webDir instead, which builds but
 * cannot reach the API — useful only for checking the toolchain.
 */
const serverUrl = process.env.SPARK_SERVER_URL?.trim()

const config: CapacitorConfig = {
  appId: 'com.spark.dating',
  appName: 'Spark',
  webDir: 'dist/client',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ...(serverUrl
    ? { server: { url: serverUrl, cleartext: false, androidScheme: 'https' } }
    : {}),
}

export default config
