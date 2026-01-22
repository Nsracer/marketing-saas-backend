// services/gscBacklinksScraper.js - Scrape backlinks from GSC web interface using Puppeteer
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { getPuppeteerConfig } from '../config/chromeConfig.js';

const gscBacklinksScraper = {
  /**
   * Check if a session exists for a user
   * @param {string} email - User email
   * @returns {boolean} True if session directory exists and has cookies
   */
  hasValidSession(email) {
    try {
      const sessionDir = path.join(process.cwd(), 'data', 'gsc-sessions', email.replace(/[^a-zA-Z0-9]/g, '_'));
      const cookiesPath = path.join(sessionDir, 'Default', 'Cookies');
      
      // Check if session directory and cookies file exist
      return fs.existsSync(sessionDir) && fs.existsSync(cookiesPath);
    } catch (error) {
      return false;
    }
  },

  /**
   * Scrape backlinks data using session-based authentication (RECOMMENDED METHOD)
   * This creates a persistent browser session per user for future requests
   * @param {string} email - User email for session management
   * @param {string} domain - Domain to fetch backlinks for
   * @param {boolean} isFirstTime - If true, launches non-headless for initial login
   * @returns {Object} Backlinks data with top linking sites and pages
   */
  async scrapeBacklinksWithSession(email, domain, isFirstTime = false) {
    let browser = null;
    
    try {
      console.log('🚀 Starting Puppeteer with session-based auth...');
      
      // Create session directory for this user
      const sessionDir = path.join(process.cwd(), 'data', 'gsc-sessions', email.replace(/[^a-zA-Z0-9]/g, '_'));
      
      // Check if session exists
      const hasSession = this.hasValidSession(email);
      console.log(`🔍 Session check: ${hasSession ? 'EXISTS' : 'NOT FOUND'}`);
      
      // If no session exists and this is not first-time setup, suggest setup
      if (!hasSession && !isFirstTime) {
        console.log('⚠️ No session found. User needs to complete first-time setup.');
        return {
          dataAvailable: false,
          topLinkingSites: [],
          topLinkingPages: [],
          totalBacklinks: 0,
          note: 'No saved session found. Please complete the first-time setup by calling POST /api/search-console/setup-backlinks-scraper with your email and domain.',
          requiresSetup: true
        };
      }
      
      // Ensure directory exists
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      // Get production-ready Puppeteer config
      const puppeteerConfig = await getPuppeteerConfig();
      
      // Launch browser with persistent session
      browser = await puppeteer.launch({
        ...puppeteerConfig,
        headless: !isFirstTime, // Non-headless on first login, headless after
        userDataDir: sessionDir, // Persist cookies/session here
        args: [
          ...puppeteerConfig.args,
          '--window-size=1920,1080'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Prepare the GSC URL
      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      // Handle sc-domain format
      const cleanDomain = siteUrl.replace('sc-domain:', '');
      const encodedSiteUrl = encodeURIComponent(cleanDomain);
      const gscLinksUrl = `https://search.google.com/search-console/links?resource_id=${encodedSiteUrl}`;
      
      console.log(`🌐 Navigating to: ${gscLinksUrl}`);
      
      await page.goto(gscLinksUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000
      });

      // Check if we're on login page
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com')) {
        if (isFirstTime) {
          console.log('📝 First-time login detected. Waiting for user to complete OAuth...');
          console.log('⏳ Please login in the browser window. Waiting 60 seconds...');
          
          // Wait for navigation away from login page
          await page.waitForNavigation({ 
            waitUntil: 'networkidle2', 
            timeout: 60000 
          }).catch(() => {
            console.log('⚠️ Navigation timeout - user may still be logging in');
          });
          
          // Navigate to GSC after login
          await page.goto(gscLinksUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        } else {
          // Session expired - need to re-authenticate
          console.log('⚠️ Session expired. Redirected to login page.');
          
          // Close browser and return helpful error
          if (browser) {
            await browser.close().catch(() => {});
          }
          
          return {
            dataAvailable: false,
            topLinkingSites: [],
            topLinkingPages: [],
            totalBacklinks: 0,
            note: 'Session expired. Please reconnect your Google account by calling POST /api/search-console/setup-backlinks-scraper to login again.',
            sessionExpired: true,
            requiresSetup: true
          };
        }
      }

      // Wait for page to load
      await page.waitForTimeout(3000);

      // Take screenshot for debugging
      const screenshotPath = path.join(sessionDir, 'gsc-screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);

      // Extract top linking sites
      console.log('🔍 Extracting top linking sites...');
      const topLinkingSites = await this.extractLinkingSites(page);
      console.log(`✅ Found ${topLinkingSites.length} linking sites`);

      // Extract top linking pages (may need to click tab)
      console.log('🔍 Extracting top linking pages...');
      const topLinkingPages = await this.extractLinkingPages(page);
      console.log(`✅ Found ${topLinkingPages.length} linking pages`);

      // Calculate total backlinks
      const totalBacklinks = topLinkingSites.reduce((sum, site) => sum + site.links, 0);

      await browser.close();

      return {
        dataAvailable: topLinkingSites.length > 0 || topLinkingPages.length > 0,
        topLinkingSites,
        topLinkingPages,
        totalBacklinks,
        note: topLinkingSites.length === 0 && topLinkingPages.length === 0
          ? 'No backlink data found. This property may not have any backlinks yet, or you may need to reconnect your account.'
          : null
      };

    } catch (error) {
      console.error('❌ GSC backlinks scraping failed:', error.message);
      
      if (browser) {
        await browser.close().catch(() => {});
      }

      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        totalBacklinks: 0,
        note: `Scraping failed: ${error.message}`
      };
    }
  },

  /**
   * Extract linking sites from the page
   */
  async extractLinkingSites(page) {
    return await page.evaluate(() => {
      const sites = [];
      
      // Try multiple selector patterns (GSC changes their UI frequently)
      const selectors = [
        // Pattern 1: Table rows
        'table[aria-label*="linking"] tr, table[aria-label*="sites"] tr',
        // Pattern 2: List items
        '[data-testid*="linking-site"], [data-type="linking-site"]',
        // Pattern 3: Generic table
        'table tbody tr',
        // Pattern 4: Cards/divs
        'div[role="row"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach((el, index) => {
          // Skip header rows
          if (el.querySelector('th') || index === 0) return;
          
          // Try to extract domain and link count
          const cells = el.querySelectorAll('td, div[role="cell"]');
          const allText = el.innerText?.trim() || '';
          
          // Look for domain pattern (example.com format)
          const domainMatch = allText.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
          // Look for number pattern
          const numberMatch = allText.match(/(\d+[\d,\.]*)\s*(link|backlink)?/i);
          
          if (domainMatch) {
            const domain = domainMatch[1];
            const links = numberMatch ? parseInt(numberMatch[1].replace(/[^0-9]/g, '')) : 0;
            
            // Avoid duplicates
            if (!sites.find(s => s.domain === domain)) {
              sites.push({ domain, links, authority: null });
            }
          }
        });
        
        // If we found sites, stop trying other selectors
        if (sites.length > 0) break;
      }

      return sites.slice(0, 10);
    });
  },

  /**
   * Extract linking pages from the page
   */
  async extractLinkingPages(page) {
    // Try to find and click "Top linking pages" tab
    try {
      const tabSelectors = [
        'button:contains("pages")',
        '[aria-label*="linking pages"]',
        '[data-tab="pages"]',
        'a[href*="linking-pages"]'
      ];
      
      for (const selector of tabSelectors) {
        const tab = await page.$(selector).catch(() => null);
        if (tab) {
          await tab.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    } catch (err) {
      console.log('⚠️ Could not find linking pages tab, using current page');
    }

    return await page.evaluate(() => {
      const pages = [];
      
      const selectors = [
        'table[aria-label*="linking"] tr, table[aria-label*="pages"] tr',
        '[data-testid*="linking-page"], [data-type="linking-page"]',
        'table tbody tr',
        'div[role="row"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach((el, index) => {
          if (el.querySelector('th') || index === 0) return;
          
          const allText = el.innerText?.trim() || '';
          
          // Look for URL pattern
          const urlMatch = allText.match(/(https?:\/\/[^\s]+)/);
          // Look for number
          const numberMatch = allText.match(/(\d+[\d,\.]*)\s*(link|backlink)?/i);
          
          if (urlMatch) {
            const url = urlMatch[1];
            const backlinks = numberMatch ? parseInt(numberMatch[1].replace(/[^0-9]/g, '')) : 0;
            
            if (!pages.find(p => p.url === url)) {
              pages.push({ url, backlinks });
            }
          }
        });
        
        if (pages.length > 0) break;
      }

      return pages.slice(0, 10);
    });
  },

  /**
   * Original method - Scrape backlinks using OAuth token cookies
   * NOTE: This may not work reliably due to Google's complex auth
   * @param {Object} oauth2Client - Authenticated OAuth2 client
   * @param {string} domain - Domain to fetch backlinks for
   * @returns {Object} Backlinks data
   */
  async scrapeBacklinks(oauth2Client, domain) {
    let browser = null;
    
    try {
      console.log('🚀 Starting Puppeteer to scrape GSC backlinks...');
      
      // Get access token
      const accessToken = oauth2Client.credentials.access_token;
      const refreshToken = oauth2Client.credentials.refresh_token;
      
      if (!accessToken) {
        throw new Error('No access token available');
      }

      // Launch browser
      const puppeteerConfig = await getPuppeteerConfig();
      browser = await puppeteer.launch({
        ...puppeteerConfig,
        headless: true // Set to false for debugging
      });

      const page = await browser.newPage();
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Set cookies to authenticate with Google
      const cookies = await this.generateGoogleCookies(accessToken, refreshToken);
      await page.setCookie(...cookies);

      // Prepare the GSC URL for the domain
      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const encodedSiteUrl = encodeURIComponent(siteUrl);
      
      // Navigate to GSC Links page
      const gscLinksUrl = `https://search.google.com/search-console/links?resource_id=${encodedSiteUrl}`;
      
      console.log(`🌐 Navigating to: ${gscLinksUrl}`);
      
      await page.goto(gscLinksUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for the page to load - look for common GSC elements
      await page.waitForTimeout(3000); // Give time for JS to load

      // Take screenshot for debugging (optional)
      // await page.screenshot({ path: 'gsc-backlinks.png', fullPage: true });

      // Extract top linking sites
      console.log('🔍 Extracting top linking sites...');
      const topLinkingSites = await page.evaluate(() => {
        const sites = [];
        
        // Try to find linking sites table
        // GSC uses various selectors, these are common patterns
        const siteElements = document.querySelectorAll(
          '[data-metric="linking-sites"] tr, ' +
          '.linking-sites-table tr, ' +
          'table.external-links tr'
        );

        siteElements.forEach((row, index) => {
          if (index === 0) return; // Skip header row
          
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const domain = cells[0]?.innerText?.trim();
            const linksText = cells[1]?.innerText?.trim();
            const links = parseInt(linksText?.replace(/[^0-9]/g, '') || '0');
            
            if (domain) {
              sites.push({
                domain,
                links,
                authority: null // GSC doesn't provide DA
              });
            }
          }
        });

        // Alternative: Try to find by specific GSC class names (these change)
        if (sites.length === 0) {
          const linkCards = document.querySelectorAll('[data-type="linking-site"]');
          linkCards.forEach(card => {
            const domain = card.querySelector('.site-url')?.innerText?.trim();
            const linksText = card.querySelector('.link-count')?.innerText?.trim();
            const links = parseInt(linksText?.replace(/[^0-9]/g, '') || '0');
            
            if (domain) {
              sites.push({ domain, links, authority: null });
            }
          });
        }

        return sites.slice(0, 10); // Return top 10
      });

      console.log(`✅ Found ${topLinkingSites.length} linking sites`);

      // Extract top linking pages
      console.log('🔍 Extracting top linking pages...');
      
      // Try to navigate to the linking pages section if it's on a different tab
      const linkingPagesSelector = '[href*="linking-pages"], [data-tab="linking-pages"]';
      const hasLinkingPagesTab = await page.$(linkingPagesSelector);
      
      if (hasLinkingPagesTab) {
        console.log('📄 Clicking on linking pages tab...');
        await hasLinkingPagesTab.click();
        await page.waitForTimeout(2000);
      }

      const topLinkingPages = await page.evaluate(() => {
        const pages = [];
        
        // Try to find linking pages table
        const pageElements = document.querySelectorAll(
          '[data-metric="linking-pages"] tr, ' +
          '.linking-pages-table tr, ' +
          'table.linking-pages tr'
        );

        pageElements.forEach((row, index) => {
          if (index === 0) return; // Skip header row
          
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const url = cells[0]?.innerText?.trim();
            const backlinksText = cells[1]?.innerText?.trim();
            const backlinks = parseInt(backlinksText?.replace(/[^0-9]/g, '') || '0');
            
            if (url) {
              pages.push({ url, backlinks });
            }
          }
        });

        // Alternative: Try to find by specific GSC class names
        if (pages.length === 0) {
          const pageCards = document.querySelectorAll('[data-type="linking-page"]');
          pageCards.forEach(card => {
            const url = card.querySelector('.page-url')?.innerText?.trim();
            const backlinksText = card.querySelector('.backlink-count')?.innerText?.trim();
            const backlinks = parseInt(backlinksText?.replace(/[^0-9]/g, '') || '0');
            
            if (url) {
              pages.push({ url, backlinks });
            }
          });
        }

        return pages.slice(0, 10); // Return top 10
      });

      console.log(`✅ Found ${topLinkingPages.length} linking pages`);

      // Calculate total backlinks
      const totalBacklinks = topLinkingSites.reduce((sum, site) => sum + site.links, 0);

      await browser.close();

      return {
        dataAvailable: topLinkingSites.length > 0 || topLinkingPages.length > 0,
        topLinkingSites,
        topLinkingPages,
        totalBacklinks,
        note: topLinkingSites.length === 0 && topLinkingPages.length === 0
          ? 'No backlink data found in Google Search Console. This property may not have any backlinks yet, or the data is not available.'
          : null
      };

    } catch (error) {
      console.error('❌ GSC backlinks scraping failed:', error.message);
      
      if (browser) {
        await browser.close();
      }

      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        totalBacklinks: 0,
        note: `Failed to scrape backlinks: ${error.message}`
      };
    }
  },

  /**
   * Generate Google cookies from OAuth tokens
   * @param {string} accessToken - OAuth2 access token
   * @param {string} refreshToken - OAuth2 refresh token (optional)
   * @returns {Array} Array of cookie objects
   */
  async generateGoogleCookies(accessToken, refreshToken) {
    const cookies = [
      {
        name: 'oauth_token',
        value: accessToken,
        domain: '.google.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      },
      {
        name: 'OSID',
        value: accessToken.substring(0, 50), // Shortened for cookie
        domain: '.google.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      },
      {
        name: 'SID',
        value: accessToken.substring(0, 50),
        domain: '.google.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'None'
      }
    ];

    if (refreshToken) {
      cookies.push({
        name: 'refresh_token',
        value: refreshToken,
        domain: '.google.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None'
      });
    }

    return cookies;
  },

  /**
   * Alternative approach: Use Puppeteer with direct login
   * This requires storing user credentials or using OAuth flow in browser
   */
  async scrapeBacklinksWithLogin(email, domain) {
    let browser = null;
    
    try {
      console.log('🚀 Starting Puppeteer with login flow...');
      
      const puppeteerConfig = await getPuppeteerConfig();
      browser = await puppeteer.launch({
        ...puppeteerConfig,
        headless: false // Must be false for OAuth login
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to GSC
      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const encodedSiteUrl = encodeURIComponent(siteUrl);
      const gscUrl = `https://search.google.com/search-console/links?resource_id=${encodedSiteUrl}`;

      console.log('🌐 Navigating to GSC...');
      await page.goto(gscUrl, { waitUntil: 'networkidle2' });

      // Check if redirected to login
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com')) {
        console.log('⚠️ User needs to login. Opening browser for OAuth...');
        console.log('📝 Please login manually. Waiting 60 seconds...');
        
        // Wait for user to complete OAuth login
        await page.waitForTimeout(60000);
        
        // Navigate to links page after login
        await page.goto(gscUrl, { waitUntil: 'networkidle2' });
      }

      // Continue with scraping (same as above)
      // ... (rest of the scraping logic)

      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        note: 'Manual login required. This method needs interactive OAuth.'
      };

    } catch (error) {
      console.error('❌ Scraping with login failed:', error.message);
      
      if (browser) {
        await browser.close();
      }

      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        note: `Failed: ${error.message}`
      };
    }
  }
};

export default gscBacklinksScraper;
