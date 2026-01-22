import axios from 'axios';

/**
 * Facebook Engagement Service
 * 
 * Uses RapidAPI Facebook Pages Scraper to fetch page engagement metrics
 * API: facebook-pages-scraper2.p.rapidapi.com
 */

class FacebookEngagementService {
    constructor() {
        this.rapidApiKey = process.env.RAPIDAPI_KEY;
        this.rapidApiHost = 'facebook-pages-scraper2.p.rapidapi.com';
        this.baseURL = `https://${this.rapidApiHost}`;
    }

    /**
     * Get Facebook page details using RapidAPI
     * @param {string} pageUsername - Facebook page username (e.g., "EngenSA")
     * @returns {Object} Page details with engagement metrics
     */
    async getPageInfo(pageUsername) {
        try {
            console.log(`\n🔍 Fetching Facebook page info for: ${pageUsername}`);

            // Build Facebook page URL
            const pageUrl = `https://www.facebook.com/${pageUsername}`;
            
            // Encode the URL for the API request
            const encodedUrl = encodeURIComponent(pageUrl);
            
            // API endpoint
            const url = `${this.baseURL}/get_facebook_pages_details`;
            
            const options = {
                method: 'GET',
                url,
                params: {
                    link: pageUrl,
                    show_verified_badge: 'false'
                },
                headers: {
                    'x-rapidapi-key': this.rapidApiKey,
                    'x-rapidapi-host': this.rapidApiHost
                }
            };

            const response = await axios.request(options);
            
            // API returns an array, get first result
            const data = response.data[0];

            if (!data) {
                throw new Error(`No data found for page: ${pageUsername}`);
            }

            console.log('✅ Page info retrieved successfully\n');

            // Parse followers and likes counts
            const followers = this.parseCount(data.followers_count);
            const likes = this.parseCount(data.likes_count);
            
            // Extract "talking about this" from description
            // Format: "75,525 likes · 4,571 talking about this"
            const talkingAbout = this.extractTalkingAbout(data.description);
            
            // Calculate engagement rate
            const engagementRate = followers > 0 ? 
                ((talkingAbout / followers) * 100).toFixed(2) : '0.00';

            // Parse rating
            const ratingMatch = data.rating?.match(/(\d+)%/);
            const ratingPercent = ratingMatch ? parseInt(ratingMatch[1]) : 0;
            const ratingCountMatch = data.rating?.match(/\((\d+)\s+reviews\)/);
            const ratingCount = ratingCountMatch ? parseInt(ratingCountMatch[1]) : 0;

            return {
                id: data.user_id,
                name: data.title,
                username: pageUsername,
                followers: followers,
                likes: likes,
                talkingAbout: talkingAbout, // People talking about this
                engagement: talkingAbout,
                rating: ratingPercent / 20, // Convert % to 5-star scale
                ratingPercent: ratingPercent,
                ratingCount: ratingCount,
                category: Array.isArray(data.category) ? data.category.join(', ') : data.category,
                website: data.website || '',
                verified: false, // Not provided in this API
                link: data.url,
                bio: data.bio,
                address: data.address,
                phone: data.phone,
                email: data.email,
                engagementRate: parseFloat(engagementRate),
                image: data.image
            };

        } catch (error) {
            console.error('❌ Error fetching Facebook page info:', error.message);
            throw error;
        }
    }

    /**
     * Parse follower/like counts that may be in "114K" format
     */
    parseCount(countStr) {
        if (!countStr) return 0;
        
        const str = countStr.toString().trim();
        
        // Handle "114K followers" format
        if (str.includes('K')) {
            return Math.round(parseFloat(str.replace(/[^\d.]/g, '')) * 1000);
        }
        
        // Handle "1.2M followers" format
        if (str.includes('M')) {
            return Math.round(parseFloat(str.replace(/[^\d.]/g, '')) * 1000000);
        }
        
        // Handle regular numbers with commas
        return parseInt(str.replace(/,/g, '')) || 0;
    }

    /**
     * Extract "talking about this" count from description
     * Format: "75,525 likes · 4,571 talking about this · 7,049 were here"
     */
    extractTalkingAbout(description) {
        if (!description) return 0;
        
        const match = description.match(/(\d{1,3}(?:,\d{3})*)\s+talking about this/);
        if (match) {
            return parseInt(match[1].replace(/,/g, ''));
        }
        
        return 0;
    }

    /**
     * Estimate posting frequency based on engagement
     * Since API doesn't provide post history, we estimate based on "talking about" count
     */
    estimatePostingFrequency(talkingAbout, followers) {
        if (followers === 0) {
            return {
                postsPerWeek: 0,
                postsPerMonth: 0,
                estimatedActivity: 'Unknown'
            };
        }

        // High engagement suggests more frequent posting
        const engagementRate = (talkingAbout / followers) * 100;
        
        let postsPerWeek = 0;
        let activity = 'Low';
        
        if (engagementRate > 5) {
            postsPerWeek = 5; // Very active
            activity = 'Very High';
        } else if (engagementRate > 2) {
            postsPerWeek = 3; // Active
            activity = 'High';
        } else if (engagementRate > 0.5) {
            postsPerWeek = 2; // Moderate
            activity = 'Moderate';
        } else if (engagementRate > 0) {
            postsPerWeek = 1; // Low activity
            activity = 'Low';
        }

        return {
            postsPerWeek,
            postsPerMonth: postsPerWeek * 4,
            estimatedActivity: activity,
            note: 'Estimated based on engagement rate'
        };
    }

    /**
     * Get complete engagement analysis
     */
    async getFullEngagementAnalysis(pageUsername) {
        console.log(`\n📱 Analyzing Facebook page: ${pageUsername}`);
        console.log('═══════════════════════════════════════════════════\n');

        try {
            // Get page info
            const pageInfo = await this.getPageInfo(pageUsername);
            
            // Estimate posting frequency based on engagement
            const postingData = this.estimatePostingFrequency(
                pageInfo.talkingAbout, 
                pageInfo.followers
            );

            const result = {
                profile: {
                    name: pageInfo.name,
                    username: pageInfo.username,
                    followers: pageInfo.followers,
                    likes: pageInfo.likes,
                    talkingAbout: pageInfo.talkingAbout,
                    verified: pageInfo.verified,
                    category: pageInfo.category,
                    rating: pageInfo.rating,
                    ratingPercent: pageInfo.ratingPercent,
                    ratingCount: pageInfo.ratingCount,
                    link: pageInfo.link,
                    bio: pageInfo.bio,
                    address: pageInfo.address,
                    phone: pageInfo.phone,
                    email: pageInfo.email,
                    website: pageInfo.website
                },
                metrics: {
                    followers: pageInfo.followers,
                    likes: pageInfo.likes,
                    talkingAbout: pageInfo.talkingAbout,
                    engagement: pageInfo.engagement,
                    engagementRate: pageInfo.engagementRate,
                    estimatedPostsPerWeek: postingData.postsPerWeek,
                    estimatedPostsPerMonth: postingData.postsPerMonth,
                    activityLevel: postingData.estimatedActivity
                },
                analysis: {
                    summary: `${pageInfo.name} has ${pageInfo.followers.toLocaleString()} followers and ${pageInfo.likes.toLocaleString()} likes with a ${pageInfo.engagementRate}% engagement rate. ${pageInfo.talkingAbout.toLocaleString()} people are talking about this page.`,
                    activityLevel: postingData.estimatedActivity,
                    rating: `${pageInfo.ratingPercent}% recommend (${pageInfo.ratingCount} reviews)`,
                    note: postingData.note
                }
            };

            console.log('✅ Analysis complete!\n');
            console.log('Profile:', result.profile.name);
            console.log('Followers:', result.metrics.followers.toLocaleString());
            console.log('Likes:', result.metrics.likes.toLocaleString());
            console.log('Talking About:', result.metrics.talkingAbout.toLocaleString());
            console.log('Engagement Rate:', result.metrics.engagementRate + '%');
            console.log('Rating:', result.profile.ratingPercent + '%', `(${result.profile.ratingCount} reviews)`);
            console.log('Activity Level:', result.metrics.activityLevel);
            console.log('Estimated Posts/Week:', result.metrics.estimatedPostsPerWeek);
            console.log('');

            return result;

        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }
}

export default new FacebookEngagementService();