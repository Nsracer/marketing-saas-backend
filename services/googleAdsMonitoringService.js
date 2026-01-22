// Google Ads Monitoring Service
// Fetches paid ads data from SearchAPI.io for a given domain

import axios from 'axios';

const SEARCH_API_KEY = process.env.SEARCHAPI_KEY;
const SEARCH_API_URL = 'https://www.searchapi.io/api/v1/search';

if (!SEARCH_API_KEY) {
  console.warn('⚠️ SEARCHAPI_KEY not configured');
}

/**
 * Fetches Google Ads transparency data for a domain
 * @param {string} domain - The domain to monitor (e.g., 'tesla.com')
 * @returns {Promise<Object>} - Parsed ad monitoring metrics
 */
export async function getGoogleAdsMonitoring(domain) {
  try {
    const params = {
      engine: 'google_ads_transparency_center',
      domain,
      time_period: 'last_30_days',
      api_key: SEARCH_API_KEY
    };
    const response = await axios.get(SEARCH_API_URL, { params });
    const data = response.data;
    // Parse key metrics
    return {
      totalAds: data.search_information?.total_results || 0,
      advertiser: data.ad_creatives?.[0]?.advertiser?.name || null,
      adSamples: (data.ad_creatives || []).slice(0, 3).map(ad => ({
        id: ad.id,
        format: ad.format,
        firstShown: ad.first_shown_datetime,
        lastShown: ad.last_shown_datetime,
        totalDaysShown: ad.total_days_shown,
        detailsLink: ad.details_link
      })),
      transparencyUrl: data.search_metadata?.request_url || null
    };
  } catch (error) {
    console.error('Google Ads Monitoring Error:', error?.response?.data || error);
    return { error: 'Failed to fetch Google Ads monitoring data.' };
  }
}
