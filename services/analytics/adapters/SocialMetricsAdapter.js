/**
 * Social Media Metrics Adapter
 * Fetches and normalizes social media metrics from the social_media_cache.
 */

class SocialMetricsAdapter {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Fetch Social Media metrics for a user.
     * @param {string} userEmail - The user's email.
     * @returns {Promise<Object|null>} Normalized social metrics or null.
     */
    async getMetrics(userEmail) {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const { data: socialData, error } = await this.supabase
                .from('social_media_cache')
                .select('*')
                .eq('user_email', userEmail)
                .gte('created_at', thirtyDaysAgo)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('SocialMetricsAdapter: Error fetching social data:', error.message);
                return null;
            }

            if (!socialData || socialData.length === 0) {
                return null;
            }

            // Group by platform (take latest for each)
            const platformData = {};
            for (const record of socialData) {
                const platform = record.platform;
                if (!platformData[platform]) {
                    platformData[platform] = record;
                }
            }

            const metrics = [];
            const activePlatforms = Object.keys(platformData);
            let totalFollowers = 0;
            let totalPosts = 0;

            for (const [platform, data] of Object.entries(platformData)) {
                const followerCount = data.follower_count || 0;
                totalFollowers += followerCount;

                const postsCount = data.posts_data?.length || 0;
                totalPosts += postsCount;

                // Follower Count
                metrics.push({
                    id: `social_${platform}_followers`,
                    name: `${this._capitalize(platform)} Followers`,
                    category: 'Social Media',
                    value: followerCount,
                    unit: 'followers',
                    status: 'neutral',
                    context: `Current follower count on ${this._capitalize(platform)}.`,
                    platform
                });

                // Engagement Rate
                if (data.engagement_data?.rate) {
                    const rate = parseFloat(data.engagement_data.rate);
                    metrics.push({
                        id: `social_${platform}_engagement`,
                        name: `${this._capitalize(platform)} Engagement`,
                        category: 'Social Media',
                        value: rate,
                        unit: '%',
                        status: rate >= 3 ? 'good' : rate >= 1 ? 'warning' : 'critical',
                        context: `Engagement rate. ${rate >= 3 ? 'Excellent!' : rate >= 1 ? 'Average.' : 'Low, try more engaging content.'}`,
                        platform
                    });
                }

                // Recent Posts
                if (postsCount > 0) {
                    metrics.push({
                        id: `social_${platform}_posts`,
                        name: `${this._capitalize(platform)} Recent Posts`,
                        category: 'Social Media',
                        value: postsCount,
                        unit: 'posts',
                        status: 'neutral',
                        context: 'Posts in the last 30 days.',
                        platform
                    });
                }

                // Follower Growth (if available)
                if (data.follower_growth && data.follower_growth.length > 0) {
                    const latestGrowth = data.follower_growth[data.follower_growth.length - 1];
                    if (latestGrowth?.change !== undefined) {
                        metrics.push({
                            id: `social_${platform}_growth`,
                            name: `${this._capitalize(platform)} Follower Growth`,
                            category: 'Social Media',
                            value: latestGrowth.change,
                            unit: 'followers',
                            status: latestGrowth.change >= 0 ? 'good' : 'critical',
                            context: `Recent follower change. ${latestGrowth.change >= 0 ? 'Growing!' : 'Losing followers.'}`,
                            platform
                        });
                    }
                }
            }

            // Summary Metrics
            metrics.push({
                id: 'social_total_followers',
                name: 'Total Followers (All Platforms)',
                category: 'Social Media',
                value: totalFollowers,
                unit: 'followers',
                status: 'neutral',
                context: `Combined followers across ${activePlatforms.length} platform(s).`
            });

            metrics.push({
                id: 'social_total_posts',
                name: 'Total Recent Posts',
                category: 'Social Media',
                value: totalPosts,
                unit: 'posts',
                status: totalPosts >= 10 ? 'good' : totalPosts >= 3 ? 'warning' : 'critical',
                context: `Total posts in 30d. ${totalPosts >= 10 ? 'Active!' : 'Consider posting more frequently.'}`
            });

            return {
                available: true,
                metrics,
                activePlatforms,
                lastUpdated: socialData[0]?.last_fetched_at || null,
                rawData: platformData
            };

        } catch (error) {
            console.error('SocialMetricsAdapter: Error fetching metrics:', error);
            return null;
        }
    }

    _capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

export default SocialMetricsAdapter;
