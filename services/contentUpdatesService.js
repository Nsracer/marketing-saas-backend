// services/contentUpdatesService.js - Track content updates via RSS feeds and sitemaps
import axios from 'axios';
import { JSDOM } from 'jsdom';

class ContentUpdatesService {
  constructor() {
    this.rssFeedPaths = [
      '/feed',
      '/rss',
      '/feed.xml',
      '/rss.xml',
      '/atom.xml',
      '/blog/feed',
      '/blog/rss',
      '/feeds/posts/default'
    ];
    
    this.sitemapPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap-index.xml',
      '/sitemap1.xml'
    ];
  }

  /**
   * Get content update activity for a domain
   * Checks RSS feeds and sitemaps for recent updates
   * @param {string} domain - The domain to analyze
   * @returns {Object} Content update data
   */
  async getContentUpdates(domain) {
    const cleanDomain = this.cleanDomain(domain);
    const baseUrl = `https://${cleanDomain}`;

    console.log(`📝 Analyzing content updates for: ${cleanDomain}`);

    const result = {
      domain: cleanDomain,
      timestamp: new Date().toISOString(),
      rss: {
        found: false,
        url: null,
        recentPosts: [],
        totalPosts: 0,
        lastUpdated: null
      },
      sitemap: {
        found: false,
        url: null,
        totalUrls: 0,
        recentlyModified: [],
        lastModified: null
      },
      contentActivity: {
        updateFrequency: 'unknown',
        lastContentDate: null,
        averagePostsPerMonth: 0,
        isActive: false
      }
    };

        try {
      // Try to find and parse RSS feed
      const rssData = await this.findAndParseRSS(baseUrl);
      if (rssData.found) {
        result.rss = rssData;
      }

      // Try to find and parse sitemap (independent of RSS)
      const sitemapData = await this.findAndParseSitemap(baseUrl);
      if (sitemapData.found) {
        result.sitemap = sitemapData;
      }

      // Analyze content activity from both sources
      result.contentActivity = this.analyzeContentActivity(result.rss, result.sitemap);
      
      console.log(`✅ Content updates analysis complete for ${cleanDomain}`);
      return result;
    } catch (error) {
      console.error(`❌ Error analyzing content updates for ${cleanDomain}:`, error.message);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Find and parse RSS feed
   */
  async findAndParseRSS(baseUrl) {
    const rssResult = {
      found: false,
      url: null,
      recentPosts: [],
      totalPosts: 0,
      lastUpdated: null,
      format: null
    };

    // Try to find RSS feed from HTML first
    try {
      const htmlResponse = await axios.get(baseUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentAnalyzer/1.0)' },
        httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false })
      });

      const dom = new JSDOM(htmlResponse.data);
      const doc = dom.window.document;

      // Check for RSS/Atom links in HTML head
      const rssLink = doc.querySelector('link[type="application/rss+xml"]') ||
                     doc.querySelector('link[type="application/atom+xml"]');
      
      if (rssLink && rssLink.href) {
        const feedUrl = new URL(rssLink.href, baseUrl).toString();
        const feedData = await this.parseRSSFeed(feedUrl);
        if (feedData.found) {
          return feedData;
        }
      }
    } catch (error) {
      console.log('Could not detect RSS from HTML, trying common paths...');
    }

    // Try common RSS feed paths
    for (const path of this.rssFeedPaths) {
      try {
        const feedUrl = `${baseUrl}${path}`;
        const feedData = await this.parseRSSFeed(feedUrl);
        
        if (feedData.found) {
          return feedData;
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    return rssResult;
  }

  /**
   * Parse RSS/Atom feed
   */
  async parseRSSFeed(feedUrl) {
    const result = {
      found: false,
      url: feedUrl,
      recentPosts: [],
      totalPosts: 0,
      lastUpdated: null,
      format: null
    };

    try {
      console.log(`  Trying RSS feed: ${feedUrl}`);
      
      const https = await import('https');
      const response = await axios.get(feedUrl, {
        timeout: 10000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; ContentAnalyzer/1.0)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const dom = new JSDOM(response.data, { contentType: 'text/xml' });
      const doc = dom.window.document;

      // Check if it's RSS or Atom
      const isRSS = doc.querySelector('rss') || doc.querySelector('channel');
      const isAtom = doc.querySelector('feed');

      if (!isRSS && !isAtom) {
        return result;
      }

      result.found = true;
      result.format = isRSS ? 'RSS' : 'Atom';

      // Parse items
      let items = [];
      if (isRSS) {
        items = Array.from(doc.querySelectorAll('item'));
      } else if (isAtom) {
        items = Array.from(doc.querySelectorAll('entry'));
      }

      result.totalPosts = items.length;

      // Extract recent posts (last 10)
      items.slice(0, 10).forEach(item => {
        try {
          const post = {
            title: this.getTextContent(item, isRSS ? 'title' : 'title'),
            link: this.getTextContent(item, isRSS ? 'link' : 'link'),
            pubDate: this.getTextContent(item, isRSS ? 'pubDate' : 'published') || 
                     this.getTextContent(item, 'updated'),
            description: this.getTextContent(item, isRSS ? 'description' : 'summary'),
            author: this.getTextContent(item, isRSS ? 'author' : 'author > name')
          };

          // Parse date
          if (post.pubDate) {
            post.parsedDate = new Date(post.pubDate);
            post.daysAgo = Math.floor((Date.now() - post.parsedDate) / (1000 * 60 * 60 * 24));
          }

          result.recentPosts.push(post);
        } catch (err) {
          console.error('Error parsing feed item:', err);
        }
      });

      // Get last updated date
      if (result.recentPosts.length > 0 && result.recentPosts[0].parsedDate) {
        result.lastUpdated = result.recentPosts[0].parsedDate.toISOString();
      }

      console.log(`  ✅ Found ${result.format} feed with ${result.totalPosts} posts`);
      return result;
    } catch (error) {
      console.log(`  ❌ Failed to parse RSS feed: ${error.message}`);
      return result;
    }
  }

  /**
   * Find and parse sitemap
   */
  async findAndParseSitemap(baseUrl) {
    const sitemapResult = {
      found: false,
      url: null,
      totalUrls: 0,
      recentlyModified: [],
      lastModified: null
    };

    // Try robots.txt first
        // Try robots.txt first
    try {
      const https = await import('https');
      const robotsUrl = `${baseUrl}/robots.txt`;
      const robotsResponse = await axios.get(robotsUrl, {
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      // Find ALL sitemaps in robots.txt (not just the first one)
      const sitemapMatches = robotsResponse.data.match(/Sitemap:\s*(.+)/gi);
      if (sitemapMatches && sitemapMatches.length > 0) {
        // Try each sitemap URL found
        for (const match of sitemapMatches) {
          const sitemapUrl = match.replace(/Sitemap:\s*/i, '').trim();
          const sitemapData = await this.parseSitemap(sitemapUrl);
          if (sitemapData.found) {
            return sitemapData;
          }
        }
      }
    } catch (error) {
      console.log('Could not find sitemap in robots.txt, trying common paths...');
    }


    // Try common sitemap paths
    for (const path of this.sitemapPaths) {
      try {
        const sitemapUrl = `${baseUrl}${path}`;
        const sitemapData = await this.parseSitemap(sitemapUrl);
        
        if (sitemapData.found) {
          return sitemapData;
        }
      } catch (error) {
        continue;
      }
    }

    return sitemapResult;
  }

  /**
   * Parse sitemap XML
   */
  async parseSitemap(sitemapUrl) {
    const result = {
      found: false,
      url: sitemapUrl,
      totalUrls: 0,
      recentlyModified: [],
      lastModified: null
    };

    try {
      console.log(`  Trying sitemap: ${sitemapUrl}`);
      
      const https = await import('https');
      const response = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; ContentAnalyzer/1.0)',
          'Accept': 'application/xml, text/xml'
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const dom = new JSDOM(response.data, { contentType: 'text/xml' });
      const doc = dom.window.document;

      // Check if it's a sitemap index

      const sitemapIndex = doc.querySelector('sitemapindex');
      if (sitemapIndex) {
        // Parse sitemap index
        const sitemaps = Array.from(doc.querySelectorAll('sitemap'));
        console.log(`  Found sitemap index with ${sitemaps.length} sitemaps`);

        // Parse ALL sitemaps from index and aggregate results
        const allUrls = [];
        for (const sitemapElement of sitemaps) {
          const sitemapLoc = sitemapElement.querySelector('loc');
          if (sitemapLoc) {
            try {
              const subSitemapData = await this.parseSitemap(sitemapLoc.textContent);
              if (subSitemapData.found && subSitemapData.totalUrls > 0) {
                // Add URLs from this sitemap to aggregated results
                const urlElements = await this.fetchSitemapUrls(sitemapLoc.textContent);
                allUrls.push(...urlElements);
              }
            } catch (err) {
              console.log(`  Failed to parse sitemap: ${sitemapLoc.textContent}`);
            }
          }
        }

        // If we collected URLs from multiple sitemaps, aggregate them
        if (allUrls.length > 0) {
          result.found = true;
          result.totalUrls = allUrls.length;
          
          // Sort by lastmod and get recent ones
          const sortedUrls = allUrls
            .filter(url => url.lastmod)
            .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));
          
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          result.recentlyModified = sortedUrls
            .filter(url => new Date(url.lastmod) >= thirtyDaysAgo)
            .slice(0, 20);
          
          if (sortedUrls.length > 0) {
            result.lastModified = sortedUrls[0].lastmod;
          }
          
          return result;
        }
        return result;
      }


      // Parse regular sitemap
      const urlElements = Array.from(doc.querySelectorAll('url'));
      
      if (urlElements.length === 0) {
        return result;
      }

      result.found = true;
      result.totalUrls = urlElements.length;

      // Extract URLs with lastmod dates
      const urls = [];
      urlElements.forEach(urlElement => {
        try {
          const loc = urlElement.querySelector('loc')?.textContent;
          const lastmod = urlElement.querySelector('lastmod')?.textContent;
          const changefreq = urlElement.querySelector('changefreq')?.textContent;
          const priority = urlElement.querySelector('priority')?.textContent;

          if (loc) {
            const urlData = {
              loc,
              lastmod,
              changefreq,
              priority
            };

            if (lastmod) {
              urlData.parsedDate = new Date(lastmod);
              urlData.daysAgo = Math.floor((Date.now() - urlData.parsedDate) / (1000 * 60 * 60 * 24));
            }

            urls.push(urlData);
          }
        } catch (err) {
          console.error('Error parsing URL element:', err);
        }
      });

      // Sort by last modified date (most recent first)
      urls.sort((a, b) => {
        if (!a.parsedDate) return 1;
        if (!b.parsedDate) return -1;
        return b.parsedDate - a.parsedDate;
      });

      // Get recently modified URLs (last 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      result.recentlyModified = urls
        .filter(url => url.parsedDate && url.parsedDate >= thirtyDaysAgo)
        .slice(0, 20); // Limit to 20 most recent

      if (urls.length > 0 && urls[0].parsedDate) {
        result.lastModified = urls[0].parsedDate.toISOString();
      }

      console.log(`  ✅ Found sitemap with ${result.totalUrls} URLs, ${result.recentlyModified.length} recently modified`);
      return result;
    } catch (error) {
      console.log(`  ❌ Failed to parse sitemap: ${error.message}`);
      return result;
    }
  }

  /**
   * Analyze content activity based on RSS and sitemap data
   */
  analyzeContentActivity(rssData, sitemapData) {
    const activity = {
      updateFrequency: 'unknown',
      lastContentDate: null,
      averagePostsPerMonth: 0,
      isActive: false,
      recentActivityCount: 0,
      contentVelocity: 'low'
    };

    try {
      // Determine last content date
      const dates = [];
      
      if (rssData.found && rssData.lastUpdated) {
        dates.push(new Date(rssData.lastUpdated));
      }
      
      if (sitemapData.found && sitemapData.lastModified) {
        dates.push(new Date(sitemapData.lastModified));
      }

      if (dates.length > 0) {
        const mostRecentDate = new Date(Math.max(...dates));
        activity.lastContentDate = mostRecentDate.toISOString();
        
        const daysSinceUpdate = Math.floor((Date.now() - mostRecentDate) / (1000 * 60 * 60 * 24));
        
        // Determine if site is actively updated
        activity.isActive = daysSinceUpdate <= 30;
        
        // Determine update frequency
        if (daysSinceUpdate <= 7) {
          activity.updateFrequency = 'weekly';
        } else if (daysSinceUpdate <= 30) {
          activity.updateFrequency = 'monthly';
        } else if (daysSinceUpdate <= 90) {
          activity.updateFrequency = 'quarterly';
        } else {
          activity.updateFrequency = 'inactive';
        }
      }

      // Calculate average posts per month from RSS
      if (rssData.found && rssData.recentPosts.length > 0) {
        const posts = rssData.recentPosts.filter(post => post.parsedDate);
        if (posts.length >= 2) {
          const oldestPost = posts[posts.length - 1];
          const newestPost = posts[0];
          const daysDiff = (newestPost.parsedDate - oldestPost.parsedDate) / (1000 * 60 * 60 * 24);
          
          if (daysDiff > 0) {
            activity.averagePostsPerMonth = Math.round((posts.length / daysDiff) * 30);
          }
        }
      }

      // Count recent activity (last 30 days)
      if (rssData.found) {
        activity.recentActivityCount += rssData.recentPosts.filter(
          post => post.daysAgo <= 30
        ).length;
      }
      
      if (sitemapData.found) {
        activity.recentActivityCount += sitemapData.recentlyModified.length;
      }

      // Determine content velocity
      if (activity.averagePostsPerMonth >= 10) {
        activity.contentVelocity = 'high';
      } else if (activity.averagePostsPerMonth >= 4) {
        activity.contentVelocity = 'medium';
      } else if (activity.averagePostsPerMonth >= 1) {
        activity.contentVelocity = 'low';
      } else {
        activity.contentVelocity = 'minimal';
      }

      return activity;
    } catch (error) {
      console.error('Error analyzing content activity:', error);
      return activity;
    }
  }

  /**
   * Compare content update activity between two sites
   */
  async compareContentUpdates(userDomain, competitorDomain) {
    console.log(`\n🔄 Comparing content updates: ${userDomain} vs ${competitorDomain}`);
    
    const [userData, competitorData] = await Promise.all([
      this.getContentUpdates(userDomain),
      this.getContentUpdates(competitorDomain)
    ]);

    const comparison = {
      userSite: userData,
      competitorSite: competitorData,
      insights: {
        moreActive: null,
        contentGap: null,
        recommendation: null,
        recommendations: [],
        seoImpact: null,
        contentStrategy: null
      }
    };

    // Generate insights
    const userActivity = userData.contentActivity;
    const compActivity = competitorData.contentActivity;

    // Determine who is more active
    if (userActivity.recentActivityCount > compActivity.recentActivityCount) {
      comparison.insights.moreActive = 'user';
    } else if (compActivity.recentActivityCount > userActivity.recentActivityCount) {
      comparison.insights.moreActive = 'competitor';
    } else {
      comparison.insights.moreActive = 'equal';
    }

    // Calculate content gap
    comparison.insights.contentGap = {
      postsPerMonthDiff: compActivity.averagePostsPerMonth - userActivity.averagePostsPerMonth,
      recentActivityDiff: compActivity.recentActivityCount - userActivity.recentActivityCount,
      velocityGap: `${compActivity.contentVelocity} vs ${userActivity.contentVelocity}`,
      frequencyGap: `${compActivity.updateFrequency} vs ${userActivity.updateFrequency}`
    };

    // Generate comprehensive recommendations
    const recommendations = [];
    
    // Content Frequency Recommendations
    if (comparison.insights.moreActive === 'competitor') {
      recommendations.push({
        priority: 'high',
        category: 'Publishing Frequency',
        issue: `Competitor publishes ${compActivity.averagePostsPerMonth} posts/month vs your ${userActivity.averagePostsPerMonth}`,
        action: `Increase content output to at least ${Math.ceil(compActivity.averagePostsPerMonth * 0.8)} posts/month`,
        impact: 'Higher publishing frequency improves SEO rankings and organic traffic'
      });
    }

    // RSS Feed Recommendations
    if (!userData.rss.found && competitorData.rss.found) {
      recommendations.push({
        priority: 'medium',
        category: 'RSS Feed',
        issue: 'Your site is missing an RSS feed while competitor has one',
        action: 'Add an RSS feed to enable content syndication and improve discoverability',
        impact: 'RSS feeds help with content distribution and can improve backlink opportunities'
      });
    }

    // Sitemap Recommendations
    if (!userData.sitemap.found && competitorData.sitemap.found) {
      recommendations.push({
        priority: 'high',
        category: 'XML Sitemap',
        issue: 'Your site is missing an XML sitemap',
        action: 'Create and submit an XML sitemap to search engines',
        impact: 'Sitemaps help search engines discover and index your content more efficiently'
      });
    }

    // Content Freshness Recommendations
    if (userActivity.updateFrequency === 'inactive' && compActivity.updateFrequency !== 'inactive') {
      recommendations.push({
        priority: 'critical',
        category: 'Content Freshness',
        issue: `Your content hasn't been updated recently (${userActivity.updateFrequency})`,
        action: 'Establish a regular publishing schedule and update existing content',
        impact: 'Fresh content signals to search engines that your site is actively maintained'
      });
    }

    // Content Velocity Recommendations
    if (userActivity.contentVelocity === 'minimal' && compActivity.contentVelocity !== 'minimal') {
      recommendations.push({
        priority: 'high',
        category: 'Content Velocity',
        issue: `Low content output (${userActivity.contentVelocity}) compared to competitor (${compActivity.contentVelocity})`,
        action: 'Develop a content calendar and increase publishing pace',
        impact: 'Consistent content velocity helps build authority and improves search visibility'
      });
    }

    comparison.insights.recommendations = recommendations;

    // SEO Impact Assessment
    comparison.insights.seoImpact = this.assessSEOImpact(userData, competitorData);

    // Content Strategy Suggestion
    comparison.insights.contentStrategy = this.generateContentStrategy(userData, competitorData);

    // Generate main recommendation
    if (comparison.insights.moreActive === 'competitor') {
      comparison.insights.recommendation = `Your competitor is more active with ${compActivity.recentActivityCount} recent updates vs your ${userActivity.recentActivityCount}. Consider increasing your content publishing frequency to ${compActivity.averagePostsPerMonth} posts per month.`;
    } else if (comparison.insights.moreActive === 'user') {
      comparison.insights.recommendation = `You're publishing more consistently than your competitor. Maintain this momentum!`;
    } else {
      comparison.insights.recommendation = `Both sites have similar content update frequency. Focus on quality and engagement metrics.`;
    }

    return comparison;
  }

  /**
   * Assess SEO impact of content activity
   */
  assessSEOImpact(userData, competitorData) {
    const userActivity = userData.contentActivity;
    const compActivity = competitorData.contentActivity;
    
    const impact = {
      score: 0,
      level: 'low',
      factors: []
    };

    // Factor 1: Content Freshness (30 points)
    if (userActivity.isActive) {
      impact.score += 30;
      impact.factors.push('✅ Content is actively updated');
    } else {
      impact.factors.push('❌ Content is not regularly updated');
    }

    // Factor 2: Publishing Frequency (25 points)
    if (userActivity.averagePostsPerMonth >= compActivity.averagePostsPerMonth) {
      impact.score += 25;
      impact.factors.push('✅ Publishing frequency matches or exceeds competitor');
    } else {
      impact.factors.push(`❌ Publishing ${userActivity.averagePostsPerMonth} vs competitor's ${compActivity.averagePostsPerMonth} posts/month`);
    }

    // Factor 3: RSS Feed Presence (15 points)
    if (userData.rss.found) {
      impact.score += 15;
      impact.factors.push('✅ RSS feed available for syndication');
    } else {
      impact.factors.push('❌ No RSS feed found');
    }

    // Factor 4: Sitemap Presence (20 points)
    if (userData.sitemap.found) {
      impact.score += 20;
      impact.factors.push(`✅ XML sitemap with ${userData.sitemap.totalUrls} URLs`);
    } else {
      impact.factors.push('❌ No XML sitemap found');
    }

    // Factor 5: Recent Activity (10 points)
    if (userActivity.recentActivityCount >= compActivity.recentActivityCount) {
      impact.score += 10;
      impact.factors.push('✅ Recent activity matches or exceeds competitor');
    } else {
      impact.factors.push('❌ Lower recent activity than competitor');
    }

    // Determine impact level
    if (impact.score >= 80) {
      impact.level = 'excellent';
    } else if (impact.score >= 60) {
      impact.level = 'good';
    } else if (impact.score >= 40) {
      impact.level = 'moderate';
    } else {
      impact.level = 'poor';
    }

    return impact;
  }

  /**
   * Generate content strategy recommendations
   */
  generateContentStrategy(userData, competitorData) {
    const userActivity = userData.contentActivity;
    const compActivity = competitorData.contentActivity;
    
    const strategy = {
      quickWins: [],
      longTermGoals: [],
      competitiveAdvantages: [],
      priorities: []
    };

    // Quick Wins
    if (!userData.rss.found) {
      strategy.quickWins.push('Add RSS feed for content syndication');
    }
    if (!userData.sitemap.found) {
      strategy.quickWins.push('Create and submit XML sitemap');
    }
    if (userActivity.recentActivityCount === 0) {
      strategy.quickWins.push('Publish new content to signal activity');
    }

    // Long-Term Goals
    if (userActivity.averagePostsPerMonth < compActivity.averagePostsPerMonth) {
      strategy.longTermGoals.push(`Scale to ${compActivity.averagePostsPerMonth}+ posts/month`);
    }
    if (userActivity.contentVelocity !== 'high') {
      strategy.longTermGoals.push('Build high-velocity content production system');
    }
    strategy.longTermGoals.push('Establish consistent weekly publishing schedule');

    // Competitive Advantages
    if (userActivity.averagePostsPerMonth > compActivity.averagePostsPerMonth) {
      strategy.competitiveAdvantages.push('Higher publishing frequency');
    }
    if (userActivity.isActive && !compActivity.isActive) {
      strategy.competitiveAdvantages.push('More active content updates');
    }
    if (userData.sitemap.totalUrls > competitorData.sitemap.totalUrls) {
      strategy.competitiveAdvantages.push(`Larger content library (${userData.sitemap.totalUrls} vs ${competitorData.sitemap.totalUrls} pages)`);
    }

    // Priorities
    if (!userActivity.isActive) {
      strategy.priorities.push({ priority: 1, task: 'Resume regular content publishing' });
    }
    if (userActivity.averagePostsPerMonth < compActivity.averagePostsPerMonth) {
      strategy.priorities.push({ priority: 2, task: 'Increase content output pace' });
    }
    if (!userData.rss.found || !userData.sitemap.found) {
      strategy.priorities.push({ priority: 3, task: 'Add missing technical infrastructure (RSS/Sitemap)' });
    }

    return strategy;
  }

  /**
   * Helper: Get text content from XML element
   */
  getTextContent(element, selector) {
    try {
      if (selector.includes('>')) {
        // Handle nested selectors like 'author > name'
        const parts = selector.split('>').map(s => s.trim());
        let current = element;
        for (const part of parts) {
          current = current.querySelector(part);
          if (!current) return null;
        }
        return current.textContent?.trim() || null;
      } else {
        const el = element.querySelector(selector);
        return el?.textContent?.trim() || el?.getAttribute('href') || null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Clean domain
   */
  cleanDomain(domain) {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('/')[0];
  }
}

export default new ContentUpdatesService();
