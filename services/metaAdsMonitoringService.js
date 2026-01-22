// Meta Ads Monitoring Service
// Fetches Meta (Facebook/Instagram) ad library data from SearchAPI.io for a given query


import axios from 'axios';

const SEARCH_API_KEY = process.env.SEARCHAPI_KEY;
const SEARCH_API_URL = 'https://www.searchapi.io/api/v1/search';

if (!SEARCH_API_KEY) {
  console.warn('⚠️ SEARCHAPI_KEY not configured');
}

// RapidAPI removed - using only scrapers for social media data


// RapidAPI page ID lookup removed - Meta Ads now use SearchAPI directly with username


/**
 * Fetches Meta Ad Library data for a Facebook page username (two-step: get page ID, then ads)
 * @param {string} username - Facebook page username
 * @returns {Promise<Object>} - Parsed meta ads monitoring metrics
 * Official Meta Ad Library Ad Details API docs: https://www.searchapi.io/docs/meta-ad-library-ad-details-api
 */
export async function getMetaAdsMonitoring(username) {
  try {
    console.log(`[MetaAds] getMetaAdsMonitoring called with username:`, username);
    
    if (!SEARCH_API_KEY) {
      console.error('[MetaAds] SearchAPI key not configured');
      return { error: 'SearchAPI key not configured' };
    }

    // Fetch Meta Ad Library data using username directly
    // SearchAPI.io supports direct username search
    const params = {
      engine: 'meta_ad_library',
      q: username, // Use query parameter with username/page name
      api_key: SEARCH_API_KEY
    };
    
    console.log(`[MetaAds] Querying SearchAPI.io for ads with username:`, username);
    const response = await axios.get(SEARCH_API_URL, { params });
    const data = response.data;
    
    console.log(`[MetaAds] SearchAPI.io response:`, data?.search_information || 'No results');
    
    return {
      totalAds: data.search_information?.total_results || 0,
      adSamples: (data.ads || []).slice(0, 3).map(ad => ({
        id: ad.ad_archive_id,
        pageName: ad.snapshot?.page_name,
        pageProfile: ad.snapshot?.page_profile_uri,
        text: ad.snapshot?.body?.text,
        images: (ad.snapshot?.images || []).map(img => img.resized_image_url || img.original_image_url),
        cta: ad.snapshot?.cta_text,
        startDate: ad.start_date,
        endDate: ad.end_date,
        isActive: ad.is_active
      }))
    };
  } catch (error) {
    console.error('[MetaAds] Meta Ads Monitoring Error:', error?.response?.data || error);
    return { error: error?.response?.data?.message || 'Failed to fetch Meta Ads monitoring data.' };
  }
}
