const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const config = require('./config/config');
const youtubeService = require('./services/youtube');
const Video = require('./models/video');
const Comment = require('./models/comment');
const AdInsight = require('./models/adInsight');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Connect to MongoDB
mongoose.connect(config.mongodbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// API Routes

// Fetch and store videos immediately when server starts
app.get('/api/fetch-now', async (req, res) => {
  try {
    const videos = await youtubeService.fetchAllVideos();
    res.json({ success: true, count: videos.length, message: 'Videos fetched successfully' });
  } catch (error) {
    console.error('Error in fetch-now endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all stored videos with pagination
app.get('/api/videos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find()
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Video.countDocuments();
    
    res.json({
      success: true,
      videos,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get video by ID
app.get('/api/videos/:videoId', async (req, res) => {
  try {
    const video = await Video.findOne({ videoId: req.params.videoId });
    
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    res.json({ success: true, video });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search videos by keyword
app.get('/api/videos/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find({
      $or: [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { tags: { $regex: keyword, $options: 'i' } }
      ]
    })
    .sort({ publishedAt: -1 })
    .skip(skip)
    .limit(limit);
    
    const total = await Video.countDocuments({
      $or: [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { tags: { $regex: keyword, $options: 'i' } }
      ]
    });
    
    res.json({
      success: true,
      videos,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get videos by channel ID
app.get('/api/channels/:channelId/videos', async (req, res) => {
  try {
    const { channelId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const videos = await Video.find({ channelId })
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Video.countDocuments({ channelId });
    
    res.json({
      success: true,
      channelId,
      videos,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching channel videos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate ad insights report for a video
app.post('/api/videos/:videoId/generate-insights', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    // Check if video exists
    const videoExists = await Video.findOne({ videoId });
    if (!videoExists) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    // Generate ad insights report
    const result = await youtubeService.generateAdInsightsReport(videoId);
    
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    
    res.json({ success: true, report: result.report });
  } catch (error) {
    console.error('Error generating ad insights:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get existing ad insights for a video
app.get('/api/videos/:videoId/ad-insights', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const adInsight = await AdInsight.findOne({ videoId });
    
    if (!adInsight) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ad insights not found for this video',
        videoId 
      });
    }
    
    res.json({ success: true, adInsight });
  } catch (error) {
    console.error('Error fetching ad insights:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate batch ad insights for a channel
app.post('/api/channels/:channelId/generate-insights', async (req, res) => {
  try {
    const { channelId } = req.params;
    
    // Check if channel has videos
    const videosExist = await Video.findOne({ channelId });
    if (!videosExist) {
      return res.status(404).json({ success: false, message: 'No videos found for this channel' });
    }
    
    // Start batch processing (non-blocking)
    res.json({ 
      success: true, 
      message: 'Batch processing started. Check status endpoint for progress.',
      channelId
    });
    
    // Process in background
    youtubeService.generateChannelAdInsights(channelId)
      .then(result => {
        console.log(`Batch processing completed for channel ${channelId}:`, 
          result.success ? `${result.results.processed} videos processed` : result.error);
      })
      .catch(err => {
        console.error(`Batch processing failed for channel ${channelId}:`, err.message);
      });
    
  } catch (error) {
    console.error('Error initiating batch processing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get batch processing status for a channel
app.get('/api/channels/:channelId/insights-status', async (req, res) => {
  try {
    const { channelId } = req.params;
    
    const totalVideos = await Video.countDocuments({ channelId });
    const processedVideos = await AdInsight.countDocuments({ channelId });
    
    const latestInsight = await AdInsight.findOne({ channelId })
      .sort({ generatedAt: -1 })
      .limit(1);
    
    res.json({
      success: true,
      channelId,
      status: {
        totalVideos,
        processedVideos,
        progress: totalVideos > 0 ? (processedVideos / totalVideos) * 100 : 0,
        isComplete: processedVideos >= totalVideos,
        lastProcessed: latestInsight ? latestInsight.generatedAt : null
      }
    });
  } catch (error) {
    console.error('Error fetching batch status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get comments for a video
app.get('/api/videos/:videoId/comments', async (req, res) => {
  try {
    const { videoId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const comments = await Comment.find({ videoId })
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Comment.countDocuments({ videoId });
    
    res.json({
      success: true,
      videoId,
      comments,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch fresh comments for a video from YouTube API
app.post('/api/videos/:videoId/refresh-comments', async (req, res) => {
  try {
    const { videoId } = req.params;
    const maxResults = parseInt(req.query.maxResults) || 100;
    
    // Check if video exists
    const videoExists = await Video.findOne({ videoId });
    if (!videoExists) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    // Fetch comments from YouTube API
    const comments = await youtubeService.getVideoComments(videoId, maxResults);
    
    if (!comments || comments.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No comments found for this video',
        count: 0
      });
    }
    
    // Process and store comments
    const savedComments = [];
    
    for (const comment of comments) {
      // Calculate sentiment
      const tokens = youtubeService.tokenizer.tokenize(comment.text);
      const sentimentScore = youtubeService.sentiment.getSentiment(tokens);
      
      // Determine classification
      let classification = 'neutral';
      if (sentimentScore > 0.05) classification = 'positive';
      else if (sentimentScore < -0.05) classification = 'negative';
      
      // Check for ad-related keywords
      const adKeywords = ['ad', 'sponsor', 'promotion', 'sponsored', 'brand', 'product'];
      const foundAdKeywords = adKeywords.filter(keyword => 
        comment.text.toLowerCase().includes(keyword)
      );
      
      // Save to database
      const newComment = new Comment({
        commentId: comment.commentId,
        videoId,
        text: comment.text,
        authorName: comment.authorName,
        authorProfileUrl: comment.authorProfileUrl,
        likeCount: comment.likeCount,
        publishedAt: comment.publishedAt,
        updatedAt: comment.updatedAt,
        sentiment: {
          score: sentimentScore,
          comparative: sentimentScore / tokens.length,
          classification,
          keywords: tokens.slice(0, 10) // Keep most significant keywords
        },
        adRelated: {
          isAdRelated: foundAdKeywords.length > 0,
          adKeywords: foundAdKeywords,
          brandMentions: [] // Would require more advanced NLP
        }
      });
      
      // Use upsert to avoid duplicates
      await Comment.findOneAndUpdate(
        { commentId: comment.commentId },
        { $set: newComment.toObject() },
        { upsert: true, new: true }
      );
      
      savedComments.push(newComment);
    }
    
    // Update video with recent comments summary
    await Video.findOneAndUpdate(
      { videoId },
      { 
        $set: { 
          commentCount: comments.length,
          recentComments: comments.slice(0, 5).map(c => ({
            commentId: c.commentId,
            text: c.text,
            authorName: c.authorName,
            publishedAt: c.publishedAt,
            updatedAt: c.updatedAt
          }))
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Comments refreshed successfully',
      count: savedComments.length
    });
  } catch (error) {
    console.error('Error refreshing comments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ad insights dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    // Get overall stats
    const totalVideos = await Video.countDocuments();
    const totalAdsDetected = await Video.countDocuments({ 'sponsorshipInfo.hasSponsorship': true });
    const totalChannels = await Video.distinct('channelId').length;
    
    // Get ad styles distribution
    const adStyles = await AdInsight.aggregate([
      { $match: { adStyle: { $ne: null } } },
      { $group: { _id: '$adStyle', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get top performing brands
    const topBrands = await AdInsight.aggregate([
      { $match: { detectedBrands: { $ne: [] } } },
      { $unwind: '$detectedBrands' },
      { $group: { _id: '$detectedBrands', count: { $sum: 1 }, avgEffectiveness: { $avg: '$adEffectiveness' } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get recent insights
    const recentInsights = await AdInsight.find()
      .sort({ generatedAt: -1 })
      .limit(5);
    
    // Calculate overall sentiment
    const sentimentStats = await AdInsight.aggregate([
      { 
        $group: { 
          _id: null, 
          avgPositive: { $avg: '$sentimentAnalysis.positivePercentage' },
          avgNegative: { $avg: '$sentimentAnalysis.negativePercentage' },
          avgNeutral: { $avg: '$sentimentAnalysis.neutralPercentage' }
        } 
      }
    ]);
    
    res.json({
      success: true,
      dashboard: {
        stats: {
          totalVideos,
          totalAdsDetected,
          totalChannels,
          adFrequency: totalVideos > 0 ? (totalAdsDetected / totalVideos) * 100 : 0
        },
        adStyles,
        topBrands,
        sentiment: sentimentStats[0] || { avgPositive: 0, avgNegative: 0, avgNeutral: 0 },
        recentInsights
      }
    });
  } catch (error) {
    console.error('Error generating dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to fetch videos from a specific channel
app.post('/api/fetch/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const maxResults = parseInt(req.query.maxResults) || 50;
    
    const videos = await youtubeService.fetchVideosFromChannel(channelId, maxResults);
    
    res.json({
      success: true,
      channelId,
      count: videos.length,
      message: `Successfully fetched ${videos.length} videos from channel`
    });
  } catch (error) {
    console.error(`Error fetching videos from channel ${req.params.channelId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to search for videos by keyword
app.post('/api/fetch/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const maxResults = parseInt(req.query.maxResults) || 50;
    
    const videos = await youtubeService.searchVideos(keyword, maxResults);
    
    res.json({
      success: true,
      keyword,
      count: videos.length,
      message: `Successfully fetched ${videos.length} videos matching "${keyword}"`
    });
  } catch (error) {
    console.error(`Error searching videos for keyword ${req.params.keyword}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to compare ad insights between channels
app.get('/api/compare/channels', async (req, res) => {
  try {
    const channelIds = req.query.ids.split(',');
    
    if (!channelIds || channelIds.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide at least two channel IDs as comma-separated values' 
      });
    }
    
    const comparisons = [];
    
    for (const channelId of channelIds) {
      // Get channel data
      const channelVideos = await Video.find({ channelId });
      const channelInsights = await AdInsight.find({ channelId });
      
      if (channelVideos.length === 0) {
        comparisons.push({
          channelId,
          channelTitle: 'Unknown',
          videoCount: 0,
          adData: {
            hasAds: false,
            adFrequency: 0,
            avgAdEffectiveness: 0,
            topAdStyle: 'N/A',
            avgSentiment: 0
          }
        });
        continue;
      }
      
      // Calculate metrics
      const videoCount = channelVideos.length;
      const videosWithAds = channelVideos.filter(v => v.sponsorshipInfo && v.sponsorshipInfo.hasSponsorship).length;
      const adFrequency = (videosWithAds / videoCount) * 100;
      
      // Calculate average ad effectiveness and sentiment
      let avgAdEffectiveness = 0;
      let avgSentiment = 0;
      let adStyleCounts = {};
      
      if (channelInsights.length > 0) {
        // Calculate averages
        avgAdEffectiveness = channelInsights.reduce((sum, insight) => 
          sum + (insight.adEffectiveness || 0), 0) / channelInsights.length;
          
        avgSentiment = channelInsights.reduce((sum, insight) => 
          sum + (insight.sentimentAnalysis?.averageSentiment || 0), 0) / channelInsights.length;
          
        // Count ad styles
        channelInsights.forEach(insight => {
          if (insight.adStyle) {
            adStyleCounts[insight.adStyle] = (adStyleCounts[insight.adStyle] || 0) + 1;
          }
        });
      }
      
      // Determine top ad style
      let topAdStyle = 'N/A';
      let maxCount = 0;
      
      for (const [style, count] of Object.entries(adStyleCounts)) {
        if (count > maxCount) {
          maxCount = count;
          topAdStyle = style;
        }
      }
      
      comparisons.push({
        channelId,
        channelTitle: channelVideos[0]?.channelTitle || 'Unknown',
        videoCount,
        adData: {
          hasAds: videosWithAds > 0,
          adFrequency,
          avgAdEffectiveness,
          topAdStyle,
          avgSentiment
        }
      });
    }
    
    res.json({
      success: true,
      comparisons
    });
  } catch (error) {
    console.error('Error comparing channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ad insights trends over time
app.get('/api/trends/ad-metrics', async (req, res) => {
  try {
    const { metric, timeframe } = req.query;
    
    if (!metric) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required query parameter: metric' 
      });
    }
    
    // Determine time grouping format
    let timeFormat;
    let timeRange;
    
    switch(timeframe) {
      case 'day':
        timeFormat = { $dateToString: { format: '%Y-%m-%d', date: '$generatedAt' } };
        timeRange = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }; // Last 30 days
        break;
      case 'week':
        timeFormat = { 
          $dateToString: { 
            format: '%Y-W%V', 
            date: '$generatedAt' 
          } 
        };
        timeRange = { $gte: new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000) }; // Last 12 weeks
        break;
      case 'month':
      default:
        timeFormat = { $dateToString: { format: '%Y-%m', date: '$generatedAt' } };
        timeRange = { $gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000) }; // Last 12 months
    }
    
    // Determine which field to aggregate based on the requested metric
    let metricField;
    
    switch(metric) {
      case 'adEffectiveness':
        metricField = '$adEffectiveness';
        break;
      case 'sentiment':
        metricField = '$sentimentAnalysis.averageSentiment';
        break;
      case 'engagement':
        metricField = '$engagement.overallEngagementRate';
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid metric. Supported values: adEffectiveness, sentiment, engagement' 
        });
    }
    
    // Aggregate the data
    const trendData = await AdInsight.aggregate([
      { $match: { generatedAt: timeRange } },
      { 
        $group: {
          _id: timeFormat,
          average: { $avg: metricField },
          min: { $min: metricField },
          max: { $max: metricField },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      metric,
      timeframe: timeframe || 'month',
      trends: trendData.map(item => ({
        timeLabel: item._id,
        average: item.average,
        min: item.min,
        max: item.max,
        count: item.count
      }))
    });
  } catch (error) {
    console.error('Error generating trend data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Schedule regular data collection (daily at midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily video fetch job...');
  try {
    const videos = await youtubeService.fetchAllVideos();
    console.log(`Daily job: Fetched ${videos.length} videos`);
  } catch (error) {
    console.error('Error in daily video fetch job:', error);
  }
});

// Schedule weekly ad insights generation (every Sunday at 2am)
cron.schedule('0 2 * * 0', async () => {
  console.log('Running weekly ad insights job...');
  try {
    // Get all channels
    const channels = await Video.distinct('channelId');
    
    for (const channelId of channels) {
      console.log(`Processing channel: ${channelId}`);
      await youtubeService.generateChannelAdInsights(channelId);
    }
    
    console.log('Weekly ad insights job completed');
  } catch (error) {
    console.error('Error in weekly ad insights job:', error);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;