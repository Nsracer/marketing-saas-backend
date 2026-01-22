import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import os from 'os';
import path from 'path';
import { getChromeLauncherConfig } from '../config/chromeConfig.js';

/**
 * Lighthouse Service for Competitor Analysis
 * Simplified version with better error handling for external domains
 */
const competitorLighthouseService = {
  async analyzeSite(domain) {
    // ALWAYS use PageSpeed API (more reliable, no Chrome needed, no memory issues)
    // Chrome-based Lighthouse causes timeouts and high memory usage
    console.log('🌐 Using PageSpeed Insights API for competitor analysis (no Chrome)');
    return this.analyzeViaPageSpeedAPI(domain);

    let chrome;
    let url = domain;
    
    if (!url.startsWith('http')) {
      url = `https://${domain}`;
    }

    try {
      console.log(`🔦 Running Competitor Lighthouse audit for: ${url}`);
      
      const tempDir = os.tmpdir();
      
      // Get Chrome configuration with production support
      const chromeConfig = await getChromeLauncherConfig();
      
      // Add competitor-specific user data dir
      chromeConfig.chromeFlags.push(
        `--user-data-dir=${path.join(tempDir, 'lighthouse-chrome-data-competitor')}`
      );
      
      console.log(`🔧 Competitor Chrome config:`, chromeConfig.chromePath ? `Using: ${chromeConfig.chromePath}` : 'Using default Chrome');
      
      chrome = await launch(chromeConfig);

      const options = {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        port: chrome.port,
        chromeFlags: ['--headless', '--no-sandbox'],
        maxWaitForFcp: 45000,
        maxWaitForLoad: 60000,
        skipAudits: ['screenshot-thumbnails', 'final-screenshot']
      };

      const runnerResult = await lighthouse(url, options);
      
      if (!runnerResult || !runnerResult.lhr) {
        throw new Error('Lighthouse audit failed - no results returned');
      }

      const { categories, audits } = runnerResult.lhr;

      console.log(`✅ Competitor Lighthouse audit completed for ${domain}`);
      console.log(`   Performance: ${Math.round(categories.performance.score * 100)}%`);
      console.log(`   SEO: ${Math.round(categories.seo.score * 100)}%`);

      return {
        dataAvailable: true,
        url: url,
        categories: {
          performance: {
            score: categories.performance.score,
            displayValue: Math.round(categories.performance.score * 100)
          },
          accessibility: {
            score: categories.accessibility.score,
            displayValue: Math.round(categories.accessibility.score * 100)
          },
          'best-practices': {
            score: categories['best-practices'].score,
            displayValue: Math.round(categories['best-practices'].score * 100)
          },
          seo: {
            score: categories.seo.score,
            displayValue: Math.round(categories.seo.score * 100)
          }
        },
        metrics: {
          firstContentfulPaint: audits['first-contentful-paint']?.numericValue || null,
          largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || null,
          totalBlockingTime: audits['total-blocking-time']?.numericValue || null,
          cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || null,
          speedIndex: audits['speed-index']?.numericValue || null,
          timeToInteractive: audits['interactive']?.numericValue || null
        }
      };

    } catch (error) {
      console.error(`❌ Competitor Lighthouse audit failed for ${domain}:`, error.message);
      
      // Try PageSpeed API as fallback
      if (process.env.GOOGLE_API_KEY) {
        console.log('🔄 Trying PageSpeed API as fallback...');
        return this.analyzeViaPageSpeedAPI(domain);
      }
      
      return {
        dataAvailable: false,
        reason: 'Lighthouse audit failed',
        error: error.message,
        categories: {
          performance: { score: null, displayValue: null },
          accessibility: { score: null, displayValue: null },
          'best-practices': { score: null, displayValue: null },
          seo: { score: null, displayValue: null }
        }
      };
    } finally {
      if (chrome) {
        try {
          await chrome.kill();
          console.log(`🔴 Chrome instance closed for ${domain}`);
        } catch (killError) {
          console.error(`⚠️ Error killing Chrome for ${domain}:`, killError.message);
        }
      }
    }
  },

  async analyzeViaPageSpeedAPI(domain) {
    try {
      let url = domain;
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('❌ Google API key not configured');
        return {
          dataAvailable: false,
          reason: 'Google API key not configured'
        };
      }

      console.log(`🌐 Fetching competitor Lighthouse data via PageSpeed API for: ${url}`);
      
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=desktop`,
        { timeout: 90000 }
      );

      if (!response.ok) {
        console.error(`❌ PageSpeed API error: ${response.status}`);
        return {
          dataAvailable: false,
          reason: `PageSpeed API error: ${response.status}`
        };
      }

      const data = await response.json();
      const { categories, audits } = data.lighthouseResult;

      console.log(`✅ Competitor Lighthouse data fetched via PageSpeed API for ${domain}`);
      console.log(`   Performance: ${Math.round(categories.performance.score * 100)}%`);
      console.log(`   SEO: ${Math.round(categories.seo.score * 100)}%`);

      return {
        dataAvailable: true,
        url: url,
        source: 'PageSpeed Insights API',
        categories: {
          performance: {
            score: categories.performance.score,
            displayValue: Math.round(categories.performance.score * 100)
          },
          accessibility: {
            score: categories.accessibility.score,
            displayValue: Math.round(categories.accessibility.score * 100)
          },
          'best-practices': {
            score: categories['best-practices'].score,
            displayValue: Math.round(categories['best-practices'].score * 100)
          },
          seo: {
            score: categories.seo.score,
            displayValue: Math.round(categories.seo.score * 100)
          }
        },
        metrics: {
          firstContentfulPaint: audits['first-contentful-paint']?.numericValue || null,
          largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || null,
          totalBlockingTime: audits['total-blocking-time']?.numericValue || null,
          cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || null,
          speedIndex: audits['speed-index']?.numericValue || null,
          timeToInteractive: audits['interactive']?.numericValue || null
        }
      };

    } catch (error) {
      console.error('❌ Competitor PageSpeed API failed:', error.message);
      return {
        dataAvailable: false,
        reason: 'PageSpeed API failed',
        error: error.message
      };
    }
  }
};

export default competitorLighthouseService;
