#!/usr/bin/env bash
# Installs a JDK and the Android SDK into .tools/ (this VM has no root, so
# nothing is installed system-wide). Safe to re-run; each step is skipped once
# it has completed.
#
#   bash scripts/setup-android.sh
#
# Prints ANDROID_SDK_READY when the SDK is usable.
set -euo pipefail

TOOLS="$PWD/.tools"
mkdir -p "$TOOLS"
cd "$TOOLS"

# ── 1. JDK 21 (Temurin) — required by Capacitor 8 / Android Gradle Plugin ──
if ! "$TOOLS/jdk/bin/java" -version 2>&1 | head -1 | grep -q '21\.'; then
  echo "[1/3] downloading JDK 21..."
  rm -rf "$TOOLS/jdk"
  curl -fL --retry 3 --retry-delay 5 -o jdk.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  rm -rf jdk && mkdir -p jdk
  tar -xzf jdk.tar.gz -C jdk --strip-components=1
  rm -f jdk.tar.gz
  echo "[1/3] JDK ready: $($TOOLS/jdk/bin/java -version 2>&1 | head -1)"
else
  echo "[1/3] JDK already installed"
fi
export JAVA_HOME="$TOOLS/jdk"
export PATH="$JAVA_HOME/bin:$PATH"

# ── 2. Android command-line tools ─────────────────────────────────────
if [ ! -x "$TOOLS/android-sdk/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[2/3] downloading Android command-line tools..."
  curl -fL --retry 3 --retry-delay 5 -o cmdline.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  rm -rf android-sdk && mkdir -p android-sdk/cmdline-tools/unpack
  (cd android-sdk/cmdline-tools/unpack && "$JAVA_HOME/bin/jar" -xf "$TOOLS/cmdline.zip")
  mv android-sdk/cmdline-tools/unpack/cmdline-tools android-sdk/cmdline-tools/latest
  rm -rf android-sdk/cmdline-tools/unpack "$TOOLS/cmdline.zip"
  # `jar` extraction does not preserve the execute bit.
  chmod +x android-sdk/cmdline-tools/latest/bin/*
  echo "[2/3] command-line tools ready"
else
  echo "[2/3] command-line tools already installed"
fi
export ANDROID_HOME="$TOOLS/android-sdk"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

# ── 3. platform, build-tools ──────────────────────────────────────────
if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  echo "[3/3] accepting licences and installing platform + build-tools..."
  yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
  "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
  echo "[3/3] SDK packages installed"
else
  echo "[3/3] SDK packages already installed"
fi

echo "ANDROID_SDK_READY"
echo "export JAVA_HOME=$TOOLS/jdk"
echo "export ANDROID_HOME=$TOOLS/android-sdk"
