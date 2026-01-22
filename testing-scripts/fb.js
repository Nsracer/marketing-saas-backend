import axios from 'axios';
import fs from 'fs';

// Configuration
const USER_ACCESS_TOKEN = "EAAB0K3GG6y4BP94oWQxAzCWJ9AZCZBCsov2JoX50FLlaLaGAxaXLeqZAmEMfITbbjf2YX2EeQFkc88SE6uVZCGtizUPqtb9C1VkKWgCb14t9sRrmmFxyGokTZCZA1m30zBhX8PbHk4Qt8ETDuHpzZBhacQcAt1wcyNwcdWCcuXuTqE7QRaQiPwaMSr2ZCxiZB";
const API_VERSION = "v24.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

let PAGE_ACCESS_TOKEN = null;

async function getPageAccessToken() {
    try {
        const response = await axios.get(`${BASE_URL}/me/accounts`, {
            params: {
                fields: 'id,name,access_token',
                access_token: USER_ACCESS_TOKEN
            }
        });

        if (response.data.data && response.data.data.length > 0) {
            const page = response.data.data[0];
            console.log(`   Page: ${page.name} (${page.id})`);
            PAGE_ACCESS_TOKEN = page.access_token;

            return {
                pageId: page.id,
                pageName: page.name,
                pageAccessToken: page.access_token
            };
        }
        throw new Error('No Facebook Page found');
    } catch (error) {
        console.error('Error getting Page Access Token:', error.response?.data || error.message);
        throw error;
    }
}

async function getPageFollowersTimeSeries(pageId, days = 30) {
    const untilDate = new Date();
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
    const untilTimestamp = Math.floor(untilDate.getTime() / 1000);

    try {
        const response = await axios.get(`${BASE_URL}/${pageId}/insights`, {
            params: {
                metric: 'page_fans,page_fan_adds,page_fan_removes',
                period: 'day',
                since: sinceTimestamp,
                until: untilTimestamp,
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        const followerData = {
            dates: [],
            total_fans: [],
            fan_adds: [],
            fan_removes: [],
            net_change: []
        };

        if (response.data.data && response.data.data.length > 0) {
            const metricsMap = {};
            for (const metric of response.data.data) {
                metricsMap[metric.name] = metric.values || [];
            }

            const fanValues = metricsMap['page_fans'] || [];
            const addValues = metricsMap['page_fan_adds'] || [];
            const removeValues = metricsMap['page_fan_removes'] || [];

            for (let i = 0; i < fanValues.length; i++) {
                followerData.dates.push(fanValues[i].end_time);
                followerData.total_fans.push(fanValues[i].value);
                followerData.fan_adds.push(addValues[i]?.value || 0);
                followerData.fan_removes.push(removeValues[i]?.value || 0);
                followerData.net_change.push((addValues[i]?.value || 0) - (removeValues[i]?.value || 0));
            }
        }

        return followerData;
    } catch (error) {
        console.error(`Error fetching ${days}-day follower data:`, error.response?.data || error.message);
        return null;
    }
}

async function getPagePosts(pageId, limit = 100) {
    try {
        const response = await axios.get(`${BASE_URL}/${pageId}/published_posts`, {
            params: {
                fields: 'id,message,created_time,permalink_url,is_published',
                limit: limit,
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        return response.data.data || [];
    } catch (error) {
        console.error('Error fetching posts:', error.response?.data || error.message);
        return [];
    }
}

async function getPostReactions(postId) {
    try {
        const response = await axios.get(`${BASE_URL}/${postId}/reactions`, {
            params: {
                summary: 'total_count',
                limit: 0,
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        return response.data.summary?.total_count || 0;
    } catch (error) {
        return 0;
    }
}

async function getPostComments(postId) {
    try {
        const response = await axios.get(`${BASE_URL}/${postId}/comments`, {
            params: {
                summary: 'total_count',
                limit: 0,
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        return response.data.summary?.total_count || 0;
    } catch (error) {
        return 0;
    }
}

async function getPostShares(postId) {
    try {
        const response = await axios.get(`${BASE_URL}/${postId}`, {
            params: {
                fields: 'shares',
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        return response.data.shares?.count || 0;
    } catch (error) {
        return 0;
    }
}

async function getPostInsights(postId) {
    try {
        const response = await axios.get(`${BASE_URL}/${postId}/insights`, {
            params: {
                metric: 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks',
                access_token: PAGE_ACCESS_TOKEN
            }
        });

        const insights = {};
        const data = response.data.data || [];

        for (const metric of data) {
            const metricName = metric.name;
            const metricValue = metric.values && metric.values.length > 0 ? metric.values[0].value : 0;
            insights[metricName] = metricValue;
        }

        return insights;
    } catch (error) {
        return {};
    }
}

// ONLY FIX: Simple engagement score calculation
function calculateEngagementScore(reactions, comments, shares, reach) {
    if (reach === 0) return 0;
    const totalEngagement = reactions + comments + shares;
    const score = (totalEngagement / reach) * 100;
    return Math.min(100, Math.round(score));
}

async function getTopPosts(pageId, days = 30, topN = 7) {
    const allPosts = await getPagePosts(pageId, 100);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filteredPosts = allPosts.filter(post => {
        const postDate = new Date(post.created_time);
        return postDate >= cutoffDate;
    });

    console.log(`   Found ${filteredPosts.length} posts in last ${days} days`);

    if (filteredPosts.length === 0) {
        return [];
    }

    const postsWithInsights = [];

    for (const post of filteredPosts) {
        const reactions = await getPostReactions(post.id);
        const comments = await getPostComments(post.id);
        const shares = await getPostShares(post.id);
        const insights = await getPostInsights(post.id);

        const impressionsUnique = insights.post_impressions_unique || 1;
        const impressions = insights.post_impressions || 0;
        const engagedUsers = insights.post_engaged_users || 0;

        // FIXED: Use simple formula
        const engagementScore = calculateEngagementScore(reactions, comments, shares, impressionsUnique);

        const message = post.message || '[No message]';
        const postData = {
            post_id: post.id,
            post_url: post.permalink_url || '',
            message: message.length > 80 ? message.substring(0, 80) + '...' : message,
            created_time: post.created_time,
            reactions: reactions,
            comments: comments,
            shares: shares,
            total_engagement: reactions + comments + shares,
            impressions: impressions,
            reach: impressionsUnique,
            engaged_users: engagedUsers,
            clicks: insights.post_clicks || 0,
            engagement_score: engagementScore
        };

        postsWithInsights.push(postData);

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Sort by engagement score
    const topPosts = postsWithInsights
        .sort((a, b) => b.engagement_score - a.engagement_score)
        .slice(0, topN);

    return topPosts;
}

async function main() {
    console.log('='.repeat(80));
    console.log('Facebook Analytics - Last 30 Days (Optimized for Plotting)');
    console.log('='.repeat(80));

    try {
        console.log('\n[1/3] Getting Page Access Token...');
        const pageInfo = await getPageAccessToken();
        const pageId = pageInfo.pageId;
        console.log(`✓ Page ID: ${pageId}`);

        console.log('\n[2/3] Fetching 30-day follower time series...');
        const followers30d = await getPageFollowersTimeSeries(pageId, 30);
        if (followers30d) {
            console.log(`✓ Retrieved ${followers30d.dates.length} days of follower data`);
        }

        console.log('\n[3/3] Fetching top 7 posts (30 days)...');
        const topPosts = await getTopPosts(pageId, 30, 7);
        console.log(`✓ Found ${topPosts.length} top posts`);

        // Calculate cumulative metrics
        const cumulativeMetrics = {
            total_likes: topPosts.reduce((sum, post) => sum + post.reactions, 0),
            total_comments: topPosts.reduce((sum, post) => sum + post.comments, 0),
            total_shares: topPosts.reduce((sum, post) => sum + post.shares, 0),
            total_reach: topPosts.reduce((sum, post) => sum + post.reach, 0),
            total_impressions: topPosts.reduce((sum, post) => sum + post.impressions, 0),
            total_engagements: topPosts.reduce((sum, post) => sum + post.total_engagement, 0),
            avg_engagement_score: topPosts.length > 0 
                ? Math.round(topPosts.reduce((sum, post) => sum + post.engagement_score, 0) / topPosts.length)
                : 0
        };

        // Prepare plotting data
        const plottingData = {
            page_info: {
                page_id: pageId,
                page_name: pageInfo.pageName
            },
            follower_growth: {
                dates: followers30d.dates.map(d => new Date(d).toISOString().split('T')[0]),
                total_fans: followers30d.total_fans,
                daily_adds: followers30d.fan_adds,
                daily_removes: followers30d.fan_removes,
                net_change: followers30d.net_change
            },
            top_posts: topPosts.map(post => ({
                post_id: post.post_id,
                post_url: post.post_url,
                message: post.message,
                created_date: new Date(post.created_time).toISOString().split('T')[0],
                likes: post.reactions,
                comments: post.comments,
                shares: post.shares,
                reach: post.reach,
                impressions: post.impressions,
                engaged_users: post.engaged_users,
                engagement_score: post.engagement_score
            })),
            cumulative_metrics: cumulativeMetrics,
            generated_at: new Date().toISOString()
        };

        fs.writeFileSync('facebook_analytics_30days.json', JSON.stringify(plottingData, null, 2));

        console.log('\n' + '='.repeat(80));
        console.log('📊 ANALYTICS SUMMARY (Last 30 Days)');
        console.log('='.repeat(80));

        // Follower stats
        if (followers30d && followers30d.total_fans.length > 0) {
            const startFans = followers30d.total_fans[0];
            const currentFans = followers30d.total_fans[followers30d.total_fans.length - 1];
            const totalAdds = followers30d.fan_adds.reduce((a, b) => a + b, 0);
            const totalRemoves = followers30d.fan_removes.reduce((a, b) => a + b, 0);
            const netChange = currentFans - startFans;
            const growthRate = ((netChange / startFans) * 100).toFixed(2);

            console.log('\n📈 FOLLOWER GROWTH:');
            console.log('─'.repeat(80));
            console.log(`Starting Fans:     ${startFans}`);
            console.log(`Current Fans:      ${currentFans}`);
            console.log(`New Followers:     +${totalAdds}`);
            console.log(`Unfollows:         -${totalRemoves}`);
            console.log(`Net Change:        ${netChange >= 0 ? '+' : ''}${netChange}`);
            console.log(`Growth Rate:       ${growthRate}%`);
        }

        // Cumulative metrics
        console.log('\n📊 CUMULATIVE METRICS (All Top Posts):');
        console.log('─'.repeat(80));
        console.log(`Total Likes:       ${cumulativeMetrics.total_likes}`);
        console.log(`Total Comments:    ${cumulativeMetrics.total_comments}`);
        console.log(`Total Shares:      ${cumulativeMetrics.total_shares}`);
        console.log(`Total Reach:       ${cumulativeMetrics.total_reach}`);
        console.log(`Total Impressions: ${cumulativeMetrics.total_impressions}`);
        console.log(`Total Engagements: ${cumulativeMetrics.total_engagements}`);
        console.log(`\n🎯 Average Engagement Score: ${cumulativeMetrics.avg_engagement_score}/100`);

        // Top posts
        if (topPosts.length > 0) {
            console.log('\n🔥 TOP PERFORMING POSTS:');
            console.log('─'.repeat(80));

            topPosts.forEach((post, i) => {
                console.log(`\n${i + 1}. ${post.message}`);
                console.log(`   📅 ${new Date(post.created_time).toLocaleDateString()}`);
                console.log(`   🔗 ${post.post_url}`);
                console.log(`   ❤️  Likes: ${post.reactions} | 💬 Comments: ${post.comments} | 🔁 Shares: ${post.shares}`);
                console.log(`   📊 Reach: ${post.reach} | Impressions: ${post.impressions}`);
                console.log(`   🎯 Engagement Score: ${post.engagement_score}/100`);
            });

            console.log('\n📊 POST PERFORMANCE TABLE:');
            console.table(topPosts.map((post, i) => ({
                '#': i + 1,
                'Likes': post.reactions,
                'Comments': post.comments,
                'Shares': post.shares,
                'Reach': post.reach,
                'Score': `${post.engagement_score}/100`
            })));
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ SUCCESS! Data saved to: facebook_analytics_30days.json');
        console.log('='.repeat(80));
        console.log('\n📈 PLOTTING-READY DATA AVAILABLE:');
        console.log('   ✓ follower_growth.dates (array of dates)');
        console.log('   ✓ follower_growth.total_fans (array for line chart)');
        console.log('   ✓ follower_growth.net_change (array for bar chart)');
        console.log('   ✓ top_posts (array with all metrics)');
        console.log('   ✓ cumulative_metrics (summary object)');
        console.log('\n💡 Ready to plot graphs with any charting library!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

main();
