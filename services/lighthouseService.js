import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import os from 'os';
import path from 'path';
import { getChromeLauncherConfig } from '../config/chromeConfig.js';

// Request queue to prevent concurrent analyses (reduces CPU load)
const analysisQueue = [];
let isProcessing = false;
const MAX_CONCURRENT = 1; // Only 1 analysis at a time

const processQueue = async () => {
  if (isProcessing || analysisQueue.length === 0) return;

  isProcessing = true;
  const { domain, resolve, reject } = analysisQueue.shift();

  try {
    const result = await lighthouseService._analyzeSiteInternal(domain);
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    isProcessing = false;
    // Process next in queue
    if (analysisQueue.length > 0) {
      setTimeout(processQueue, 1000); // 1 second delay between analyses
    }
  }
};

const lighthouseService = {
  async analyzeSite(domain) {
    // ALWAYS use PageSpeed API (more reliable, no Chrome needed, no memory issues)
    // Chrome-based Lighthouse causes timeouts and high memory usage
    console.log('🌐 Using PageSpeed Insights API for Lighthouse (no Chrome)');
    return this.analyzeViaPageSpeedAPI(domain);

    /* Chrome-based Lighthouse disabled - using PageSpeed API instead
    // In production, prefer PageSpeed API (more reliable, no Chrome needed)
    if (process.env.NODE_ENV === 'production' && process.env.FORCE_CHROME !== 'true') {
      console.log('🌐 Using PageSpeed Insights API for production (recommended)');
      return this.analyzeViaPageSpeedAPI(domain);
    }
    
    // Check if Chrome is available, otherwise use PageSpeed API
    const chromeAvailable = await this.checkChromeAvailability();
    
    if (!chromeAvailable) {
      console.log('⚠️ Chrome not available, using PageSpeed Insights API as fallback');
      return this.analyzeViaPageSpeedAPI(domain);
    }
    
    // Add to queue and return promise
    return new Promise((resolve, reject) => {
      analysisQueue.push({ domain, resolve, reject });
      console.log(`📋 Added to queue. Position: ${analysisQueue.length}`);
      processQueue();
    });
    */
  },

  async checkChromeAvailability() {
    // Allow forcing API fallback for testing
    if (process.env.FORCE_API_FALLBACK === 'true') {
      console.log('🧪 FORCE_API_FALLBACK enabled - skipping Chrome check');
      return false;
    }

    try {
      const { getChromeExecutablePath } = await import('../config/chromeConfig.js');
      const chromePath = getChromeExecutablePath();
      return chromePath !== null;
    } catch (error) {
      return false;
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
        return null;
      }

      console.log(`🌐 Fetching Lighthouse data via PageSpeed Insights API for: ${url}`);

      const fetch = (await import('node-fetch')).default;

      // Fetch both desktop and mobile in parallel for comprehensive data
      const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=desktop`;
      const mobileUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;

      console.log(`   📱 Fetching both desktop and mobile data in parallel...`);

      const [desktopResult, mobileResult] = await Promise.allSettled([
        // Desktop fetch
        (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => {
            controller.abort();
            console.error('⏱️ Desktop PageSpeed API timed out after 60s');
          }, 60000);

          try {
            const response = await fetch(desktopUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`Desktop API error: ${response.status}`);
            return await response.json();
          } catch (err) {
            clearTimeout(timeout);
            throw err;
          }
        })(),
        // Mobile fetch
        (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => {
            controller.abort();
            console.error('⏱️ Mobile PageSpeed API timed out after 60s');
          }, 60000);

          try {
            const response = await fetch(mobileUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`Mobile API error: ${response.status}`);
            return await response.json();
          } catch (err) {
            clearTimeout(timeout);
            throw err;
          }
        })()
      ]);

      // Use desktop as primary, mobile as supplementary
      const desktopData = desktopResult.status === 'fulfilled' ? desktopResult.value : null;
      const mobileData = mobileResult.status === 'fulfilled' ? mobileResult.value : null;

      if (!desktopData && !mobileData) {
        console.error('❌ Both desktop and mobile PageSpeed API requests failed');
        return null;
      }

      // Use desktop data as primary, fall back to mobile if desktop fails
      const data = desktopData || mobileData;
      const { categories, audits } = data.lighthouseResult;

      // Extract mobile performance score if available
      const mobilePerformance = mobileData?.lighthouseResult?.categories?.performance?.score
        ? Math.round(mobileData.lighthouseResult.categories.performance.score * 100)
        : null;

      console.log(`   ✅ Desktop: ${desktopData ? 'OK' : 'Failed'}, Mobile: ${mobileData ? 'OK' : 'Failed'}`);
      if (mobilePerformance !== null) {
        console.log(`   📱 Mobile Performance Score: ${mobilePerformance}%`);
      }

      // Transform PageSpeed API response to match our format
      const result = {
        // Add categories in the format expected by competitorService comparison
        categories: {
          performance: { score: categories.performance.score },
          accessibility: { score: categories.accessibility.score },
          'best-practices': { score: categories['best-practices'].score },
          seo: { score: categories.seo.score }
        },
        categoryScores: {
          performance: Math.round(categories.performance.score * 100),
          mobilePerformance: mobilePerformance, // Real mobile score from PageSpeed API
          accessibility: Math.round(categories.accessibility.score * 100),
          bestPractices: Math.round(categories['best-practices'].score * 100),
          seo: Math.round(categories.seo.score * 100)
        },
        coreWebVitals: {
          lcp: {
            value: audits['largest-contentful-paint']?.numericValue || null,
            displayValue: audits['largest-contentful-paint']?.displayValue || 'N/A',
            score: Math.round((audits['largest-contentful-paint']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['largest-contentful-paint']?.numericValue, 'lcp'),
            threshold: { good: 2500, needs_improvement: 4000 }
          },
          fid: {
            value: audits['max-potential-fid']?.numericValue || null,
            displayValue: audits['max-potential-fid']?.displayValue || 'N/A',
            score: Math.round((audits['max-potential-fid']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['max-potential-fid']?.numericValue, 'fid'),
            threshold: { good: 100, needs_improvement: 300 }
          },
          cls: {
            value: audits['cumulative-layout-shift']?.numericValue || null,
            displayValue: audits['cumulative-layout-shift']?.displayValue || 'N/A',
            score: Math.round((audits['cumulative-layout-shift']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['cumulative-layout-shift']?.numericValue, 'cls'),
            threshold: { good: 0.1, needs_improvement: 0.25 }
          },
          fcp: {
            value: audits['first-contentful-paint']?.numericValue || null,
            displayValue: audits['first-contentful-paint']?.displayValue || 'N/A',
            score: Math.round((audits['first-contentful-paint']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['first-contentful-paint']?.numericValue, 'fcp'),
            threshold: { good: 1800, needs_improvement: 3000 }
          }
        },
        performanceTimeline: {
          fcp: audits['first-contentful-paint']?.numericValue || null,
          lcp: audits['largest-contentful-paint']?.numericValue || null,
          tti: audits['interactive']?.numericValue || null,
          speedIndex: audits['speed-index']?.numericValue || null,
          tbt: audits['total-blocking-time']?.numericValue || null,
          dcl: audits['server-response-time']?.numericValue || null
        },
        resourceMetrics: {
          totalByteWeight: {
            value: audits['total-byte-weight']?.numericValue || 0,
            displayValue: audits['total-byte-weight']?.displayValue || '0 KiB',
            score: Math.round((audits['total-byte-weight']?.score || 0) * 100)
          },
          unusedCss: {
            value: audits['unused-css-rules']?.details?.overallSavingsBytes || 0,
            displayValue: this.formatBytes(audits['unused-css-rules']?.details?.overallSavingsBytes || 0),
            score: Math.round((audits['unused-css-rules']?.score || 1) * 100)
          },
          unusedJavaScript: {
            value: audits['unused-javascript']?.details?.overallSavingsBytes || 0,
            displayValue: this.formatBytes(audits['unused-javascript']?.details?.overallSavingsBytes || 0),
            score: Math.round((audits['unused-javascript']?.score || 1) * 100)
          },
          renderBlockingResources: {
            value: audits['render-blocking-resources']?.details?.overallSavingsMs || 0,
            displayValue: `${Math.round((audits['render-blocking-resources']?.details?.overallSavingsMs || 0) / 1000 * 10) / 10}s`,
            score: Math.round((audits['render-blocking-resources']?.score || 1) * 100)
          }
        },
        accessibilityBreakdown: {
          colorContrast: {
            score: Math.round((audits['color-contrast']?.score || 0) * 100),
            passed: audits['color-contrast']?.score === 1,
            impact: audits['color-contrast']?.score < 1 ? 'high' : 'none'
          },
          imageAlt: {
            score: Math.round((audits['image-alt']?.score || 0) * 100),
            passed: audits['image-alt']?.score === 1,
            impact: audits['image-alt']?.score < 1 ? 'medium' : 'none'
          },
          labels: {
            score: Math.round((audits['label']?.score || 0) * 100),
            passed: audits['label']?.score === 1,
            impact: audits['label']?.score < 1 ? 'high' : 'none'
          },
          linkNames: {
            score: Math.round((audits['link-name']?.score || 0) * 100),
            passed: audits['link-name']?.score === 1,
            impact: audits['link-name']?.score < 1 ? 'medium' : 'none'
          },
          headingOrder: {
            score: Math.round((audits['heading-order']?.score || 0) * 100),
            passed: audits['heading-order']?.score === 1,
            impact: audits['heading-order']?.score < 1 ? 'low' : 'none'
          }
        },
        seoAnalysis: {
          hasTitle: {
            passed: audits['document-title']?.score === 1,
            score: Math.round((audits['document-title']?.score || 0) * 100),
            title: audits['document-title']?.explanation || 'Title tag analysis'
          },
          hasMetaDescription: {
            passed: audits['meta-description']?.score === 1,
            score: Math.round((audits['meta-description']?.score || 0) * 100),
            title: 'Meta description optimization'
          },
          isHTTPS: {
            passed: audits['is-on-https']?.score === 1,
            score: Math.round((audits['is-on-https']?.score || 0) * 100),
            title: 'HTTPS implementation'
          },
          hasViewport: {
            passed: audits['viewport']?.score === 1,
            score: Math.round((audits['viewport']?.score || 0) * 100),
            title: 'Mobile viewport configuration'
          },
          isCrawlable: {
            passed: audits['is-crawlable']?.score === 1,
            score: Math.round((audits['is-crawlable']?.score || 0) * 100),
            title: 'Crawlability status'
          },
          hasValidHreflang: {
            passed: audits['hreflang']?.score === 1,
            score: Math.round((audits['hreflang']?.score || 0) * 100),
            title: 'Hreflang implementation'
          }
        },
        opportunities: this.extractOpportunities(audits),
        bestPracticesBreakdown: {
          usesHTTPS: {
            score: Math.round((audits['is-on-https']?.score || 0) * 100),
            passed: audits['is-on-https']?.score === 1
          },
          noVulnerableLibraries: {
            score: Math.round((audits['no-vulnerable-libraries']?.score || 0) * 100),
            passed: audits['no-vulnerable-libraries']?.score === 1
          },
          usesResponsiveImages: {
            score: Math.round((audits['uses-responsive-images']?.score || 0) * 100),
            passed: audits['uses-responsive-images']?.score === 1
          },
          efficientImageFormats: {
            score: Math.round((audits['modern-image-formats']?.score || 0) * 100),
            passed: audits['modern-image-formats']?.score === 1
          }
        },
        scoreComparison: {
          currentScores: {
            performance: Math.round(categories.performance.score * 100),
            accessibility: Math.round(categories.accessibility.score * 100),
            bestPractices: Math.round(categories['best-practices'].score * 100),
            seo: Math.round(categories.seo.score * 100)
          },
          benchmarkScores: null  // Removed hardcoded values - use actual competitor data for comparison
        },
        chartData: {
          categoryDonut: this.generateCategoryDonutData(categories),
          coreVitalsGauge: this.generateCoreVitalsGaugeData(audits),
          performanceTimeline: this.generatePerformanceTimelineData(audits),
          resourceBreakdown: this.generateResourceBreakdownData(audits),
          accessibilityRadar: this.generateAccessibilityRadarData(audits),
          seoProgress: this.generateSEOProgressData(audits),
          opportunitiesBar: this.generateOpportunitiesBarData(audits)
        },
        timestamp: new Date().toISOString(),
        url: url,
        lighthouseVersion: data.lighthouseResult.lighthouseVersion,
        source: 'PageSpeed Insights API'
      };

      console.log(`✅ Lighthouse data fetched via PageSpeed API for ${domain}`);
      console.log(`📊 Category Scores:`, result.categoryScores);
      return result;

    } catch (error) {
      console.error('❌ PageSpeed API fallback failed:', error.message);
      return null;
    }
  },

  async _analyzeSiteInternal(domain) {
    let chrome;
    let url = domain;
    let savedResult = null; // Store result before cleanup

    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    try {
      // Running Lighthouse audit

      const tempDir = os.tmpdir();

      // Get Chrome configuration with production support
      const chromeConfig = await getChromeLauncherConfig();

      // Add user data dir to flags
      chromeConfig.chromeFlags.push(
        `--max-old-space-size=512`,
        `--user-data-dir=${path.join(tempDir, 'lighthouse-chrome-data')}`
      );

      console.log(`🔧 Chrome config:`, chromeConfig.chromePath ? `Using: ${chromeConfig.chromePath}` : 'Using default Chrome');

      chrome = await launch(chromeConfig);

      const options = {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        port: chrome.port,
        chromeFlags: ['--headless=new', '--no-sandbox'],
        // Performance optimizations
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1, // No CPU throttling for faster results
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0
        },
        // Skip some audits to reduce processing time
        skipAudits: [
          'screenshot-thumbnails',
          'final-screenshot',
          'full-page-screenshot',
          'metrics',
          'network-requests',
          'network-rtt',
          'network-server-latency',
          'main-thread-tasks',
          'diagnostics',
          'bootup-time',
          'mainthread-work-breakdown',
          'third-party-summary'
        ]
      };

      let runnerResult;
      try {
        runnerResult = await lighthouse(url, options);
      } catch (lhError) {
        console.error('❌ Lighthouse execution error:', lhError.message);
        // If it's just a performance mark error but we have results, continue
        if (lhError.message && lhError.message.includes('performance mark')) {
          console.log('⚠️ Performance mark error (non-critical), checking for results...');
        } else {
          throw lhError;
        }
      }

      if (!runnerResult || !runnerResult.lhr) {
        throw new Error('Lighthouse audit failed - no results returned');
      }

      const { categories, audits } = runnerResult.lhr;

      // Comprehensive metrics extraction
      const result = {
        // Category Scores (for donut/pie charts)
        categoryScores: {
          performance: Math.round(categories.performance.score * 100),
          accessibility: Math.round(categories.accessibility.score * 100),
          bestPractices: Math.round(categories['best-practices'].score * 100),
          seo: Math.round(categories.seo.score * 100)
        },

        // Core Web Vitals (for gauge charts)
        coreWebVitals: {
          lcp: {
            value: audits['largest-contentful-paint']?.numericValue || null,
            displayValue: audits['largest-contentful-paint']?.displayValue || 'N/A',
            score: Math.round((audits['largest-contentful-paint']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['largest-contentful-paint']?.numericValue, 'lcp'),
            threshold: { good: 2500, needs_improvement: 4000 }
          },
          fid: {
            value: audits['max-potential-fid']?.numericValue || null,
            displayValue: audits['max-potential-fid']?.displayValue || 'N/A',
            score: Math.round((audits['max-potential-fid']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['max-potential-fid']?.numericValue, 'fid'),
            threshold: { good: 100, needs_improvement: 300 }
          },
          cls: {
            value: audits['cumulative-layout-shift']?.numericValue || null,
            displayValue: audits['cumulative-layout-shift']?.displayValue || 'N/A',
            score: Math.round((audits['cumulative-layout-shift']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['cumulative-layout-shift']?.numericValue, 'cls'),
            threshold: { good: 0.1, needs_improvement: 0.25 }
          },
          fcp: {
            value: audits['first-contentful-paint']?.numericValue || null,
            displayValue: audits['first-contentful-paint']?.displayValue || 'N/A',
            score: Math.round((audits['first-contentful-paint']?.score || 0) * 100),
            rating: this.getCoreVitalRating(audits['first-contentful-paint']?.numericValue, 'fcp'),
            threshold: { good: 1800, needs_improvement: 3000 }
          }
        },

        // Performance Metrics Timeline (for line/area charts)
        performanceTimeline: {
          fcp: audits['first-contentful-paint']?.numericValue || null,
          lcp: audits['largest-contentful-paint']?.numericValue || null,
          tti: audits['interactive']?.numericValue || null,
          speedIndex: audits['speed-index']?.numericValue || null,
          tbt: audits['total-blocking-time']?.numericValue || null,
          dcl: audits['server-response-time']?.numericValue || null
        },

        // Resource Analysis (for bar charts)
        resourceMetrics: {
          totalByteWeight: {
            value: audits['total-byte-weight']?.numericValue || 0,
            displayValue: audits['total-byte-weight']?.displayValue || '0 KiB',
            score: Math.round((audits['total-byte-weight']?.score || 0) * 100)
          },
          unusedCss: {
            value: audits['unused-css-rules']?.details?.overallSavingsBytes || 0,
            displayValue: this.formatBytes(audits['unused-css-rules']?.details?.overallSavingsBytes || 0),
            score: Math.round((audits['unused-css-rules']?.score || 1) * 100)
          },
          unusedJavaScript: {
            value: audits['unused-javascript']?.details?.overallSavingsBytes || 0,
            displayValue: this.formatBytes(audits['unused-javascript']?.details?.overallSavingsBytes || 0),
            score: Math.round((audits['unused-javascript']?.score || 1) * 100)
          },
          renderBlockingResources: {
            value: audits['render-blocking-resources']?.details?.overallSavingsMs || 0,
            displayValue: `${Math.round((audits['render-blocking-resources']?.details?.overallSavingsMs || 0) / 1000 * 10) / 10}s`,
            score: Math.round((audits['render-blocking-resources']?.score || 1) * 100)
          }
        },

        // Accessibility Breakdown (for radar chart)
        accessibilityBreakdown: {
          colorContrast: {
            score: Math.round((audits['color-contrast']?.score || 0) * 100),
            passed: audits['color-contrast']?.score === 1,
            impact: audits['color-contrast']?.score < 1 ? 'high' : 'none'
          },
          imageAlt: {
            score: Math.round((audits['image-alt']?.score || 0) * 100),
            passed: audits['image-alt']?.score === 1,
            impact: audits['image-alt']?.score < 1 ? 'medium' : 'none'
          },
          labels: {
            score: Math.round((audits['label']?.score || 0) * 100),
            passed: audits['label']?.score === 1,
            impact: audits['label']?.score < 1 ? 'high' : 'none'
          },
          linkNames: {
            score: Math.round((audits['link-name']?.score || 0) * 100),
            passed: audits['link-name']?.score === 1,
            impact: audits['link-name']?.score < 1 ? 'medium' : 'none'
          },
          headingOrder: {
            score: Math.round((audits['heading-order']?.score || 0) * 100),
            passed: audits['heading-order']?.score === 1,
            impact: audits['heading-order']?.score < 1 ? 'low' : 'none'
          }
        },

        // SEO Analysis (for progress bars)
        seoAnalysis: {
          hasTitle: {
            passed: audits['document-title']?.score === 1,
            score: Math.round((audits['document-title']?.score || 0) * 100),
            title: audits['document-title']?.explanation || 'Title tag analysis'
          },
          hasMetaDescription: {
            passed: audits['meta-description']?.score === 1,
            score: Math.round((audits['meta-description']?.score || 0) * 100),
            title: 'Meta description optimization'
          },
          isHTTPS: {
            passed: audits['is-on-https']?.score === 1,
            score: Math.round((audits['is-on-https']?.score || 0) * 100),
            title: 'HTTPS implementation'
          },
          hasViewport: {
            passed: audits['viewport']?.score === 1,
            score: Math.round((audits['viewport']?.score || 0) * 100),
            title: 'Mobile viewport configuration'
          },
          isCrawlable: {
            passed: audits['is-crawlable']?.score === 1,
            score: Math.round((audits['is-crawlable']?.score || 0) * 100),
            title: 'Crawlability status'
          },
          hasValidHreflang: {
            passed: audits['hreflang']?.score === 1,
            score: Math.round((audits['hreflang']?.score || 0) * 100),
            title: 'Hreflang implementation'
          }
        },

        // Performance Opportunities (for horizontal bar chart)
        opportunities: this.extractOpportunities(audits),

        // Best Practices Breakdown (for stacked bar chart)
        bestPracticesBreakdown: {
          usesHTTPS: {
            score: Math.round((audits['is-on-https']?.score || 0) * 100),
            passed: audits['is-on-https']?.score === 1
          },
          noVulnerableLibraries: {
            score: Math.round((audits['no-vulnerable-libraries']?.score || 0) * 100),
            passed: audits['no-vulnerable-libraries']?.score === 1
          },
          usesResponsiveImages: {
            score: Math.round((audits['uses-responsive-images']?.score || 0) * 100),
            passed: audits['uses-responsive-images']?.score === 1
          },
          efficientImageFormats: {
            score: Math.round((audits['modern-image-formats']?.score || 0) * 100),
            passed: audits['modern-image-formats']?.score === 1
          }
        },

        // Score History Data (for trend line charts)
        scoreComparison: {
          currentScores: {
            performance: Math.round(categories.performance.score * 100),
            accessibility: Math.round(categories.accessibility.score * 100),
            bestPractices: Math.round(categories['best-practices'].score * 100),
            seo: Math.round(categories.seo.score * 100)
          },
          benchmarkScores: null  // Removed hardcoded values - use actual competitor data for comparison
        },

        // Chart Configuration Data
        chartData: {
          categoryDonut: this.generateCategoryDonutData(categories),
          coreVitalsGauge: this.generateCoreVitalsGaugeData(audits),
          performanceTimeline: this.generatePerformanceTimelineData(audits),
          resourceBreakdown: this.generateResourceBreakdownData(audits),
          accessibilityRadar: this.generateAccessibilityRadarData(audits),
          seoProgress: this.generateSEOProgressData(audits),
          opportunitiesBar: this.generateOpportunitiesBarData(audits)
        },

        // Metadata
        timestamp: new Date().toISOString(),
        url: url,
        lighthouseVersion: runnerResult.lhr.lighthouseVersion
      };

      console.log(`✅ Comprehensive Lighthouse audit completed for ${domain}`);
      console.log(`📊 Category Scores:`, result.categoryScores);
      savedResult = result; // Save result before cleanup
      console.log('💾 Result saved to savedResult variable');
      return result;

    } catch (error) {
      console.error('❌ Lighthouse audit failed:', error.message);
      console.error('📍 Error occurred at:', new Date().toISOString());
      console.log('🔍 Checking savedResult:', savedResult ? 'EXISTS' : 'NULL');
      // If we have saved results despite the error, return them
      if (savedResult) {
        console.log('⚠️ Returning saved results despite error');
        console.log('📊 Saved scores:', savedResult.categoryScores);
        return savedResult;
      }
      console.log('❌ No saved results available, returning null');
      return null;

    } finally {
      if (chrome) {
        try {
          await chrome.kill();
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            console.log('🗑️ Garbage collection triggered');
          }
        } catch (killError) {
          // Silently ignore permission errors on Windows - Chrome will clean up eventually
          if (killError.code !== 'EPERM') {
            console.warn('⚠️ Error killing Chrome:', killError.message);
          }
        }
      }
    }
  },

  // Get queue status
  getQueueStatus() {
    return {
      queueLength: analysisQueue.length,
      isProcessing
    };
  },

  // Core Web Vitals rating system
  getCoreVitalRating(value, metric) {
    if (value === null) return 'unknown';

    const thresholds = {
      lcp: { good: 2500, needsImprovement: 4000 },
      fid: { good: 100, needsImprovement: 300 },
      cls: { good: 0.1, needsImprovement: 0.25 },
      fcp: { good: 1800, needsImprovement: 3000 }
    };

    const threshold = thresholds[metric];
    if (!threshold) return 'unknown';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  },

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  // Extract performance opportunities
  extractOpportunities(audits) {
    const opportunityAudits = [
      'unused-css-rules',
      'unused-javascript',
      'modern-image-formats',
      'efficiently-encode-images',
      'offscreen-images',
      'render-blocking-resources',
      'unminified-css',
      'unminified-javascript',
      'uses-text-compression',
      'uses-responsive-images'
    ];

    return opportunityAudits
      .map(auditId => {
        const audit = audits[auditId];
        if (audit && audit.details && audit.details.overallSavingsMs > 100) {
          return {
            audit: auditId,
            title: audit.title,
            description: audit.description,
            savings: audit.details.overallSavingsMs,
            savingsBytes: audit.details.overallSavingsBytes || 0,
            impact: this.categorizeImpact(audit.details.overallSavingsMs),
            score: Math.round((audit.score || 0) * 100)
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.savings - a.savings)
      .slice(0, 10); // Top 10 opportunities
  },

  categorizeImpact(savingsMs) {
    if (savingsMs > 1500) return 'high';
    if (savingsMs > 750) return 'medium';
    return 'low';
  },

  // Generate chart data for Category Donut Chart
  generateCategoryDonutData(categories) {
    return {
      labels: ['Performance', 'Accessibility', 'Best Practices', 'SEO'],
      datasets: [{
        data: [
          Math.round(categories.performance.score * 100),
          Math.round(categories.accessibility.score * 100),
          Math.round(categories['best-practices'].score * 100),
          Math.round(categories.seo.score * 100)
        ],
        backgroundColor: [
          '#FF6B6B', // Performance - Red/Orange
          '#4ECDC4', // Accessibility - Teal
          '#45B7D1', // Best Practices - Blue
          '#96CEB4'  // SEO - Green
        ],
        borderWidth: 0,
        cutout: '70%'
      }]
    };
  },

  // Generate Core Web Vitals Gauge Data
  generateCoreVitalsGaugeData(audits) {
    return {
      lcp: {
        value: audits['largest-contentful-paint']?.numericValue || 0,
        max: 4000,
        thresholds: [2500, 4000],
        colors: ['#0CCE6B', '#FFA400', '#FF4E42']
      },
      fid: {
        value: audits['max-potential-fid']?.numericValue || 0,
        max: 300,
        thresholds: [100, 300],
        colors: ['#0CCE6B', '#FFA400', '#FF4E42']
      },
      cls: {
        value: (audits['cumulative-layout-shift']?.numericValue || 0) * 100,
        max: 25,
        thresholds: [10, 25],
        colors: ['#0CCE6B', '#FFA400', '#FF4E42']
      }
    };
  },

  // Generate Performance Timeline Data
  generatePerformanceTimelineData(audits) {
    return {
      labels: ['FCP', 'LCP', 'TTI', 'Speed Index', 'TBT'],
      datasets: [{
        label: 'Performance Metrics (ms)',
        data: [
          audits['first-contentful-paint']?.numericValue || 0,
          audits['largest-contentful-paint']?.numericValue || 0,
          audits['interactive']?.numericValue || 0,
          audits['speed-index']?.numericValue || 0,
          audits['total-blocking-time']?.numericValue || 0
        ],
        fill: true,
        backgroundColor: 'rgba(255, 107, 107, 0.2)',
        borderColor: '#FF6B6B',
        borderWidth: 2,
        pointBackgroundColor: '#FF6B6B',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6
      }]
    };
  },

  // Generate Resource Breakdown Data
  generateResourceBreakdownData(audits) {
    return {
      labels: ['Total Size', 'Unused CSS', 'Unused JS', 'Images'],
      datasets: [{
        label: 'Resource Size (KB)',
        data: [
          Math.round((audits['total-byte-weight']?.numericValue || 0) / 1024),
          Math.round((audits['unused-css-rules']?.details?.overallSavingsBytes || 0) / 1024),
          Math.round((audits['unused-javascript']?.details?.overallSavingsBytes || 0) / 1024),
          Math.round((audits['unoptimized-images']?.details?.overallSavingsBytes || 0) / 1024)
        ],
        backgroundColor: [
          '#FF6B6B',
          '#4ECDC4',
          '#45B7D1',
          '#96CEB4'
        ],
        borderWidth: 1
      }]
    };
  },

  // Generate Accessibility Radar Data
  generateAccessibilityRadarData(audits) {
    return {
      labels: ['Color Contrast', 'Image Alt', 'Form Labels', 'Link Names', 'Heading Order'],
      datasets: [{
        label: 'Accessibility Score',
        data: [
          Math.round((audits['color-contrast']?.score || 0) * 100),
          Math.round((audits['image-alt']?.score || 0) * 100),
          Math.round((audits['label']?.score || 0) * 100),
          Math.round((audits['link-name']?.score || 0) * 100),
          Math.round((audits['heading-order']?.score || 0) * 100)
        ],
        fill: true,
        backgroundColor: 'rgba(78, 205, 196, 0.2)',
        borderColor: '#4ECDC4',
        borderWidth: 2,
        pointBackgroundColor: '#4ECDC4',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6
      }]
    };
  },

  // Generate SEO Progress Data
  generateSEOProgressData(audits) {
    return [
      {
        label: 'Title Tag',
        score: Math.round((audits['document-title']?.score || 0) * 100),
        color: '#96CEB4'
      },
      {
        label: 'Meta Description',
        score: Math.round((audits['meta-description']?.score || 0) * 100),
        color: '#96CEB4'
      },
      {
        label: 'HTTPS',
        score: Math.round((audits['is-on-https']?.score || 0) * 100),
        color: '#96CEB4'
      },
      {
        label: 'Mobile Viewport',
        score: Math.round((audits['viewport']?.score || 0) * 100),
        color: '#96CEB4'
      },
      {
        label: 'Crawlable',
        score: Math.round((audits['is-crawlable']?.score || 0) * 100),
        color: '#96CEB4'
      }
    ];
  },

  // Generate Opportunities Bar Data
  generateOpportunitiesBarData(audits) {
    const opportunities = this.extractOpportunities(audits);

    return {
      labels: opportunities.slice(0, 5).map(opp => opp.title.substring(0, 20) + '...'),
      datasets: [{
        label: 'Potential Savings (ms)',
        data: opportunities.slice(0, 5).map(opp => opp.savings),
        backgroundColor: opportunities.slice(0, 5).map(opp => {
          switch (opp.impact) {
            case 'high': return '#FF4E42';
            case 'medium': return '#FFA400';
            case 'low': return '#0CCE6B';
            default: return '#45B7D1';
          }
        }),
        borderWidth: 1
      }]
    };
  }
};

export default lighthouseService;