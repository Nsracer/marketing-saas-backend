#!/bin/bash

# Script to install Chromium on Render (Ubuntu environment)
# This will be run during the build phase

echo "🔧 Installing Chromium and dependencies..."

# Update package lists
apt-get update

# Install Chromium and required dependencies
apt-get install -y \
  chromium \
  chromium-driver \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  libu2f-udev \
  libvulkan1

# Find Chromium executable
CHROME_PATH=$(which chromium || which chromium-browser)

if [ -z "$CHROME_PATH" ]; then
  echo "❌ Chromium installation failed"
  exit 1
fi

echo "✅ Chromium installed successfully at: $CHROME_PATH"
echo "📌 Set CHROME_PATH=$CHROME_PATH in your environment variables"

# Create symlink for consistency
ln -sf "$CHROME_PATH" /usr/local/bin/chromium-browser

echo "✅ Chrome installation complete!"
