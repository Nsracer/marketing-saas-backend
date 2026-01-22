/**
 * Metrics Aggregator
 * Orchestrates all metric adapters to provide a unified data structure for AI analysis.
 */

import { createClient } from '@supabase/supabase-js';
import SEOMetricsAdapter from './adapters/SEOMetricsAdapter.js';
import SocialMetricsAdapter from './adapters/SocialMetricsAdapter.js';
import CompetitorMetricsAdapter from './adapters/CompetitorMetricsAdapter.js';
import TrafficMetricsAdapter from './adapters/TrafficMetricsAdapter.js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseClient = null;

const getSupabaseClient = () => {
    if (!supabaseClient) {
        supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
    }
    return supabaseClient;
};

class MetricsAggregator {
    constructor() {
        this.supabase = getSupabaseClient();
        this.seoAdapter = new SEOMetricsAdapter(this.supabase);
        this.socialAdapter = new SocialMetricsAdapter(this.supabase);
        this.competitorAdapter = new CompetitorMetricsAdapter(this.supabase);
        this.trafficAdapter = new TrafficMetricsAdapter(this.supabase);
    }

    /**
     * Aggregate all metrics for a user.
     * @param {string} userEmail - The user's email.
     * @returns {Promise<Object>} Aggregated metrics report.
     */
    async aggregateAll(userEmail) {
        try {
            // Get user ID
            const { data: userData, error: userError } = await this.supabase
                .from('users_table')
                .select('id, plan')
                .eq('email', userEmail)
                .single();

            if (userError || !userData) {
                console.error('MetricsAggregator: User not found:', userEmail);
                return {
                    success: false,
                    error: 'User not found',
                    userPlan: 'starter',
                    allMetrics: [],
                    categories: {}
                };
            }

            const userId = userData.id;
            const userPlan = userData.plan || 'starter';

            console.log(`📊 MetricsAggregator: Fetching metrics for ${userEmail} (${userPlan})`);

            // Fetch all metrics in parallel
            const [seoResult, socialResult, competitorResult, trafficResult] = await Promise.all([
                this.seoAdapter.getMetrics(userId),
                this.socialAdapter.getMetrics(userEmail),
                this.competitorAdapter.getMetrics(userId),
                this.trafficAdapter.getMetrics(userId)
            ]);

            // Combine all metrics into a single array
            const allMetrics = [];
            const categories = {
                seo: { available: false, metricsCount: 0 },
                social: { available: false, metricsCount: 0 },
                competitor: { available: false, metricsCount: 0 },
                traffic: { available: false, metricsCount: 0 }
            };

            if (seoResult?.available) {
                allMetrics.push(...seoResult.metrics);
                categories.seo = { available: true, metricsCount: seoResult.metrics.length, domain: seoResult.domain };
            }

            if (socialResult?.available) {
                allMetrics.push(...socialResult.metrics);
                categories.social = { available: true, metricsCount: socialResult.metrics.length, platforms: socialResult.activePlatforms };
            }

            if (competitorResult?.available) {
                allMetrics.push(...competitorResult.metrics);
                categories.competitor = { available: true, metricsCount: competitorResult.metrics.length, domains: competitorResult.competitorDomains };
            }

            if (trafficResult?.available) {
                allMetrics.push(...trafficResult.metrics);
                categories.traffic = { available: true, metricsCount: trafficResult.metrics.length };
            }

            // Identify critical issues (metrics with 'critical' status)
            const criticalIssues = allMetrics.filter(m => m.status === 'critical');

            // Identify warnings
            const warnings = allMetrics.filter(m => m.status === 'warning');

            // Identify strengths (metrics with 'good' status)
            const strengths = allMetrics.filter(m => m.status === 'good');

            console.log(`📊 MetricsAggregator: Found ${allMetrics.length} metrics (${criticalIssues.length} critical, ${warnings.length} warnings, ${strengths.length} good)`);

            return {
                success: true,
                userEmail,
                userPlan,
                userId,
                allMetrics,
                categories,
                summary: {
                    totalMetrics: allMetrics.length,
                    criticalIssues,
                    warnings,
                    strengths,
                    availableCategories: Object.entries(categories).filter(([_, v]) => v.available).map(([k]) => k)
                },
                rawData: {
                    seo: seoResult?.rawData || null,
                    social: socialResult?.rawData || null,
                    competitor: competitorResult?.rawData || null,
                    traffic: trafficResult?.rawData || null
                }
            };

        } catch (error) {
            console.error('MetricsAggregator: Error aggregating metrics:', error);
            return {
                success: false,
                error: error.message,
                userPlan: 'starter',
                allMetrics: [],
                categories: {}
            };
        }
    }

    /**
     * Build a concise summary for AI prompt.
     * @param {Object} aggregatedData - Result from aggregateAll.
     * @returns {string} Formatted summary for AI.
     */
    buildAISummary(aggregatedData) {
        if (!aggregatedData.success || aggregatedData.allMetrics.length === 0) {
            return 'NO DATA AVAILABLE. The user has not connected any data sources.';
        }

        let summary = '';

        // Group by category
        const byCat = {};
        for (const m of aggregatedData.allMetrics) {
            const cat = m.category || 'Other';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(m);
        }

        for (const [category, metrics] of Object.entries(byCat)) {
            summary += `\n## ${category}\n`;
            for (const m of metrics) {
                const statusIcon = m.status === 'critical' ? '🔴' : m.status === 'warning' ? '🟡' : m.status === 'good' ? '🟢' : '⚪';
                summary += `${statusIcon} ${m.name}: ${m.value}${m.unit ? m.unit : ''} - ${m.context}\n`;
            }
        }

        // Highlight critical issues
        if (aggregatedData.summary.criticalIssues.length > 0) {
            summary += `\n## CRITICAL ISSUES (Require Immediate Attention)\n`;
            for (const c of aggregatedData.summary.criticalIssues) {
                summary += `- ${c.name}: ${c.value}${c.unit || ''} - ${c.context}\n`;
            }
        }

        return summary;
    }
}

export default new MetricsAggregator();
