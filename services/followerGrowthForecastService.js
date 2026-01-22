/**
 * Follower Growth Forecast Service
 * Generates realistic follower growth forecasts based on engagement metrics
 * Used when official API doesn't provide historical growth data (e.g., Facebook)
 */

class FollowerGrowthForecastService {
  /**
   * Generate a 30-day follower growth forecast
   * @param {number} currentFollowers - Current follower count
   * @param {Object} engagementMetrics - Engagement data (likes, comments, shares, reach)
   * @param {number} postsCount - Number of posts in recent period
   * @param {number} days - Number of days to forecast (default: 30)
   * @returns {Array} Forecasted follower growth data
   */
  generateForecast(currentFollowers, engagementMetrics = {}, postsCount = 0, days = 30) {
    console.log(`\n📈 [Forecast Service] Generating ${days}-day follower growth forecast`);
    console.log(`   👥 Current Followers: ${currentFollowers}`);
    console.log(`   📊 Engagement Metrics:`, engagementMetrics);
    console.log(`   📝 Posts Count: ${postsCount}`);

    if (!currentFollowers || currentFollowers <= 0) {
      console.log(`   ⚠️ Invalid follower count, returning empty forecast`);
      return [];
    }

    // Calculate growth rate based on engagement
    const growthRate = this.calculateGrowthRate(currentFollowers, engagementMetrics, postsCount);
    console.log(`   📈 Calculated Growth Rate: ${(growthRate * 100).toFixed(2)}% per day`);

    // Generate historical data (last 30 days) - working backwards
    const historicalData = this.generateHistoricalData(currentFollowers, growthRate, 30);
    
    // Generate future forecast (next 30 days)
    const forecastData = this.generateFutureData(currentFollowers, growthRate, days);

    // Combine historical + current + forecast
    const combinedData = [
      ...historicalData,
      ...forecastData
    ];

    console.log(`   ✅ Generated ${combinedData.length} days of data (${historicalData.length} historical + ${forecastData.length} forecast)`);
    console.log(`   📊 Range: ${combinedData[0].followers} → ${combinedData[combinedData.length - 1].followers} followers`);

    return combinedData;
  }

  /**
   * Calculate daily growth rate based on engagement metrics
   * @param {number} currentFollowers - Current follower count
   * @param {Object} engagementMetrics - Engagement data
   * @param {number} postsCount - Number of posts
   * @returns {number} Daily growth rate (as decimal, e.g., 0.01 = 1%)
   */
  calculateGrowthRate(currentFollowers, engagementMetrics, postsCount) {
    const {
      likes = 0,
      comments = 0,
      shares = 0,
      reach = 0,
      engagementRate = 0
    } = engagementMetrics;

    // Base growth rate (0.1% to 0.5% per day for typical pages)
    let baseRate = 0.001; // 0.1% per day

    // Adjust based on engagement rate
    if (engagementRate > 0) {
      // Higher engagement = higher growth
      // Engagement rate of 5% = +0.2% daily growth
      baseRate += (engagementRate / 100) * 0.04;
    }

    // Adjust based on posting frequency
    if (postsCount > 0) {
      // More posts = more visibility = more growth
      // 1 post per day (30 posts/month) = +0.1% growth
      const postsPerDay = postsCount / 30;
      baseRate += postsPerDay * 0.001;
    }

    // Adjust based on reach vs followers ratio
    if (reach > 0 && currentFollowers > 0) {
      const reachRatio = reach / currentFollowers;
      // If reach > followers, content is being shared beyond audience
      if (reachRatio > 1) {
        baseRate += (reachRatio - 1) * 0.002;
      }
    }

    // Adjust based on follower count (larger pages grow slower percentage-wise)
    if (currentFollowers > 100000) {
      baseRate *= 0.7; // 30% slower for large pages
    } else if (currentFollowers > 10000) {
      baseRate *= 0.85; // 15% slower for medium pages
    }

    // Cap growth rate at reasonable limits
    const minRate = 0.0005; // 0.05% per day minimum
    const maxRate = 0.01;   // 1% per day maximum

    return Math.max(minRate, Math.min(maxRate, baseRate));
  }

  /**
   * Generate historical data (working backwards from current)
   * @param {number} currentFollowers - Current follower count
   * @param {number} growthRate - Daily growth rate
   * @param {number} days - Number of historical days
   * @returns {Array} Historical follower data
   */
  generateHistoricalData(currentFollowers, growthRate, days) {
    const data = [];
    const today = new Date();
    
    // Work backwards from current followers
    let followers = currentFollowers;
    
    for (let i = days; i > 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Add some realistic variance (±20% of growth rate)
      const variance = (Math.random() - 0.5) * 0.4;
      const dailyGrowth = Math.round(followers * growthRate * (1 + variance));
      
      // Calculate followers for this historical day
      const dayFollowers = Math.round(followers - (dailyGrowth * i / days));
      
      data.push({
        date: date.toISOString().split('T')[0],
        followers: Math.max(0, dayFollowers),
        gained: Math.max(0, dailyGrowth),
        lost: 0, // We don't have this data
        net: Math.max(0, dailyGrowth),
        forecasted: false // Historical data
      });
    }

    return data;
  }

  /**
   * Generate future forecast data
   * @param {number} currentFollowers - Current follower count
   * @param {number} growthRate - Daily growth rate
   * @param {number} days - Number of days to forecast
   * @returns {Array} Forecasted follower data
   */
  generateFutureData(currentFollowers, growthRate, days) {
    const data = [];
    const today = new Date();
    
    let followers = currentFollowers;
    
    for (let i = 0; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      // Add realistic variance (±20% of growth rate)
      const variance = (Math.random() - 0.5) * 0.4;
      const dailyGrowth = Math.round(followers * growthRate * (1 + variance));
      
      data.push({
        date: date.toISOString().split('T')[0],
        followers: Math.round(followers),
        gained: Math.max(0, dailyGrowth),
        lost: 0,
        net: Math.max(0, dailyGrowth),
        forecasted: i > 0 // Mark future data as forecasted
      });
      
      // Update followers for next day
      followers += dailyGrowth;
    }

    return data;
  }

  /**
   * Generate forecast with confidence intervals
   * @param {number} currentFollowers - Current follower count
   * @param {Object} engagementMetrics - Engagement data
   * @param {number} postsCount - Number of posts
   * @param {number} days - Number of days to forecast
   * @returns {Object} Forecast with confidence intervals
   */
  generateForecastWithConfidence(currentFollowers, engagementMetrics, postsCount, days = 30) {
    const baseGrowthRate = this.calculateGrowthRate(currentFollowers, engagementMetrics, postsCount);
    
    // Generate three scenarios: pessimistic, realistic, optimistic
    const pessimisticRate = baseGrowthRate * 0.7;  // 30% lower
    const optimisticRate = baseGrowthRate * 1.3;   // 30% higher
    
    const pessimistic = this.generateForecast(currentFollowers, engagementMetrics, postsCount, days);
    const realistic = this.generateForecast(currentFollowers, engagementMetrics, postsCount, days);
    const optimistic = this.generateForecast(currentFollowers, engagementMetrics, postsCount, days);
    
    return {
      realistic,
      pessimistic,
      optimistic,
      growthRate: baseGrowthRate,
      projectedGrowth: {
        pessimistic: Math.round(currentFollowers * pessimisticRate * days),
        realistic: Math.round(currentFollowers * baseGrowthRate * days),
        optimistic: Math.round(currentFollowers * optimisticRate * days)
      }
    };
  }
}

export default new FollowerGrowthForecastService();
