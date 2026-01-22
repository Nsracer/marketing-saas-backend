import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.genAI = null;
    this.model = null;

    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      // Using gemini-flash-latest as it's the current available model
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    }
  }

  /**
   * Generate AI recommendations for improving user's site based on competitor analysis
   * @param {Object} yourSite - Your site data
   * @param {Object} competitorSite - Competitor site data
   * @param {Object} comparison - Comparison metrics
   * @returns {Promise<Array>} Array of 3 AI-generated recommendations
   */
  async generateRecommendations(yourSite, competitorSite, comparison) {
    if (!this.model) {
      console.warn('⚠️ Gemini API key not configured, using fallback recommendations');
      return this.getFallbackRecommendations();
    }

    // Try with retries
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Prepare the analysis data for the AI
        const analysisData = this.prepareAnalysisData(yourSite, competitorSite, comparison);

        // Create the prompt
        const prompt = this.buildPrompt(analysisData);

        console.log(`🤖 Generating AI recommendations with Gemini (attempt ${attempt}/${maxRetries})...`);

        // Generate content with timeout
        const result = await Promise.race([
          this.model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 30000)
          )
        ]);

        const response = await result.response;
        const text = response.text();

        console.log('✅ AI recommendations generated successfully');

        // Parse the response
        const recommendations = this.parseRecommendations(text);

        return recommendations;

      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, error.message);

        // Check if it's a 503 (overloaded) or timeout error
        if (error.status === 503 || error.message.includes('overloaded') || error.message.includes('timeout')) {
          if (attempt < maxRetries) {
            console.log(`⏳ Waiting 2 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }

        // For other errors, don't retry
        break;
      }
    }

    // If all retries failed, return fallback recommendations
    console.warn('⚠️ All AI generation attempts failed, using fallback recommendations');
    console.error('Last error:', lastError?.message);
    return this.getFallbackRecommendations();
  }

  /**
   * Prepare analysis data in a structured format for AI
   */
  prepareAnalysisData(yourSite, competitorSite, comparison) {
    return {
      yourSite: {
        domain: yourSite.domain,
        performance: yourSite.lighthouse?.categories?.performance?.displayValue || 0,
        seo: yourSite.lighthouse?.categories?.seo?.displayValue || 0,
        accessibility: yourSite.lighthouse?.categories?.accessibility?.displayValue || 0,
        bestPractices: yourSite.lighthouse?.categories?.['best-practices']?.displayValue || 0,
        pagespeedDesktop: yourSite.pagespeed?.desktop?.performanceScore || 0,
        pagespeedMobile: yourSite.pagespeed?.mobile?.performanceScore || 0,
        wordCount: yourSite.puppeteer?.content?.wordCount || 0,
        imageCount: yourSite.puppeteer?.content?.images?.total || 0,
        altTextCoverage: yourSite.puppeteer?.content?.images?.altCoverage || 0,
        totalLinks: yourSite.puppeteer?.content?.links?.total || 0,
        internalLinks: yourSite.puppeteer?.content?.links?.internal || 0,
        externalLinks: yourSite.puppeteer?.content?.links?.external || 0,
        h1Count: yourSite.puppeteer?.seo?.headings?.h1Count || 0,
        h2Count: yourSite.puppeteer?.seo?.headings?.h2Count || 0,
        hasMetaDescription: yourSite.puppeteer?.seo?.metaDescription ? true : false,
        totalBacklinks: yourSite.backlinks?.totalBacklinks || 0,
        refDomains: yourSite.backlinks?.totalRefDomains || 0,
        monthlyVisits: yourSite.traffic?.metrics?.monthlyVisits || 0,
        bounceRate: yourSite.traffic?.metrics?.bounceRate || 'N/A',
        frameworks: yourSite.puppeteer?.technology?.frameworks?.join(', ') || 'None detected',
        cms: yourSite.puppeteer?.technology?.cms || 'None detected',
        isHTTPS: yourSite.puppeteer?.security?.isHTTPS || false
      },
      competitor: {
        domain: competitorSite.domain,
        performance: competitorSite.lighthouse?.categories?.performance?.displayValue || 0,
        seo: competitorSite.lighthouse?.categories?.seo?.displayValue || 0,
        accessibility: competitorSite.lighthouse?.categories?.accessibility?.displayValue || 0,
        bestPractices: competitorSite.lighthouse?.categories?.['best-practices']?.displayValue || 0,
        pagespeedDesktop: competitorSite.pagespeed?.desktop?.performanceScore || 0,
        pagespeedMobile: competitorSite.pagespeed?.mobile?.performanceScore || 0,
        wordCount: competitorSite.puppeteer?.content?.wordCount || 0,
        imageCount: competitorSite.puppeteer?.content?.images?.total || 0,
        h1Count: competitorSite.puppeteer?.seo?.headings?.h1Count || 0,
        h2Count: competitorSite.puppeteer?.seo?.headings?.h2Count || 0,
        totalBacklinks: competitorSite.backlinks?.totalBacklinks || 0,
        refDomains: competitorSite.backlinks?.totalRefDomains || 0,
        monthlyVisits: competitorSite.traffic?.metrics?.monthlyVisits || 0,
        bounceRate: competitorSite.traffic?.metrics?.bounceRate || 'N/A',
        frameworks: competitorSite.puppeteer?.technology?.frameworks?.join(', ') || 'None detected',
        cms: competitorSite.puppeteer?.technology?.cms || 'None detected',
        isHTTPS: competitorSite.puppeteer?.security?.isHTTPS || false
      },
      gaps: {
        performanceGap: (yourSite.lighthouse?.categories?.performance?.displayValue || 0) - (competitorSite.lighthouse?.categories?.performance?.displayValue || 0),
        seoGap: (yourSite.lighthouse?.categories?.seo?.displayValue || 0) - (competitorSite.lighthouse?.categories?.seo?.displayValue || 0),
        backlinksGap: (yourSite.backlinks?.totalBacklinks || 0) - (competitorSite.backlinks?.totalBacklinks || 0),
        contentGap: (yourSite.puppeteer?.content?.wordCount || 0) - (competitorSite.puppeteer?.content?.wordCount || 0),
        trafficGap: (yourSite.traffic?.metrics?.monthlyVisits || 0) - (competitorSite.traffic?.metrics?.monthlyVisits || 0)
      },
      comparisonMetrics: comparison || {}
    };
  }

  /**
   * Build the prompt for Gemini AI
   */
  buildPrompt(data) {
    return `You are an expert SEO and web performance consultant. Analyze the following competitor analysis data and provide exactly 3 actionable recommendations for improving the user's website to outperform their competitor.

**User's Website: ${data.yourSite.domain}**
- Performance Score: ${data.yourSite.performance}/100
- SEO Score: ${data.yourSite.seo}/100
- Accessibility: ${data.yourSite.accessibility}/100
- Best Practices: ${data.yourSite.bestPractices}/100
- PageSpeed Desktop: ${data.yourSite.pagespeedDesktop}/100
- PageSpeed Mobile: ${data.yourSite.pagespeedMobile}/100
- Content: ${data.yourSite.wordCount} words, ${data.yourSite.h1Count} H1s, ${data.yourSite.h2Count} H2s
- Images: ${data.yourSite.imageCount} total, ${data.yourSite.altTextCoverage}% with alt text
- Links: ${data.yourSite.totalLinks} total (${data.yourSite.internalLinks} internal, ${data.yourSite.externalLinks} external)
- Backlinks: ${data.yourSite.totalBacklinks} from ${data.yourSite.refDomains} domains
- Meta Description: ${data.yourSite.hasMetaDescription ? 'Present' : 'Missing'}
- Monthly Visits: ${data.yourSite.monthlyVisits.toLocaleString()}
- Bounce Rate: ${data.yourSite.bounceRate}
- Technology Stack: ${data.yourSite.frameworks}
- CMS: ${data.yourSite.cms}
- HTTPS: ${data.yourSite.isHTTPS ? 'Yes' : 'No'}

**Competitor's Website: ${data.competitor.domain}**
- Performance Score: ${data.competitor.performance}/100
- SEO Score: ${data.competitor.seo}/100
- Accessibility: ${data.competitor.accessibility}/100
- Best Practices: ${data.competitor.bestPractices}/100
- PageSpeed Desktop: ${data.competitor.pagespeedDesktop}/100
- PageSpeed Mobile: ${data.competitor.pagespeedMobile}/100
- Content: ${data.competitor.wordCount} words, ${data.competitor.h1Count} H1s, ${data.competitor.h2Count} H2s
- Images: ${data.competitor.imageCount} total
- Backlinks: ${data.competitor.totalBacklinks} from ${data.competitor.refDomains} domains
- Monthly Visits: ${data.competitor.monthlyVisits.toLocaleString()}
- Bounce Rate: ${data.competitor.bounceRate}
- Technology Stack: ${data.competitor.frameworks}
- CMS: ${data.competitor.cms}
- HTTPS: ${data.competitor.isHTTPS ? 'Yes' : 'No'}

**Performance Gaps (Positive means you're ahead, Negative means competitor is ahead):**
- Performance: ${data.gaps.performanceGap > 0 ? '+' : ''}${data.gaps.performanceGap} points
- SEO: ${data.gaps.seoGap > 0 ? '+' : ''}${data.gaps.seoGap} points
- Backlinks: ${data.gaps.backlinksGap > 0 ? '+' : ''}${data.gaps.backlinksGap} backlinks
- Content: ${data.gaps.contentGap > 0 ? '+' : ''}${data.gaps.contentGap} words
- Traffic: ${data.gaps.trafficGap > 0 ? '+' : ''}${data.gaps.trafficGap.toLocaleString()} monthly visits

Provide exactly 3 recommendations in the following JSON format:
[
  {
    "title": "Short, actionable title (max 60 chars)",
    "impact": "High|Medium|Low",
    "effort": "High|Medium|Low",
    "description": "Brief description explaining why this matters (max 150 chars)",
    "steps": ["Step 1", "Step 2", "Step 3", "Step 4"]
  }
]

Rules:
1. Focus on the BIGGEST gaps and opportunities where the competitor is ahead
2. Prioritize recommendations by potential impact
3. Make recommendations specific and actionable with clear steps
4. Include technical details where relevant
5. Each recommendation should have 3-4 specific action steps
6. Return ONLY valid JSON, no markdown, no extra text
7. If user is already ahead in an area, suggest ways to maintain or extend the lead

Focus areas to consider:
- Page speed optimization if competitor is faster
- Content strategy if competitor has more comprehensive content
- Backlink building if competitor has more authority
- Technical SEO improvements
- Mobile optimization if mobile scores are low
- Accessibility improvements if needed`;
  }

  /**
   * Parse AI response into structured recommendations
   */
  parseRecommendations(text) {
    try {
      // Remove markdown code blocks if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\n?/g, '');
      }

      // Parse JSON
      const recommendations = JSON.parse(cleanText);

      // Validate structure
      if (!Array.isArray(recommendations) || recommendations.length !== 3) {
        throw new Error('Expected exactly 3 recommendations');
      }

      // Validate each recommendation has required fields
      recommendations.forEach((rec, index) => {
        if (!rec.title || !rec.impact || !rec.effort || !rec.description || !rec.steps) {
          throw new Error(`Recommendation ${index + 1} is missing required fields`);
        }
      });

      return recommendations;

    } catch (error) {
      console.error('❌ Error parsing AI recommendations:', error);
      console.log('Raw AI response:', text);

      // Return fallback recommendations if parsing fails
      return this.getFallbackRecommendations();
    }
  }

  /**
   * Fallback recommendations if AI fails
   */
  getFallbackRecommendations() {
    return [
      {
        title: "Optimize Page Load Speed",
        impact: "High",
        effort: "Medium",
        description: "Improve performance scores by optimizing images, minifying assets, and implementing caching strategies.",
        steps: [
          "Compress and convert images to WebP format",
          "Enable browser caching for static resources",
          "Minify CSS and JavaScript files",
          "Implement lazy loading for images"
        ]
      },
      {
        title: "Build High-Quality Backlinks",
        impact: "High",
        effort: "High",
        description: "Increase domain authority by acquiring backlinks from reputable websites in your industry.",
        steps: [
          "Create valuable, shareable content (guides, infographics)",
          "Reach out to industry publications for guest posting",
          "Get listed in relevant industry directories",
          "Build relationships with complementary businesses"
        ]
      },
      {
        title: "Enhance Content Depth and Structure",
        impact: "Medium",
        effort: "Medium",
        description: "Improve content quality with better structure, more depth, and proper heading hierarchy.",
        steps: [
          "Add comprehensive H2 and H3 headings throughout content",
          "Expand key pages with more detailed information",
          "Include FAQ sections to target long-tail keywords",
          "Add internal links to improve site architecture"
        ]
      }
    ];
  }
  /**
   * Generate chat response based on user message and context
   * @param {string} message - User's message
   * @param {string} context - Context from reports
   * @returns {Promise<string>} AI response
   */
  async generateChatResponse(message, context) {
    if (!this.model) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const prompt = `
You are a helpful AI business assistant for a SaaS platform.
Use the following context (reports and metrics) to answer the user's question.
If the answer is not in the context, use your general knowledge but mention that it's general advice.

CONTEXT:
${context}

USER QUESTION:
${message}

Please provide a concise, professional, and helpful answer.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('❌ Error generating chat response:', error);
      throw error;
    }
  }
}

export default new GeminiService();
