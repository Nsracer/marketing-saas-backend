/**
 * SEO Metrics Adapter
 * Fetches and normalizes SEO-related metrics from Search Console and Lighthouse caches.
 */

class SEOMetricsAdapter {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Fetch SEO metrics for a user.
     * @param {string} userId - The user's ID.
     * @returns {Promise<Object|null>} Normalized SEO metrics or null.
     */
    async getMetrics(userId) {
        try {
            // Fetch from search_console_cache
            const { data: searchConsoleData, error: scError } = await this.supabase
                .from('search_console_cache')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (scError && scError.code !== 'PGRST116') {
                console.warn('SEOMetricsAdapter: Error fetching Search Console data:', scError.message);
            }

            // Fetch from lighthouse_cache
            const { data: lighthouseData, error: lhError } = await this.supabase
                .from('lighthouse_cache')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lhError && lhError.code !== 'PGRST116') {
                console.warn('SEOMetricsAdapter: Error fetching Lighthouse data:', lhError.message);
            }

            if (!searchConsoleData && !lighthouseData) {
                return null;
            }

            // Normalize into MetricPoints
            const metrics = [];

            // Performance Score (from lighthouse categoryScores)
            if (lighthouseData?.lighthouse_data?.categoryScores?.performance) {
                metrics.push({
                    id: 'seo_performance_score',
                    name: 'Performance Score',
                    category: 'SEO',
                    value: lighthouseData.lighthouse_data.categoryScores.performance,
                    unit: '/100',
                    status: this._getScoreStatus(lighthouseData.lighthouse_data.categoryScores.performance),
                    context: `Lighthouse performance score. ${lighthouseData.lighthouse_data.categoryScores.performance >= 90 ? 'Excellent!' : lighthouseData.lighthouse_data.categoryScores.performance >= 50 ? 'Needs improvement.' : 'Poor, requires attention.'}`
                });
            }

            // SEO Score (from lighthouse categoryScores)
            if (lighthouseData?.lighthouse_data?.categoryScores?.seo) {
                metrics.push({
                    id: 'seo_seo_score',
                    name: 'SEO Score',
                    category: 'SEO',
                    value: lighthouseData.lighthouse_data.categoryScores.seo,
                    unit: '/100',
                    status: this._getScoreStatus(lighthouseData.lighthouse_data.categoryScores.seo),
                    context: 'Lighthouse SEO audit score.'
                });
            }

            // Organic Clicks
            if (searchConsoleData?.total_clicks !== undefined) {
                metrics.push({
                    id: 'seo_organic_clicks',
                    name: 'Organic Clicks (30d)',
                    category: 'SEO',
                    value: searchConsoleData.total_clicks,
                    unit: 'clicks',
                    status: 'neutral',
                    context: 'Total clicks from Google Search in the last 30 days.'
                });
            }

            // Impressions
            if (searchConsoleData?.total_impressions !== undefined) {
                metrics.push({
                    id: 'seo_impressions',
                    name: 'Impressions (30d)',
                    category: 'SEO',
                    value: searchConsoleData.total_impressions,
                    unit: 'impressions',
                    status: 'neutral',
                    context: 'Total impressions in Google Search results.'
                });
            }

            // Average CTR
            if (searchConsoleData?.average_ctr !== undefined) {
                const ctrPercent = (searchConsoleData.average_ctr * 100).toFixed(2);
                metrics.push({
                    id: 'seo_ctr',
                    name: 'Average CTR',
                    category: 'SEO',
                    value: parseFloat(ctrPercent),
                    unit: '%',
                    status: parseFloat(ctrPercent) >= 3 ? 'good' : parseFloat(ctrPercent) >= 1 ? 'warning' : 'critical',
                    context: `Click-through rate. ${parseFloat(ctrPercent) >= 3 ? 'Good!' : 'Consider improving meta descriptions.'}`
                });
            }

            // Average Position
            if (searchConsoleData?.average_position !== undefined) {
                metrics.push({
                    id: 'seo_avg_position',
                    name: 'Average Position',
                    category: 'SEO',
                    value: parseFloat(searchConsoleData.average_position.toFixed(1)),
                    unit: '',
                    status: searchConsoleData.average_position <= 10 ? 'good' : searchConsoleData.average_position <= 30 ? 'warning' : 'critical',
                    context: `Average ranking position. ${searchConsoleData.average_position <= 10 ? 'Page 1!' : 'Aim for top 10.'}`
                });
            }

            // Total Backlinks
            if (searchConsoleData?.backlinks?.total !== undefined) {
                metrics.push({
                    id: 'seo_backlinks',
                    name: 'Total Backlinks',
                    category: 'SEO',
                    value: searchConsoleData.backlinks.total,
                    unit: 'links',
                    status: 'neutral',
                    context: 'Backlinks pointing to your domain.'
                });
            }

            // Mobile PageSpeed
            if (searchConsoleData?.pagespeed_data?.mobile?.performanceScore !== undefined) {
                metrics.push({
                    id: 'seo_mobile_speed',
                    name: 'Mobile PageSpeed',
                    category: 'SEO',
                    value: searchConsoleData.pagespeed_data.mobile.performanceScore,
                    unit: '/100',
                    status: this._getScoreStatus(searchConsoleData.pagespeed_data.mobile.performanceScore),
                    context: 'Google PageSpeed Insights mobile score.'
                });
            }

            // Desktop PageSpeed
            if (searchConsoleData?.pagespeed_data?.desktop?.performanceScore !== undefined) {
                metrics.push({
                    id: 'seo_desktop_speed',
                    name: 'Desktop PageSpeed',
                    category: 'SEO',
                    value: searchConsoleData.pagespeed_data.desktop.performanceScore,
                    unit: '/100',
                    status: this._getScoreStatus(searchConsoleData.pagespeed_data.desktop.performanceScore),
                    context: 'Google PageSpeed Insights desktop score.'
                });
            }

            return {
                available: true,
                metrics,
                domain: searchConsoleData?.domain || searchConsoleData?.site_url || null,
                lastUpdated: searchConsoleData?.last_fetched_at || lighthouseData?.last_fetched_at || null,
                rawData: {
                    searchConsole: searchConsoleData,
                    lighthouse: lighthouseData
                }
            };

        } catch (error) {
            console.error('SEOMetricsAdapter: Error fetching metrics:', error);
            return null;
        }
    }

    _getScoreStatus(score) {
        if (score >= 90) return 'good';
        if (score >= 50) return 'warning';
        return 'critical';
    }
}

export default SEOMetricsAdapter;
