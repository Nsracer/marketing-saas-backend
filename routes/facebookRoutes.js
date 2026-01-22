import express from 'express';
import axios from 'axios';
const router = express.Router();
import dotenv from 'dotenv';
dotenv.config();
// Facebook OAuth endpoints
const FB_APP_ID = process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FB_REDIRECT_URI = `${process.env.FRONTEND_URL || 'https://saas-frontend-o2cx.onrender.com'}/api/auth/facebook/callback`;
const FB_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'read_insights'
].join(',');

// Step 1: Redirect to Facebook OAuth
router.get('/auth/facebook', (req, res) => {
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&scope=${FB_SCOPES}&response_type=code&state=xyz`;
  res.redirect(authUrl);
});

// Step 2: Handle Facebook OAuth callback
router.get('/auth/facebook/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ success: false, message: 'No code provided' });
  }
  try {
    // Exchange code for access token
    const tokenResp = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: FB_REDIRECT_URI,
        code
      }
    });
    const accessToken = tokenResp.data.access_token;
    // Optionally, fetch user profile
    const profileResp = await axios.get('https://graph.facebook.com/me', {
      params: {
        access_token: accessToken,
        fields: 'id,name,email,picture'
      }
    });
    // You may want to store accessToken in DB/session for the user
    // For now, just send it back (not secure for production)
    res.json({ success: true, accessToken, profile: profileResp.data });
  } catch (err) {
    console.error('Facebook OAuth error:', err?.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Failed to authenticate with Facebook' });
  }
});

// Helpers
function normalizeTimeframe(timeframe) {
  switch (timeframe) {
    case '7d': return { sinceDays: 7 };
    case '90d': return { sinceDays: 90 };
    case '28d':
    default: return { sinceDays: 28 };
  }
}

// GET /api/facebook/performance?email=&pageId=&timeframe=28d&contentType=all
router.get('/performance', async (req, res) => {
  const { email, pageId, timeframe = '28d', contentType = 'all', access_token } = req.query;
  if (!email || !pageId) {
    return res.status(400).json({ success: false, message: 'email and pageId are required' });
  }

  // For MVP: accept token via header or query to avoid full OAuth setup
  const fbToken = req.headers['x-fb-token'] || access_token;
  if (!fbToken) {
    return res.json({ success: false, requiresConnection: true, message: 'Provide Facebook Page Access Token (x-fb-token header) or connect OAuth' });
  }

  try {
    const { sinceDays } = normalizeTimeframe(timeframe);
    const since = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);

    // Basic page info
    const pageFields = 'followers_count,name';
    const pageInfoResp = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: { fields: pageFields, access_token: fbToken },
    });

    // Posts filtered by type if needed (graph uses different types, we coarse-map)
    const postsResp = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/posts`, {
      params: {
        since,
        limit: 50,
        fields: 'id,created_time,message,permalink_url,full_picture,status_type',
        access_token: fbToken,
      },
    });

    let posts = Array.isArray(postsResp.data.data) ? postsResp.data.data : [];

    // Filter by contentType (coarse mapping)
    if (contentType && contentType !== 'all') {
      const map = {
        video: ['added_video','shared_story'],
        image: ['added_photos'],
        link: ['shared_story','mobile_status_update'],
        text: ['mobile_status_update']
      };
      const allowed = map[contentType] || [];
      posts = posts.filter(p => allowed.includes(p.status_type));
    }

    // Fetch insights per post (batch)
    const metricsPerPost = await Promise.all(posts.map(async (p) => {
      try {
        const ins = await axios.get(`https://graph.facebook.com/v18.0/${p.id}/insights`, {
          params: {
            metric: 'post_impressions,post_engaged_users,post_reactions_by_type_total,post_video_views',
            period: 'lifetime',
            access_token: fbToken,
          },
        });
        // Simplify values
        const reduceMetric = (arr, name) => (arr.find(m => m.name === name)?.values?.[0]?.value) || 0;
        const v = ins.data.data || [];
        const impressions = reduceMetric(v, 'post_impressions') || 0;
        const engaged = reduceMetric(v, 'post_engaged_users') || 0;
        const reactions = reduceMetric(v, 'post_reactions_by_type_total') || {};
        const videoViews = reduceMetric(v, 'post_video_views') || 0;
        const likes = reactions.like || 0;
        const comments = 0; // Comments require extra query; keep minimal for MVP
        const shares = 0; // Shares require extra query; can be added later
        const engagementRate = impressions ? (engaged / impressions) : 0;
        return {
          id: p.id,
          publishedAt: p.created_time,
          type: contentType || 'all',
          permalink: p.permalink_url,
          message: p.message,
          mediaUrl: p.full_picture,
          metrics: { impressions, likes, comments, shares, videoViews, engagementRate },
        };
      } catch (e) {
        return null;
      }
    }));

    const topPosts = metricsPerPost.filter(Boolean).sort((a, b) => (b.metrics.engagementRate || 0) - (a.metrics.engagementRate || 0)).slice(0, 5);

    // Engagement score: normalized by simple heuristic for MVP
    const totalLikes = topPosts.reduce((s, p) => s + (p.metrics.likes || 0), 0);
    const totalComments = topPosts.reduce((s, p) => s + (p.metrics.comments || 0), 0);
    const totalShares = topPosts.reduce((s, p) => s + (p.metrics.shares || 0), 0);
    const rawScore = totalLikes * 1 + totalComments * 2 + totalShares * 3;
    const score = Math.min(100, Math.round((rawScore / (pageInfoResp.data.followers_count || 1)) * 100));

    // Follower growth (approximation: requires historical snapshot; return single point for now)
    const followerGrowth = [{ date: new Date().toISOString().slice(0, 10), followers: pageInfoResp.data.followers_count || 0, delta: 0 }];

    return res.json({
      success: true,
      data: {
        engagement: { score, likes: totalLikes, comments: totalComments, shares: totalShares, industryAverageScore: 50 },
        followerGrowth,
        topPosts,
        competitors: [], // FB API does not allow competitor insights; keep empty
        reputation: [{ platform: 'facebook', rating: undefined }],
      }
    });
  } catch (err) {
    console.error('Facebook performance error:', err?.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch Facebook metrics' });
  }
});

export default router;
