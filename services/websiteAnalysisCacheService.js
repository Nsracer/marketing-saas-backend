import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Save website analysis data to cache
 */
async function saveAnalysisCache(userEmail, domain, analysisData) {
  try {
    const { healthScore, quickWins, fullAnalysis, competitorData, trafficData } = analysisData;

    const { data, error } = await supabase
      .from('dashboard_cache')
      .upsert({
        user_email: userEmail,
        domain: domain,
        health_score: healthScore,
        quick_wins: quickWins,
        full_analysis: fullAnalysis,
        competitor_data: competitorData || null,
        traffic_data: trafficData || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_email,domain'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving analysis cache:', error);
      return null;
    }

    console.log('✅ Analysis cache saved for:', domain);
    return data;
  } catch (error) {
    console.error('❌ Error in saveAnalysisCache:', error);
    return null;
  }
}

/**
 * Get cached website analysis data
 */
async function getAnalysisCache(userEmail, domain) {
  try {
    const { data, error } = await supabase
      .from('dashboard_cache')
      .select('*')
      .eq('user_email', userEmail)
      .eq('domain', domain)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        console.log('ℹ️ No cached analysis found for:', domain);
        return null;
      }
      console.error('❌ Error getting analysis cache:', error);
      return null;
    }

    // Check if cache is older than 24 hours
    const cacheAge = Date.now() - new Date(data.updated_at).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (cacheAge > maxAge) {
      console.log('⏰ Cache expired for:', domain);
      return null;
    }

    console.log('✅ Returning cached analysis for:', domain);
    return data;
  } catch (error) {
    console.error('❌ Error in getAnalysisCache:', error);
    return null;
  }
}

/**
 * Get user's last analyzed domain
 */
async function getLastAnalyzedDomain(userEmail) {
  try {
    const { data, error } = await supabase
      .from('dashboard_cache')
      .select('domain, updated_at')
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('❌ Error getting last analyzed domain:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getLastAnalyzedDomain:', error);
    return null;
  }
}

/**
 * Delete cached analysis
 */
async function deleteAnalysisCache(userEmail, domain) {
  try {
    const { error } = await supabase
      .from('dashboard_cache')
      .delete()
      .eq('user_email', userEmail)
      .eq('domain', domain);

    if (error) {
      console.error('❌ Error deleting analysis cache:', error);
      return false;
    }

    console.log('✅ Analysis cache deleted for:', domain);
    return true;
  } catch (error) {
    console.error('❌ Error in deleteAnalysisCache:', error);
    return false;
  }
}

export default {
  saveAnalysisCache,
  getAnalysisCache,
  getLastAnalyzedDomain,
  deleteAnalysisCache
};
