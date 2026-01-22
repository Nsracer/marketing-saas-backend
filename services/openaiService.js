import OpenAI from 'openai';

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI;
    this.client = null;

    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey
      });
    }
  }

  /**
   * Generate AI recommendations for improving user's site based on competitor analysis
   * @param {Object} yourSite - Your site data
   * @param {Object} competitorSite - Competitor site data
   * @param {Object} comparison - Comparison metrics
   * @param {number} count - Number of recommendations to generate (3 for Growth, 5 for Pro)
   * @returns {Promise<Array>} Array of AI-generated recommendations
   */
  async generateRecommendations(yourSite, competitorSite, comparison, count = 3) {
    if (!this.client) {
      console.warn('⚠️ OpenAI API key not configured, using fallback recommendations');
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
        const prompt = this.buildPrompt(analysisData, count);

        console.log(`🤖 Generating AI recommendations with OpenAI (attempt ${attempt}/${maxRetries})...`);

        // Generate content with timeout
        const completion = await Promise.race([
          this.client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert SEO and web performance consultant. Provide actionable recommendations in valid JSON format only."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 2000
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 30000)
          )
        ]);

        const text = completion.choices[0].message.content;

        console.log('✅ AI recommendations generated successfully');

        // Parse the response
        const recommendations = this.parseRecommendations(text);

        return recommendations;

      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, error.message);

        // Check if it's a rate limit or timeout error
        if (error.status === 429 || error.message.includes('timeout')) {
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
   * Build the prompt for OpenAI
   */
  buildPrompt(data, count = 3) {
    return `You are an expert SEO and web performance consultant. Analyze the following competitor analysis data and provide exactly ${count} actionable recommendations for improving the user's website to outperform their competitor.

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

      // Validate structure (flexible count)
      if (!Array.isArray(recommendations) || recommendations.length < 3) {
        throw new Error(`Expected at least 3 recommendations, got ${recommendations.length}`);
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
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI business assistant for a SaaS platform. Use the provided context (reports and metrics) to answer questions. If the answer is not in the context, use your general knowledge but mention that it's general advice."
          },
          {
            role: "user",
            content: `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}\n\nPlease provide a concise, professional, and helpful answer.`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('❌ Error generating chat response:', error);
      throw error;
    }
  }

  /**
   * Generate enhanced chat response with conversation history and rich context
   * @param {string} message - User's current message
   * @param {string} context - Rich context from reports and metrics
   * @param {Array} conversationHistory - Previous conversation messages
   * @param {string} userEmail - User's email for personalization
   * @returns {Promise<string>} AI response
   */
  async generateEnhancedChatResponse(message, context, conversationHistory = [], userEmail = '') {
    // Re-initialize client if not available (in case env vars loaded after construction)
    if (!this.client && process.env.OPENAI) {
      this.apiKey = process.env.OPENAI;
      this.client = new OpenAI({
        apiKey: this.apiKey
      });
    }

    if (!this.client) {
      throw new Error('OpenAI API key not configured. Please add your OPENAI API key to the environment variables.');
    }

    try {
      console.log(`🤖 Generating enhanced chat response for: "${message.substring(0, 50)}..."`);

      // Build messages array with system prompt, context, history, and current message
      const messages = [
        {
          role: "system",
          content: this.buildEnhancedSystemPrompt()
        },
        {
          role: "system",
          content: `BUSINESS INTELLIGENCE CONTEXT:\n${context}\n\nUser Email: ${userEmail || 'Anonymous'}`
        }
      ];

      // Add conversation history (last 6 messages to keep context manageable)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-6);
        messages.push(...recentHistory);
      }

      // Add current user message
      messages.push({
        role: "user",
        content: message
      });

      // Generate response with timeout
      const completion = await Promise.race([
        this.client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messages,
          temperature: 0.8,
          max_tokens: 1500,
          presence_penalty: 0.6,
          frequency_penalty: 0.3
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]);

      const response = completion.choices[0].message.content;
      console.log(`✅ Enhanced chat response generated (${response.length} chars)`);

      return response;

    } catch (error) {
      console.error('❌ Error generating enhanced chat response:', error);
      
      // Provide helpful error messages
      if (error.status === 429) {
        throw new Error('OpenAI rate limit reached. Please try again in a moment.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Request took too long. Please try a simpler question.');
      } else if (error.status === 401) {
        throw new Error('OpenAI API key is invalid. Please check your configuration.');
      }
      
      throw new Error(`AI service error: ${error.message}`);
    }
  }

  /**
   * Build enhanced system prompt for the chatbot
   */
  buildEnhancedSystemPrompt() {
    return `You are an expert AI Business Intelligence Assistant for a comprehensive SaaS analytics platform. Your role is to help users understand their business metrics, identify growth opportunities, and provide actionable insights.

🎯 YOUR CAPABILITIES:
- Analyze SEO performance, website speed, and technical issues
- Interpret social media metrics across Facebook, Instagram, and LinkedIn
- Provide competitor intelligence and gap analysis
- Explain traffic patterns and user behavior
- Offer strategic recommendations for business growth
- Answer questions about digital marketing, SEO, and online presence

💡 YOUR PERSONALITY:
- Professional yet friendly and approachable
- Data-driven but explain insights in simple terms
- Proactive in suggesting improvements
- Encouraging and supportive
- Use emojis sparingly to enhance readability (1-2 per response max)

📋 RESPONSE GUIDELINES:
1. **Be Specific**: Reference actual metrics from the context when available
2. **Be Actionable**: Provide concrete steps users can take
3. **Be Concise**: Keep responses focused and scannable (use bullet points when listing multiple items)
4. **Be Contextual**: If data is missing, acknowledge it and offer general advice
5. **Be Insightful**: Don't just repeat numbers - explain what they mean and why they matter
6. **Be Conversational**: Remember previous messages in the conversation
7. **Be Honest**: If you don't have specific data, say so clearly

🚫 AVOID:
- Overly technical jargon without explanation
- Generic advice that doesn't use the provided context
- Extremely long responses (aim for 150-300 words unless more detail is requested)
- Making up metrics or data that isn't in the context
- Being overly formal or robotic

✨ SPECIAL FEATURES:
- When discussing scores, mention if they're good/bad and why
- When identifying issues, prioritize by impact
- When suggesting improvements, explain expected outcomes
- When comparing to competitors, be specific about gaps
- Offer to dive deeper into any topic if the user wants more details

Remember: Your goal is to empower users with insights that drive real business growth!`;
  }
}

export default new OpenAIService();
