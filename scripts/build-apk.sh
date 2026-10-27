#!/usr/bin/env bash
# Builds an Android APK from the Capacitor shell.
#
#   bash scripts/build-apk.sh [gradle-task]
#
# Defaults to assembleDebug (self-signed, installable for testing).
# Prerequisites: scripts/setup-android.sh has run, and npm run build has
# produced dist/client.
#
# Set SPARK_SERVER_URL to bake the backend origin into the app; without it the
# APK bundles the web assets but cannot reach the API.
set -euo pipefail

ROOT="$PWD"
export JAVA_HOME="$ROOT/.tools/jdk"
export ANDROID_HOME="$ROOT/.tools/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

if [ ! -x "$JAVA_HOME/bin/java" ] || [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Android toolchain missing — run: bash scripts/setup-android.sh" >&2
  exit 1
fi

if [ ! -d dist/client ]; then
  echo "dist/client missing — run: npm run build" >&2
  exit 1
fi

# Re-copy the web build and the (optional) server URL into the native project.
npx cap sync android

cd android
exec ./gradlew "${1:-assembleDebug}" --stacktrace
