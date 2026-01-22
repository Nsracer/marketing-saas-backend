/**
 * Chrome Configuration Utility
 * Provides Chrome/Chromium executable path for production environments
 * Supports @sparticuz/chromium for serverless/Render deployments
 */

import { execSync } from 'child_process';
import fs from 'fs';

let chromium = null;

// Try to import @sparticuz/chromium for production
try {
  const chromiumModule = await import('@sparticuz/chromium');
  chromium = chromiumModule.default || chromiumModule;
  console.log('✅ @sparticuz/chromium package loaded successfully');
} catch (error) {
  // Only log in production to avoid cluttering dev logs
  if (process.env.NODE_ENV === 'production') {
    console.log('ℹ️ @sparticuz/chromium not available, using system Chrome:', error.message);
  }
}

/**
 * Get Chrome executable path
 * Works in both local development and production (Render)
 */
export async function getChromeExecutablePath() {
  // For production with @sparticuz/chromium
  if (chromium && process.env.NODE_ENV === 'production') {
    try {
      // In v131+, executablePath is a property, not a function
      const executablePath = typeof chromium.executablePath === 'function'
        ? await chromium.executablePath()
        : chromium.executablePath;

      console.log(`✅ Using @sparticuz/chromium at: ${executablePath}`);
      return executablePath;
    } catch (error) {
      console.warn('⚠️ Failed to get @sparticuz/chromium path:', error.message);
      console.warn('Chromium object:', chromium);
    }
  }

  // Check environment variable first (set in Render)
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Try common paths for different environments
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.HOME + '/.cache/puppeteer/chrome/linux-*/chrome-linux*/chrome',
  ];

  // Check Puppeteer cache directory (from puppeteer.config.cjs)
  try {
    const puppeteerCachePath = process.cwd() + '/.cache/puppeteer';
    if (fs.existsSync(puppeteerCachePath)) {
      const chromeVersions = fs.readdirSync(puppeteerCachePath);
      for (const version of chromeVersions) {
        const chromePath = `${puppeteerCachePath}/${version}/chrome-linux64/chrome`;
        if (fs.existsSync(chromePath)) {
          console.log(`✅ Found Chrome in Puppeteer cache: ${chromePath}`);
          return chromePath;
        }
      }
    }
  } catch (error) {
    // Continue to next method
  }

  for (const path of possiblePaths) {
    try {
      if (fs.existsSync(path)) {
        console.log(`✅ Found Chrome at: ${path}`);
        return path;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  // Try to find using 'which' command (suppress stderr output)
  try {
    const chromePath = execSync('which chromium || which chromium-browser || which google-chrome 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'] // Ignore stderr to suppress "which: no chromium" messages
    }).trim();

    if (chromePath) {
      console.log(`✅ Found Chrome using 'which': ${chromePath}`);
      return chromePath;
    }
  } catch (error) {
    // 'which' command failed - this is expected on Windows or when Chrome isn't in PATH
  }

  // Chrome executable not found in system PATH - will use PageSpeed API or bundled Chromium
  return null;
}

/**
 * Get Puppeteer configuration for production
 */
export async function getPuppeteerConfig() {
  const executablePath = await getChromeExecutablePath();

  // Get additional args from @sparticuz/chromium if available
  let additionalArgs = [];
  if (chromium && process.env.NODE_ENV === 'production') {
    try {
      // In v131+, args is a property, not a function
      additionalArgs = typeof chromium.args === 'function'
        ? await chromium.args()
        : (chromium.args || []);
    } catch (error) {
      console.warn('⚠️ Failed to get @sparticuz/chromium args:', error.message);
    }
  }

  const config = {
    headless: 'new',
    protocolTimeout: 180000, // 3 minutes for cloud environments
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process', // Critical for Render's limited resources
      '--no-zygote',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--metrics-recording-only',
      '--mute-audio',
      ...additionalArgs
    ]
  };

  if (executablePath) {
    config.executablePath = executablePath;
  }

  return config;
}

/**
 * Get Chrome launcher configuration for Lighthouse
 */
export async function getChromeLauncherConfig() {
  const executablePath = await getChromeExecutablePath();

  const flags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-software-rasterizer',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees',
    '--disable-ipc-flooding-protection',
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--disable-domain-reliability',
    '--disable-component-extensions-with-background-pages',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-pings',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-blink-features=AutomationControlled',
  ];

  const config = {
    chromeFlags: flags
  };

  if (executablePath) {
    config.chromePath = executablePath;
  }

  return config;
}
