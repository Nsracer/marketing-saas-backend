# Render Deployment Guide for Lighthouse & Puppeteer

## Overview
This guide will help you deploy the backend with Lighthouse and Puppeteer support on Render.

## Prerequisites
- Render account
- GitHub repository connected to Render

## Environment Configuration

### Required Environment Variables

Add these environment variables in your Render dashboard:

```bash
# Node Configuration
NODE_ENV=production
PORT=10000

# Your existing variables
# Add all your API keys, database URLs, etc.
```

**Note**: Chrome/Chromium is now automatically bundled with the application via `@sparticuz/chromium` package. No manual Chrome installation needed!

## Render Service Configuration

### 1. Build Command
```bash
npm install
```

### 2. Start Command
```bash
npm run start:optimized
```

### 3. Health Check Path
```
/api/health
```

### 4. Instance Type
- **Recommended**: At least **1 GB RAM** (Standard plan)
- **Minimum**: 512 MB RAM (Starter plan) - may experience timeouts
- Lighthouse and Puppeteer are memory-intensive
- Using @sparticuz/chromium optimized for serverless environments

### 5. Advanced Settings

#### Auto-Deploy
- Enable auto-deploy from your main branch

#### Environment
- **Region**: Choose closest to your users
- **Branch**: main or master
## Build Process Explanation

The build automatically:
1. ✅ Installs Node.js dependencies including `@sparticuz/chromium`
2. ✅ @sparticuz/chromium provides a pre-built Chromium binary optimized for serverless
3. ✅ Configures Puppeteer and Lighthouse to use the bundled Chromium
4. ✅ No system-level Chrome installation needed!
4. ✅ Configures Puppeteer to use system Chrome

## Troubleshooting
### Error: "Failed to launch chrome"

**Possible causes**:
1. Insufficient memory - Upgrade to 1GB RAM instance
2. Timeout during Chrome launch
3. @sparticuz/chromium package not installed

**Solution**:
- Check Render build logs - ensure `@sparticuz/chromium` installed successfully
- Upgrade to at least 1GB RAM (Standard plan)
- Check runtime logs for Chrome initialization messages
- Verify all apt packages installed successfully

### Memory Issues

If you see OOM (Out of Memory) errors:
1. Upgrade to at least 1GB RAM instance
2. Reduce concurrent Lighthouse analyses
3. Use the `start:optimized` script (already configured)

### Slow Performance

**Optimization tips**:
1. The service uses a queue system (1 analysis at a time)
2. Each analysis takes 15-30 seconds
3. Consider caching results in your database
4. Use CDN for static assets

## Testing After Deployment

1. **Health Check**:
```bash
curl https://your-app.onrender.com/api/health
```

2. **Test Lighthouse**:
```bash
curl -X POST https://your-app.onrender.com/api/lighthouse/analyze \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

3. **Check Chrome Installation**:
Check your Render logs for:
```
✅ Chromium installed successfully at: /usr/bin/chromium
✅ Build complete!
🔧 Chrome config: Using: /usr/bin/chromium
```
3. **Check Chrome Installation**:
Check your Render logs for:
```
✅ Using @sparticuz/chromium for production
✅ Using @sparticuz/chromium at: /tmp/chromium-...
🔧 Chrome config: Using: /tmp/chromium-...
```Cache for 24 hours
const cachedResult = await getCachedLighthouseResult(domain);
if (cachedResult && !cachedResult.isStale) {
  return cachedResult;
}
```

### 2. Rate Limiting
Already implemented in your Express app - good!

### 3. Error Handling
Services now gracefully fallback if Chrome isn't available.

### 4. Monitoring
Set up monitoring in Render:
- Enable email notifications for errors
- Monitor memory usage
- Set up custom alerts

## Cost Optimization

### Free Tier Limitations
- Free tier may have insufficient resources
- Recommended: Starter ($7/month) or higher

### Recommended Plan
- **Starter (512MB)**: Good for testing
- **Standard (1GB)**: Better for production
- **Pro (2GB+)**: Best for high traffic

## File Structure

```
backend/
├── build.sh                          # Main build script
├── scripts/
│   └── install-chrome.sh            # Chrome installation
## File Structure

```
backend/
├── package.json                      # Includes @sparticuz/chromium
├── config/
│   └── chromeConfig.js              # Chrome/Puppeteer config (auto-detects @sparticuz/chromium)
└── services/
    ├── lighthouseService.js         # Updated for production
    ├── competitorLighthouseService.js
    ├── gscBacklinksScraper.js       # Puppeteer scraping
    └── competitorAnalysisService.js # Puppeteer analysis
```hrome/Chromium Configuration
CHROME_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Node Environment
NODE_ENV=production
PORT=10000

```bash
# Node Environment
NODE_ENV=production
PORT=10000I Keys
SERP_API_KEY=your_serp_key
APIFY_API_KEY=your_apify_key
# ... add all your other keys
```

## Support

If you encounter issues:
1. Check Render build logs
2. Check Render runtime logs
3. Verify all environment variables are set
4. Ensure build script ran successfully
5. Check instance has sufficient memory

## Success Indicators

Your deployment is successful when you see:
- ✅ Build completes without errors
- ✅ Service starts successfully
- ✅ Health check returns 200 OK
- ✅ Lighthouse analysis returns results
- ✅ No Chrome-related errors in logs

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Puppeteer on Linux](https://pptr.dev/troubleshooting#chrome-headless-doesnt-launch-on-unix)
- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
