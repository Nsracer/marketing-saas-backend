/**
 * Traffic Metrics Adapter
 * Fetches and normalizes Google Analytics data.
 */

class TrafficMetricsAdapter {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Fetch Traffic metrics for a user.
     * @param {string} userId - The user's ID.
     * @returns {Promise<Object|null>} Normalized traffic metrics or null.
     */
    async getMetrics(userId) {
        try {
            const { data: analyticsData, error } = await this.supabase
                .from('google_analytics_cache')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.warn('TrafficMetricsAdapter: Error fetching GA data:', error.message);
                return null;
            }

            if (!analyticsData) {
                return null;
            }

            const metrics = [];

            // Active Users
            if (analyticsData.active_users !== undefined) {
                metrics.push({
                    id: 'traffic_active_users',
                    name: 'Active Users',
                    category: 'Traffic',
                    value: analyticsData.active_users,
                    unit: 'users',
                    status: 'neutral',
                    context: 'Active users in the reporting period.'
                });
            }

            // Sessions
            if (analyticsData.sessions !== undefined) {
                metrics.push({
                    id: 'traffic_sessions',
                    name: 'Sessions',
                    category: 'Traffic',
                    value: analyticsData.sessions,
                    unit: 'sessions',
                    status: 'neutral',
                    context: 'Total sessions recorded.'
                });
            }

            // Bounce Rate
            if (analyticsData.bounce_rate !== undefined) {
                const bounceRate = parseFloat(analyticsData.bounce_rate);
                metrics.push({
                    id: 'traffic_bounce_rate',
                    name: 'Bounce Rate',
                    category: 'Traffic',
                    value: bounceRate,
                    unit: '%',
                    status: bounceRate <= 40 ? 'good' : bounceRate <= 60 ? 'warning' : 'critical',
                    context: `Percentage of single-page visits. ${bounceRate <= 40 ? 'Healthy!' : bounceRate <= 60 ? 'Moderate.' : 'High, consider UX improvements.'}`
                });
            }

            // Avg Session Duration
            if (analyticsData.avg_session_duration !== undefined) {
                const duration = parseFloat(analyticsData.avg_session_duration);
                metrics.push({
                    id: 'traffic_avg_duration',
                    name: 'Avg Session Duration',
                    category: 'Traffic',
                    value: Math.round(duration),
                    unit: 'seconds',
                    status: duration >= 120 ? 'good' : duration >= 60 ? 'warning' : 'critical',
                    context: `Average time on site. ${duration >= 120 ? 'Engaging!' : 'Try improving content.'}`
                });
            }

            // Page Views
            if (analyticsData.page_views !== undefined) {
                metrics.push({
                    id: 'traffic_page_views',
                    name: 'Page Views',
                    category: 'Traffic',
                    value: analyticsData.page_views,
                    unit: 'views',
                    status: 'neutral',
                    context: 'Total page views.'
                });
            }

            // Social Traffic
            if (analyticsData.total_social_sessions !== undefined) {
                metrics.push({
                    id: 'traffic_social_sessions',
                    name: 'Social Traffic Sessions',
                    category: 'Traffic',
                    value: analyticsData.total_social_sessions,
                    unit: 'sessions',
                    status: 'neutral',
                    context: 'Sessions from social media sources.'
                });

                if (analyticsData.social_traffic_percentage !== undefined) {
                    metrics.push({
                        id: 'traffic_social_percentage',
                        name: 'Social Traffic %',
                        category: 'Traffic',
                        value: parseFloat(analyticsData.social_traffic_percentage.toFixed(1)),
                        unit: '%',
                        status: 'neutral',
                        context: 'Percentage of total traffic from social media.'
                    });
                }
            }

            return {
                available: true,
                metrics,
                lastUpdated: analyticsData.last_fetched_at || null,
                rawData: analyticsData
            };

        } catch (error) {
            console.error('TrafficMetricsAdapter: Error fetching metrics:', error);
            return null;
        }
    }
}

export default TrafficMetricsAdapter;
