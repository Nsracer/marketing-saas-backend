import openaiService from './openaiService.js';
import aiInsightsService from './aiInsightsService.js';

class ChatService {
    constructor() {
        // Store conversation history per user (in-memory for now)
        this.conversationHistory = new Map();
        this.MAX_HISTORY = 10; // Keep last 10 messages per user
    }

    /**
     * Process a chat message with enhanced context and conversation history
     * @param {string} userEmail
     * @param {string} message
     * @param {Array} conversationHistory - Optional conversation history from frontend
     * @returns {Promise<string>}
     */
    async chat(userEmail, message, conversationHistory = null) {
        try {
            console.log(`💬 Processing chat for ${userEmail}: "${message.substring(0, 50)}..."`);

            // 1. Gather comprehensive context from all reports (handle errors gracefully)
            let metrics = {};
            try {
                metrics = await aiInsightsService.gatherAllMetrics(userEmail);
            } catch (metricsError) {
                console.log(`⚠️ Could not gather metrics for ${userEmail}: ${metricsError.message}`);
                console.log('   Continuing with general assistance mode...');
                // Continue without metrics - AI can still provide general advice
            }

            // 2. Format rich context with insights
            const context = this.formatEnhancedContext(metrics);

            // 3. Get or initialize conversation history
            let history = conversationHistory || this.getConversationHistory(userEmail);

            // 4. Get intelligent response from OpenAI
            const response = await openaiService.generateEnhancedChatResponse(
                message,
                context,
                history,
                userEmail
            );

            // 5. Update conversation history
            this.updateConversationHistory(userEmail, message, response);

            return response;
        } catch (error) {
            console.error('❌ Chat service error:', error);
            throw error;
        }
    }

    /**
     * Get conversation history for a user
     */
    getConversationHistory(userEmail) {
        if (!this.conversationHistory.has(userEmail)) {
            this.conversationHistory.set(userEmail, []);
        }
        return this.conversationHistory.get(userEmail);
    }

    /**
     * Update conversation history
     */
    updateConversationHistory(userEmail, userMessage, assistantMessage) {
        const history = this.getConversationHistory(userEmail);

        history.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: assistantMessage }
        );

        // Keep only last N messages
        if (history.length > this.MAX_HISTORY * 2) {
            history.splice(0, history.length - (this.MAX_HISTORY * 2));
        }

        this.conversationHistory.set(userEmail, history);
    }

    /**
     * Clear conversation history for a user
     */
    clearHistory(userEmail) {
        this.conversationHistory.delete(userEmail);
    }

    /**
     * Format enhanced context with detailed metrics and insights
     */
    formatEnhancedContext(metrics) {
        let context = "📊 COMPREHENSIVE BUSINESS INTELLIGENCE DASHBOARD\n";
        context += "=".repeat(60) + "\n\n";

        // SEO & Performance Metrics
        if (metrics.seo) {
            context += "🔍 SEO & PERFORMANCE ANALYSIS\n";
            context += "-".repeat(40) + "\n";
            context += `Performance Score: ${metrics.seo.performanceScore}/100 ${this.getScoreEmoji(metrics.seo.performanceScore)}\n`;
            context += `SEO Score: ${metrics.seo.seoScore}/100 ${this.getScoreEmoji(metrics.seo.seoScore)}\n`;
            context += `Accessibility: ${metrics.seo.accessibilityScore || 'N/A'}/100\n`;
            context += `Best Practices: ${metrics.seo.bestPracticesScore || 'N/A'}/100\n`;

            if (metrics.seo.issues && metrics.seo.issues.length > 0) {
                context += `\n⚠️ Critical Issues Found: ${metrics.seo.issues.length}\n`;
                metrics.seo.issues.slice(0, 3).forEach((issue, i) => {
                    context += `  ${i + 1}. ${issue.title || issue}\n`;
                });
            }

            if (metrics.seo.opportunities && metrics.seo.opportunities.length > 0) {
                context += `\n💡 Optimization Opportunities: ${metrics.seo.opportunities.length}\n`;
            }
            context += "\n";
        }

        // Social Media Metrics
        if (metrics.social) {
            context += "📱 SOCIAL MEDIA PERFORMANCE\n";
            context += "-".repeat(40) + "\n";

            if (metrics.social.platforms && Array.isArray(metrics.social.platforms) && metrics.social.platforms.length > 0) {
                context += `Active Platforms: ${metrics.social.platforms.join(', ')}\n`;
            }

            if (metrics.social.facebook) {
                context += `\n📘 Facebook:\n`;
                context += `  - Followers: ${this.formatNumber(metrics.social.facebook.followers)}\n`;
                context += `  - Engagement Rate: ${metrics.social.facebook.engagementRate || 'N/A'}%\n`;
                context += `  - Recent Posts: ${metrics.social.facebook.recentPosts || 0}\n`;
            }

            if (metrics.social.instagram) {
                context += `\n📸 Instagram:\n`;
                context += `  - Followers: ${this.formatNumber(metrics.social.instagram.followers)}\n`;
                context += `  - Engagement Rate: ${metrics.social.instagram.engagementRate || 'N/A'}%\n`;
                context += `  - Recent Posts: ${metrics.social.instagram.recentPosts || 0}\n`;
            }

            if (metrics.social.linkedin) {
                context += `\n💼 LinkedIn:\n`;
                context += `  - Followers: ${this.formatNumber(metrics.social.linkedin.followers)}\n`;
                context += `  - Engagement Rate: ${metrics.social.linkedin.engagementRate || 'N/A'}%\n`;
                context += `  - Recent Posts: ${metrics.social.linkedin.recentPosts || 0}\n`;
            }

            context += `\nOverall Activity Level: ${metrics.social.overallActivity || 'Moderate'}\n\n`;
        }

        // Competitor Intelligence
        if (metrics.competitor) {
            context += "🎯 COMPETITOR INTELLIGENCE\n";
            context += "-".repeat(40) + "\n";

            if (metrics.competitor.competitors && metrics.competitor.competitors.length > 0) {
                context += `Tracking ${metrics.competitor.competitors.length} Competitors:\n`;
                metrics.competitor.competitors.forEach((comp, i) => {
                    context += `  ${i + 1}. ${comp}\n`;
                });
            }

            context += `Total Analyses Completed: ${metrics.competitor.totalAnalyses || 0}\n`;

            if (metrics.competitor.insights) {
                context += `\n📈 Key Insights:\n`;
                if (metrics.competitor.insights.performanceGap) {
                    context += `  - Performance Gap: ${metrics.competitor.insights.performanceGap}\n`;
                }
                if (metrics.competitor.insights.contentGap) {
                    context += `  - Content Gap: ${metrics.competitor.insights.contentGap}\n`;
                }
                if (metrics.competitor.insights.backlinksGap) {
                    context += `  - Backlinks Gap: ${metrics.competitor.insights.backlinksGap}\n`;
                }
            }
            context += "\n";
        }

        // Traffic & Analytics
        if (metrics.traffic) {
            context += "📊 TRAFFIC & ANALYTICS\n";
            context += "-".repeat(40) + "\n";
            context += `Monthly Visits: ${this.formatNumber(metrics.traffic.monthlyVisits)}\n`;
            context += `Bounce Rate: ${metrics.traffic.bounceRate}%\n`;
            context += `Avg. Session Duration: ${metrics.traffic.avgSessionDuration || 'N/A'}\n`;
            context += `Pages per Session: ${metrics.traffic.pagesPerSession || 'N/A'}\n`;

            if (metrics.traffic.topPages) {
                context += `\n🔝 Top Performing Pages:\n`;
                metrics.traffic.topPages.slice(0, 3).forEach((page, i) => {
                    context += `  ${i + 1}. ${page.path} (${this.formatNumber(page.views)} views)\n`;
                });
            }
            context += "\n";
        }

        // Business Information
        if (metrics.business) {
            context += "🏢 BUSINESS PROFILE\n";
            context += "-".repeat(40) + "\n";
            context += `Company: ${metrics.business.name || 'N/A'}\n`;
            context += `Industry: ${metrics.business.industry || 'N/A'}\n`;
            context += `Website: ${metrics.business.website || 'N/A'}\n`;
            context += `Target Audience: ${metrics.business.targetAudience || 'N/A'}\n\n`;
        }

        // If no data available
        if (!metrics.seo && !metrics.social && !metrics.competitor && !metrics.traffic && !metrics.business) {
            context += "ℹ️ No specific report data available yet.\n";
            context += "I can still help with general business, marketing, and SEO advice!\n\n";
        }

        context += "=".repeat(60) + "\n";
        context += "💡 I'm here to help you understand these metrics, identify opportunities,\n";
        context += "   and provide actionable recommendations for growth!\n";

        return context;
    }

    /**
     * Get emoji based on score
     */
    getScoreEmoji(score) {
        if (score >= 90) return "🟢";
        if (score >= 70) return "🟡";
        if (score >= 50) return "🟠";
        return "🔴";
    }

    /**
     * Format numbers with commas
     */
    formatNumber(num) {
        if (!num && num !== 0) return 'N/A';
        return num.toLocaleString();
    }
}

export default new ChatService();
