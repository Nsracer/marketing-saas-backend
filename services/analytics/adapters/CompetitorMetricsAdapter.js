/**
 * Competitor Metrics Adapter
 * Fetches and normalizes competitor analysis data.
 */

class CompetitorMetricsAdapter {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Fetch Competitor metrics for a user.
     * @param {string} userId - The user's ID.
     * @returns {Promise<Object|null>} Normalized competitor metrics or null.
     */
    async getMetrics(userId) {
        try {
            const { data: competitorData, error } = await this.supabase
                .from('competitor_cache')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(10);

            if (error) {
                console.warn('CompetitorMetricsAdapter: Error fetching competitor data:', error.message);
                return null;
            }

            if (!competitorData || competitorData.length === 0) {
                return null;
            }

            const metrics = [];
            const competitorDomains = [];

            // Summary: Number of competitors tracked
            metrics.push({
                id: 'competitor_count',
                name: 'Competitors Tracked',
                category: 'Competitor',
                value: competitorData.length,
                unit: 'sites',
                status: 'neutral',
                context: 'Number of competitor websites being monitored.'
            });

            // Analyze each competitor
            for (const comp of competitorData) {
                const domain = comp.competitor_domain;
                competitorDomains.push(domain);

                const perfScore = comp.lighthouse_data?.performance || 0;
                const seoScore = comp.lighthouse_data?.seo || 0;
                const backlinks = comp.backlinks_data?.total || 0;

                // Competitor Performance Summary (highlight if they're outperforming)
                if (perfScore > 0) {
                    metrics.push({
                        id: `competitor_${domain}_perf`,
                        name: `${domain} Performance`,
                        category: 'Competitor',
                        value: perfScore,
                        unit: '/100',
                        status: 'neutral',
                        context: `Competitor's Lighthouse performance score.`,
                        competitorDomain: domain
                    });
                }

                if (seoScore > 0) {
                    metrics.push({
                        id: `competitor_${domain}_seo`,
                        name: `${domain} SEO Score`,
                        category: 'Competitor',
                        value: seoScore,
                        unit: '/100',
                        status: 'neutral',
                        context: `Competitor's Lighthouse SEO score.`,
                        competitorDomain: domain
                    });
                }

                if (backlinks > 0) {
                    metrics.push({
                        id: `competitor_${domain}_backlinks`,
                        name: `${domain} Backlinks`,
                        category: 'Competitor',
                        value: backlinks,
                        unit: 'links',
                        status: 'neutral',
                        context: `Competitor's total backlink count.`,
                        competitorDomain: domain
                    });
                }
            }

            // Calculate average competitor scores for comparison
            const avgPerfScore = competitorData.reduce((sum, c) => sum + (c.lighthouse_data?.performance || 0), 0) / competitorData.length;
            const avgSeoScore = competitorData.reduce((sum, c) => sum + (c.lighthouse_data?.seo || 0), 0) / competitorData.length;
            const avgBacklinks = competitorData.reduce((sum, c) => sum + (c.backlinks_data?.total || 0), 0) / competitorData.length;

            metrics.push({
                id: 'competitor_avg_perf',
                name: 'Avg Competitor Performance',
                category: 'Competitor',
                value: Math.round(avgPerfScore),
                unit: '/100',
                status: 'neutral',
                context: 'Average performance score across all tracked competitors.'
            });

            metrics.push({
                id: 'competitor_avg_seo',
                name: 'Avg Competitor SEO',
                category: 'Competitor',
                value: Math.round(avgSeoScore),
                unit: '/100',
                status: 'neutral',
                context: 'Average SEO score across all tracked competitors.'
            });

            metrics.push({
                id: 'competitor_avg_backlinks',
                name: 'Avg Competitor Backlinks',
                category: 'Competitor',
                value: Math.round(avgBacklinks),
                unit: 'links',
                status: 'neutral',
                context: 'Average backlink count across all tracked competitors.'
            });

            return {
                available: true,
                metrics,
                competitorDomains,
                lastUpdated: competitorData[0]?.updated_at || null,
                rawData: competitorData
            };

        } catch (error) {
            console.error('CompetitorMetricsAdapter: Error fetching metrics:', error);
            return null;
        }
    }
}

export default CompetitorMetricsAdapter;
