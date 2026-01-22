import express from 'express';
import { createClient } from '@supabase/supabase-js';
const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

/**
 * Health Score Cache API Routes
 * Handles caching and retrieval of website health scores
 */

// Get health score for a specific website
router.get('/health-score/:website', async (req, res) => {
    try {
        const { website } = req.params;
        const userEmail = req.user?.email; // Assuming you have auth middleware

        if (!userEmail) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Decode URL parameter
        const websiteUrl = decodeURIComponent(website);

        // Get latest health score from cache
        const { data, error } = await supabase
            .from('health_score_dashboard')
            .select('*')
            .eq('user_email', userEmail)
            .eq('website_url', websiteUrl)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching health score:', error);
            return res.status(500).json({ error: 'Failed to fetch health score' });
        }

        if (!data) {
            return res.status(404).json({ 
                error: 'Health score not found',
                needsAnalysis: true 
            });
        }

        res.json({
            success: true,
            data,
            cached: true,
            expiresAt: data.expires_at
        });

    } catch (error) {
        console.error('Health score fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all health scores for a user
router.get('/health-scores', async (req, res) => {
    try {
        const userEmail = req.user?.email;

        if (!userEmail) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data, error } = await supabase
            .from('health_score_dashboard')
            .select(`
                website_url,
                overall_health_score,
                health_grade,
                health_status,
                last_analyzed_at,
                time_until_refresh,
                seo_score,
                performance_score,
                accessibility_score,
                best_practices_score,
                total_clicks,
                total_impressions,
                ctr_percentage
            `)
            .eq('user_email', userEmail)
            .order('overall_health_score', { ascending: false });

        if (error) {
            console.error('Error fetching health scores:', error);
            return res.status(500).json({ error: 'Failed to fetch health scores' });
        }

        res.json({
            success: true,
            data: data || [],
            count: data?.length || 0
        });

    } catch (error) {
        console.error('Health scores fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Store/Update health score in cache
router.post('/health-score', async (req, res) => {
    try {
        const userEmail = req.user?.email;

        if (!userEmail) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const {
            website_url,
            overall_health_score,
            health_grade,
            seo_score,
            seo_issues,
            seo_warnings,
            performance_score,
            page_load_time,
            first_contentful_paint,
            largest_contentful_paint,
            cumulative_layout_shift,
            accessibility_score,
            accessibility_issues,
            best_practices_score,
            security_issues,
            organic_traffic,
            total_clicks,
            total_impressions,
            average_ctr,
            average_position,
            total_backlinks,
            referring_domains,
            domain_authority,
            mobile_friendly,
            ssl_certificate,
            sitemap_exists,
            robots_txt_exists,
            structured_data_score,
            content_score,
            keyword_optimization,
            content_length,
            duplicate_content_issues,
            social_signals,
            facebook_shares,
            twitter_shares,
            linkedin_shares,
            competitor_rank,
            market_share,
            competitive_gaps,
            lighthouse_data,
            search_console_data,
            analytics_data,
            backlinks_data,
            priority_recommendations,
            improvement_opportunities,
            analysis_duration,
            data_sources
        } = req.body;

        if (!website_url || overall_health_score === undefined) {
            return res.status(400).json({ 
                error: 'Website URL and overall health score are required' 
            });
        }

        // Upsert health score data
        const { data, error } = await supabase
            .from('health_score_cache')
            .upsert({
                user_email: userEmail,
                website_url,
                overall_health_score,
                health_grade,
                seo_score,
                seo_issues,
                seo_warnings,
                performance_score,
                page_load_time,
                first_contentful_paint,
                largest_contentful_paint,
                cumulative_layout_shift,
                accessibility_score,
                accessibility_issues,
                best_practices_score,
                security_issues,
                organic_traffic,
                total_clicks,
                total_impressions,
                average_ctr,
                average_position,
                total_backlinks,
                referring_domains,
                domain_authority,
                mobile_friendly,
                ssl_certificate,
                sitemap_exists,
                robots_txt_exists,
                structured_data_score,
                content_score,
                keyword_optimization,
                content_length,
                duplicate_content_issues,
                social_signals,
                facebook_shares,
                twitter_shares,
                linkedin_shares,
                competitor_rank,
                market_share,
                competitive_gaps,
                lighthouse_data,
                search_console_data,
                analytics_data,
                backlinks_data,
                priority_recommendations,
                improvement_opportunities,
                analysis_duration,
                data_sources,
                analysis_status: 'completed',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
            }, {
                onConflict: 'user_email,website_url'
            })
            .select()
            .single();

        if (error) {
            console.error('Error storing health score:', error);
            return res.status(500).json({ error: 'Failed to store health score' });
        }

        res.json({
            success: true,
            data,
            message: 'Health score stored successfully'
        });

    } catch (error) {
        console.error('Health score store error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Trigger health score analysis for a website
router.post('/health-score/analyze', async (req, res) => {
    try {
        const userEmail = req.user?.email;
        const { website_url, force = false } = req.body;

        if (!userEmail) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!website_url) {
            return res.status(400).json({ error: 'Website URL is required' });
        }

        // Check if we have recent data and force is not true
        if (!force) {
            const { data: existingData } = await supabase
                .from('health_score_cache')
                .select('id, expires_at, analysis_status')
                .eq('user_email', userEmail)
                .eq('website_url', website_url)
                .single();

            if (existingData && new Date(existingData.expires_at) > new Date()) {
                return res.json({
                    success: true,
                    cached: true,
                    message: 'Using cached data',
                    expiresAt: existingData.expires_at
                });
            }
        }

        // ===== NEW: Pre-warm Puppeteer cache in background =====
        // This runs async without blocking the response
        (async () => {
            try {
                const puppeteerCacheService = (await import('../services/puppeteerCacheService.js')).default;
                await puppeteerCacheService.prewarmUserDomainCache(userEmail, website_url);
                console.log(`✅ [Background] Pre-warmed Puppeteer cache for ${website_url}`);
            } catch (err) {
                console.error(`❌ [Background] Failed to pre-warm Puppeteer cache:`, err);
            }
        })();
        // ===== END NEW =====

        // Mark analysis as pending
        await supabase
            .from('health_score_cache')
            .upsert({
                user_email: userEmail,
                website_url,
                analysis_status: 'analyzing',
                last_analyzed_at: new Date()
            }, {
                onConflict: 'user_email,website_url'
            });

        // Here you would trigger your analysis services
        // This is a placeholder - integrate with your existing analysis logic
        const analysisStartTime = Date.now();
        
        try {
            // Example: Call your existing analysis services
            const [
                lighthouseResults,
                searchConsoleResults,
                analyticsResults
            ] = await Promise.allSettled([
                // Call your lighthouse analysis
                // analyzeLighthouse(website_url),
                // Call your search console analysis  
                // analyzeSearchConsole(website_url, userEmail),
                // Call your analytics analysis
                // analyzeAnalytics(website_url, userEmail)
            ]);

            // Calculate overall health score based on results
            const healthScore = calculateOverallHealthScore({
                lighthouse: lighthouseResults.value,
                searchConsole: searchConsoleResults.value,
                analytics: analyticsResults.value
            });

            // Store the results
            const storeResponse = await fetch(`${req.protocol}://${req.get('host')}/api/health-score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization
                },
                body: JSON.stringify({
                    ...healthScore,
                    website_url,
                    analysis_duration: Math.round((Date.now() - analysisStartTime) / 1000),
                    data_sources: ['lighthouse', 'search_console', 'analytics']
                })
            });

            if (!storeResponse.ok) {
                throw new Error('Failed to store analysis results');
            }

            res.json({
                success: true,
                message: 'Health score analysis completed',
                analysisTime: Math.round((Date.now() - analysisStartTime) / 1000)
            });

        } catch (analysisError) {
            console.error('Analysis error:', analysisError);
            
            // Update status to failed
            await supabase
                .from('health_score_cache')
                .update({
                    analysis_status: 'failed',
                    error_message: analysisError.message
                })
                .eq('user_email', userEmail)
                .eq('website_url', website_url);

            res.status(500).json({ 
                error: 'Analysis failed',
                details: analysisError.message 
            });
        }

    } catch (error) {
        console.error('Health score analysis error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete health score cache for a website
router.delete('/health-score/:website', async (req, res) => {
    try {
        const { website } = req.params;
        const userEmail = req.user?.email;

        if (!userEmail) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const websiteUrl = decodeURIComponent(website);

        const { error } = await supabase
            .from('health_score_cache')
            .delete()
            .eq('user_email', userEmail)
            .eq('website_url', websiteUrl);

        if (error) {
            console.error('Error deleting health score:', error);
            return res.status(500).json({ error: 'Failed to delete health score' });
        }

        res.json({
            success: true,
            message: 'Health score cache deleted'
        });

    } catch (error) {
        console.error('Health score delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cleanup expired cache entries (can be called via cron job)
router.post('/health-score/cleanup', async (req, res) => {
    try {
        const { data, error } = await supabase
            .rpc('cleanup_expired_health_scores');

        if (error) {
            console.error('Error cleaning up expired scores:', error);
            return res.status(500).json({ error: 'Cleanup failed' });
        }

        res.json({
            success: true,
            deletedCount: data,
            message: `Cleaned up ${data} expired health score entries`
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to calculate overall health score
function calculateOverallHealthScore({ lighthouse, searchConsole, analytics }) {
    // This is a sample calculation - adjust weights based on your needs
    const weights = {
        performance: 0.25,
        seo: 0.25,
        accessibility: 0.15,
        bestPractices: 0.15,
        traffic: 0.10,
        technical: 0.10
    };

    let scores = {
        performance: lighthouse?.performance || 0,
        seo: lighthouse?.seo || 0,
        accessibility: lighthouse?.accessibility || 0,
        bestPractices: lighthouse?.bestPractices || 0,
        traffic: calculateTrafficScore(analytics),
        technical: calculateTechnicalScore(lighthouse, searchConsole)
    };

    const overallScore = Math.round(
        Object.keys(weights).reduce((total, key) => {
            return total + (scores[key] * weights[key]);
        }, 0)
    );

    // Determine health grade
    let healthGrade = 'F';
    if (overallScore >= 97) healthGrade = 'A+';
    else if (overallScore >= 93) healthGrade = 'A';
    else if (overallScore >= 87) healthGrade = 'B+';
    else if (overallScore >= 83) healthGrade = 'B';
    else if (overallScore >= 77) healthGrade = 'C+';
    else if (overallScore >= 70) healthGrade = 'C';
    else if (overallScore >= 60) healthGrade = 'D';

    return {
        overall_health_score: overallScore,
        health_grade: healthGrade,
        ...scores,
        lighthouse_data: lighthouse,
        search_console_data: searchConsole,
        analytics_data: analytics
    };
}

function calculateTrafficScore(analytics) {
    // Placeholder - implement based on your analytics data
    return analytics?.traffic_score || 70;
}

function calculateTechnicalScore(lighthouse, searchConsole) {
    // Placeholder - implement based on technical factors
    let score = 70;
    if (lighthouse?.mobile_friendly) score += 10;
    if (lighthouse?.ssl_certificate) score += 10;
    if (searchConsole?.sitemap_exists) score += 5;
    if (searchConsole?.robots_txt_exists) score += 5;
    return Math.min(score, 100);
}

export default router;