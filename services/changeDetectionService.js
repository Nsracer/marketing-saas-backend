// services/changeDetectionService.js - ChangeDetection.io integration for competitor monitoring
import axios from 'axios';

class ChangeDetectionService {
  constructor() {
    this.baseUrl = process.env.CHANGEDETECTION_URL || 'https://changedetection-competitor.onrender.com';
    // Use the correct API key from environment
    this.apiKey = process.env.CHANGEDETECTION_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️ CHANGEDETECTION_API_KEY not set in environment variables');
      this.apiKey = '924096c496fa46bd89441385456202cf'; // Fallback
    }
    
    this.headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json'
    };
    
    console.log('🔧 ChangeDetection initialized with API key:', this.apiKey.substring(0, 8) + '...');
  }

  /**
   * Add a new watch for a URL
   * @param {string} url - The URL to monitor
   * @param {Object} options - Watch configuration
   * @returns {Object} Watch data with UUID
   */
  async addWatch(url, options = {}) {
    const {
      tag = 'competitor',
      title = null,
      triggerText = ['price', 'pricing', 'new', 'feature', 'launch', 'update', 'release'],
      fetchBackend = 'html_requests',
      checkInterval = null
    } = options;

    console.log(`📝 Adding ChangeDetection watch for: ${url}`);

    try {
      const payload = {
        url,
        tag,
        fetch_backend: fetchBackend,
        trigger_text: triggerText,
      };

      if (title) payload.title = title;
      if (checkInterval) payload.time_between_check = checkInterval;

      const response = await axios.post(
        `${this.baseUrl}/api/v1/watch`,
        payload,
        { headers: this.headers, timeout: 15000 }
      );

      console.log(`✅ Watch added successfully. UUID: ${response.data.uuid}`);
      return {
        success: true,
        uuid: response.data.uuid,
        url,
        message: 'Watch added successfully'
      };
    } catch (error) {
      console.error(`❌ Error adding watch for ${url}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        message: 'Failed to add watch'
      };
    }
  }

  /**
   * Get all watches
   * @returns {Object} All watches indexed by UUID
   */
  async listAllWatches() {
    console.log('📋 Fetching all watches...');

    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/watch`,
        { headers: this.headers, timeout: 15000 }
      );

      console.log(`✅ Found ${Object.keys(response.data).length} watches`);
      return {
        success: true,
        watches: response.data,
        count: Object.keys(response.data).length
      };
    } catch (error) {
      console.error('❌ Error listing watches:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        watches: {}
      };
    }
  }

  /**
   * Get detailed information about a specific watch
   * @param {string} uuid - Watch UUID
   * @returns {Object} Watch details
   */
  async getWatchDetails(uuid) {
    console.log(`🔍 Fetching details for watch: ${uuid}`);

    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/watch/${uuid}`,
        { headers: this.headers, timeout: 15000 }
      );

      return {
        success: true,
        watch: response.data
      };
    } catch (error) {
      console.error(`❌ Error getting watch ${uuid}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get change history for a watch
   * @param {string} uuid - Watch UUID
   * @returns {Object} Change history snapshots
   */
  async getWatchHistory(uuid) {
    console.log(`📜 Fetching history for watch: ${uuid}`);

    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/watch/${uuid}/history`,
        { headers: this.headers, timeout: 15000 }
      );

      return {
        success: true,
        history: response.data || [],
        count: response.data?.length || 0
      };
    } catch (error) {
      console.error(`❌ Error getting history for ${uuid}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        history: []
      };
    }
  }

  /**
   * Update an existing watch
   * @param {string} uuid - Watch UUID
   * @param {Object} updates - Properties to update
   * @returns {Object} Update result
   */
  async updateWatch(uuid, updates) {
    console.log(`✏️ Updating watch: ${uuid}`);

    try {
      const response = await axios.put(
        `${this.baseUrl}/api/v1/watch/${uuid}`,
        updates,
        { headers: this.headers, timeout: 15000 }
      );

      return {
        success: true,
        message: 'Watch updated successfully'
      };
    } catch (error) {
      console.error(`❌ Error updating watch ${uuid}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Delete a watch
   * @param {string} uuid - Watch UUID
   * @returns {Object} Delete result
   */
  async deleteWatch(uuid) {
    console.log(`🗑️ Deleting watch: ${uuid}`);

    try {
      await axios.delete(
        `${this.baseUrl}/api/v1/watch/${uuid}`,
        { headers: this.headers, timeout: 15000 }
      );

      return {
        success: true,
        message: 'Watch deleted successfully'
      };
    } catch (error) {
      console.error(`❌ Error deleting watch ${uuid}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Find watch by URL
   * @param {string} url - URL to search for
   * @returns {Object} Watch if found
   */
  async findWatchByUrl(url) {
    const cleanUrl = this.cleanUrl(url);
    console.log(`🔍 Searching for watch with URL: ${cleanUrl}`);

    try {
      const result = await this.listAllWatches();
      if (!result.success) return null;

      for (const [uuid, watch] of Object.entries(result.watches)) {
        if (this.cleanUrl(watch.url) === cleanUrl) {
          return {
            uuid,
            ...watch
          };
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error finding watch by URL:', error.message);
      return null;
    }
  }

  /**
   * Get or create watch for a URL
   * @param {string} url - URL to monitor
   * @param {Object} options - Watch options
   * @returns {Object} Watch data with UUID
   */
  async getOrCreateWatch(url, options = {}) {
    // First, try to find existing watch
    const existingWatch = await this.findWatchByUrl(url);
    
    if (existingWatch) {
      console.log(`✅ Found existing watch for ${url}: ${existingWatch.uuid}`);
      return {
        success: true,
        uuid: existingWatch.uuid,
        url: existingWatch.url,
        existing: true,
        watch: existingWatch
      };
    }

    // If not found, create new watch
    console.log(`📝 No existing watch found for ${url}, creating new one...`);
    const result = await this.addWatch(url, options);
    
    if (result.success) {
      return {
        ...result,
        existing: false
      };
    }

    return result;
  }

  /**
   * Analyze content changes for a domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Change detection analysis
   */
  async analyzeContentChanges(domain) {
    const url = this.ensureHttps(domain);
    console.log(`📊 Analyzing content changes for: ${domain}`);

    try {
      // Get or create watch
      const watchResult = await this.getOrCreateWatch(url, {
        title: `Monitor: ${domain}`,
        tag: 'competitor-analysis'
      });

      if (!watchResult.success) {
        return {
          success: false,
          error: watchResult.error,
          domain
        };
      }

      // Get watch details
      const detailsResult = await this.getWatchDetails(watchResult.uuid);
      if (!detailsResult.success) {
        return {
          success: false,
          error: detailsResult.error,
          domain
        };
      }

      // Get change history
      const historyResult = await this.getWatchHistory(watchResult.uuid);

      const watch = detailsResult.watch;

      return {
        success: true,
        domain,
        uuid: watchResult.uuid,
        url: watch.url,
        monitoring: {
          lastChecked: watch.last_checked ? new Date(watch.last_checked * 1000).toISOString() : null,
          lastChanged: watch.last_changed ? new Date(watch.last_changed * 1000).toISOString() : null,
          checkCount: watch.check_count || 0,
          changeCount: watch.history_n || 0,
          status: watch.last_check_status || null,
          paused: watch.paused || false
        },
        triggers: watch.trigger_text || [],
        history: historyResult.history || [],
        activity: this.analyzeActivity(watch, historyResult.history || []),
        comparison: watch.last_changed > 0 ? 'active' : 'dormant'
      };
    } catch (error) {
      console.error(`❌ Error analyzing ${domain}:`, error.message);
      return {
        success: false,
        error: error.message,
        domain
      };
    }
  }

  /**
   * Analyze activity from watch data
   */
  analyzeActivity(watch, history) {
    const now = Date.now() / 1000; // Convert to seconds
    const lastChecked = watch.last_checked || 0;
    const lastChanged = watch.last_changed || 0;
    const daysSinceCheck = Math.floor((now - lastChecked) / 86400);
    const daysSinceChange = lastChanged > 0 ? Math.floor((now - lastChanged) / 86400) : null;

    return {
      isActive: daysSinceChange !== null && daysSinceChange <= 30,
      daysSinceLastCheck: daysSinceCheck,
      daysSinceLastChange: daysSinceChange,
      totalChecks: watch.check_count || 0,
      totalChanges: watch.history_n || 0,
      changeFrequency: this.calculateChangeFrequency(watch.history_n, watch.check_count),
      activityLevel: this.determineActivityLevel(daysSinceChange, watch.history_n)
    };
  }

  /**
   * Calculate change frequency
   */
  calculateChangeFrequency(changes, checks) {
    if (!checks || checks === 0) return 'unknown';
    const ratio = changes / checks;
    
    if (ratio >= 0.5) return 'very high';
    if (ratio >= 0.2) return 'high';
    if (ratio >= 0.05) return 'moderate';
    if (ratio > 0) return 'low';
    return 'no changes detected';
  }

  /**
   * Determine activity level
   */
  determineActivityLevel(daysSinceChange, totalChanges) {
    if (daysSinceChange === null || totalChanges === 0) return 'inactive';
    if (daysSinceChange <= 1) return 'very active';
    if (daysSinceChange <= 7) return 'active';
    if (daysSinceChange <= 30) return 'moderate';
    return 'low';
  }

  /**
   * Helper: Clean URL
   */
  cleanUrl(url) {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  /**
   * Helper: Ensure HTTPS
   */
  ensureHttps(domain) {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain;
    }
    return `https://${domain}`;
  }
}

export default new ChangeDetectionService();
