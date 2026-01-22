#!/bin/bash

# Render.com build script
# This runs during the build phase on Render

set -e  # Exit on error

echo "🚀 Starting Render build process..."

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# The postinstall script will automatically install Chrome via:
# npx @puppeteer/browsers install chrome
# Chrome will be cached in .cache/puppeteer directory

echo "✅ Build complete!"
