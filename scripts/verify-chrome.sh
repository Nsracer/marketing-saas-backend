#!/bin/bash

# Local Chrome verification script
# Use this to test if Chrome/Chromium configuration works locally

echo "🔍 Verifying Chrome/Chromium installation..."

# Check for Chrome executables
CHROME_PATHS=(
  "/usr/bin/chromium"
  "/usr/bin/chromium-browser"
  "/usr/bin/google-chrome"
  "/usr/bin/google-chrome-stable"
  "$(which chromium 2>/dev/null)"
  "$(which chromium-browser 2>/dev/null)"
  "$(which google-chrome 2>/dev/null)"
)

FOUND_CHROME=""

for path in "${CHROME_PATHS[@]}"; do
  if [ -n "$path" ] && [ -f "$path" ]; then
    echo "✅ Found Chrome at: $path"
    FOUND_CHROME="$path"
    break
  fi
done

if [ -z "$FOUND_CHROME" ]; then
  echo "❌ Chrome/Chromium not found!"
  echo ""
  echo "To install Chrome/Chromium:"
  echo ""
  echo "Ubuntu/Debian:"
  echo "  sudo apt-get update"
  echo "  sudo apt-get install -y chromium-browser"
  echo ""
  echo "Mac (using Homebrew):"
  echo "  brew install --cask google-chrome"
  echo ""
  echo "Or use Puppeteer's bundled Chromium (not recommended for production)"
  exit 1
fi

# Check Chrome version
echo ""
echo "📊 Chrome version:"
"$FOUND_CHROME" --version

# Check required dependencies (Linux only)
if [ "$(uname)" == "Linux" ]; then
  echo ""
  echo "🔍 Checking required dependencies..."
  
  MISSING_DEPS=()
  
  REQUIRED_LIBS=(
    "libnss3"
    "libatk-bridge2.0-0"
    "libgtk-3-0"
    "libgbm1"
    "libasound2"
  )
  
  for lib in "${REQUIRED_LIBS[@]}"; do
    if ! dpkg -l | grep -q "$lib"; then
      MISSING_DEPS+=("$lib")
    fi
  done
  
  if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
    echo "✅ All required dependencies are installed"
  else
    echo "⚠️ Missing dependencies:"
    for dep in "${MISSING_DEPS[@]}"; do
      echo "  - $dep"
    done
    echo ""
    echo "Install with:"
    echo "  sudo apt-get install -y ${MISSING_DEPS[*]}"
  fi
fi

# Test environment variables
echo ""
echo "🔧 Recommended environment variables:"
echo "export CHROME_PATH=\"$FOUND_CHROME\""
echo "export PUPPETEER_EXECUTABLE_PATH=\"$FOUND_CHROME\""
echo "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"

echo ""
echo "✅ Verification complete!"
echo ""
echo "To use this Chrome:"
echo "1. Add the environment variables above to your .env file"
echo "2. Restart your application"
echo "3. Test Lighthouse or Puppeteer functionality"
