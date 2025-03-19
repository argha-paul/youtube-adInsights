const { google } = require('googleapis');
const config = require('../config/config');
const Video = require('../models/video');
const natural = require('natural');
const { NlpManager } = require('node-nlp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// NLP setup
const tokenizer = new natural.WordTokenizer();
const sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
const nlpManager = new NlpManager({ languages: ['en'] });

// Gemini AI setup
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Initialize the YouTube API client
const youtube = google.youtube({
  version: 'v3',
  auth: config.youtubeApiKey
});

/**
 * Extract ad placements and sponsorships from video description and tags
 * @param {string} description - Video description
 * @param {Array} tags - Video tags
 * @returns {Object} Information about detected ads and sponsorships
 */
function detectSponsorship(description, tags) {
  const sponsorKeywords = [
    'sponsor', 'sponsored', 'partnership', 'partnered', 'promotion', 'promoted',
    'thanks to', 'paid promotion', 'sponsored by', 'affiliate', 'discount code',
    'promo code', 'use code', 'click the link', 'check out', 'thanks to our sponsor'
  ];

  const adIndicators = [];
  let hasSponsorship = false;
  let sponsorshipDetails = '';
  let detectedBrands = [];
  let adDuration = null;

  // Check description for sponsorship indicators
  if (description) {
    const descriptionLower = description.toLowerCase();
    
    // Look for sponsorship keywords in description
    for (const keyword of sponsorKeywords) {
      if (descriptionLower.includes(keyword)) {
        hasSponsorship = true;
        
        // Extract the sentence containing the keyword
        const sentences = description.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(keyword)) {
            sponsorshipDetails += sentence.trim() + '. ';
            
            // Try to extract brand names
            const potentialBrands = extractBrands(sentence);
            if (potentialBrands.length > 0) {
              detectedBrands = [...detectedBrands, ...potentialBrands];
            }
          }
        }
        
        adIndicators.push(keyword);
      }
    }
  }
  
  // Check tags for sponsorship indicators
  if (tags && Array.isArray(tags)) {
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      for (const keyword of sponsorKeywords) {
        if (tagLower.includes(keyword) && !adIndicators.includes(keyword)) {
          hasSponsorship = true;
          adIndicators.push(keyword);
        }
      }
      
      // Extract potential brand names from tags
      if (tag.length > 3 && /^[A-Z]/.test(tag)) {
        detectedBrands.push(tag);
      }
    }
  }
  
  // Look for timestamps in description that might indicate ad segments
  const adTimestampRegex = /(\d+:?\d*)\s*-?\s*(\d+:?\d*)?\s*(ad|sponsor|promotion|sponsored)/i;
  const timestampMatches = description ? description.match(adTimestampRegex) : null;
  
  if (timestampMatches) {
    hasSponsorship = true;
    adIndicators.push('timestamp indicator');
    sponsorshipDetails += `Ad segment detected at ${timestampMatches[1]}. `;
    
    // Calculate ad duration if end timestamp is provided
    if (timestampMatches[2]) {
      const startTime = convertTimestampToSeconds(timestampMatches[1]);
      const endTime = convertTimestampToSeconds(timestampMatches[2]);
      if (startTime !== null && endTime !== null) {
        adDuration = endTime - startTime;
      }
    }
  }

  return {
    hasSponsorship,
    sponsorshipDetails: sponsorshipDetails.trim(),
    adIndicators: adIndicators.length > 0 ? [...new Set(adIndicators)] : [],
    detectedBrands: [...new Set(detectedBrands)],
    adDuration
  };
}

/**
 * Extract potential brand names from text
 * @param {string} text - Text to analyze
 * @returns {Array} Array of potential brand names
 */
function extractBrands(text) {
  const brands = [];
  const words = text.split(/\s+/);
  
  // Look for capitalized words that might be brand names
  const brandRegex = /^[A-Z][a-z]{2,}$/;
  for (const word of words) {
    const cleanWord = word.replace(/[,.!?;:()"']/g, '');
    if (brandRegex.test(cleanWord)) {
      brands.push(cleanWord);
    }
  }
  
  // Look for words followed by ® or ™ symbols
  const trademarkedBrands = text.match(/([A-Za-z0-9]+)(?:\s*[®™])/g);
  if (trademarkedBrands) {
    trademarkedBrands.forEach(brand => {
      brands.push(brand.replace(/[®™\s]/g, ''));
    });
  }
  
  return brands;
}

/**
 * Convert timestamp string to seconds
 * @param {string} timestamp - Timestamp in format mm:ss or m:ss
 * @returns {number|null} Time in seconds or null if invalid
 */
function convertTimestampToSeconds(timestamp) {
  if (!timestamp) return null;
  
  const parts = timestamp.split(':');
  if (parts.length === 1) {
    return parseInt(parts[0], 10);
  } else if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  
  return null;
}

/**
 * Calculate engagement metrics for a video
 * @param {number} viewCount - Number of views
 * @param {number} likeCount - Number of likes
 * @param {number} commentCount - Number of comments
 * @returns {Object} Engagement metrics
 */
function calculateEngagementMetrics(viewCount, likeCount, commentCount) {
  const metrics = {
    likeToViewRatio: 0,
    commentToViewRatio: 0,
    overallEngagementRate: 0,
    adEffectivenessScore: 0
  };
  
  if (viewCount > 0) {
    metrics.likeToViewRatio = (likeCount / viewCount) * 100;
    metrics.commentToViewRatio = (commentCount / viewCount) * 100;
    metrics.overallEngagementRate = ((likeCount + commentCount) / viewCount) * 100;
    
    // Estimate ad effectiveness (higher engagement often correlates with better ad placement)
    // This is a simple heuristic - could be improved with more data
    metrics.adEffectivenessScore = (metrics.likeToViewRatio * 0.7) + (metrics.commentToViewRatio * 0.3);
  }
  
  return metrics;
}

/**
 * Get detailed video statistics by video ID
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Video details and statistics
 */
async function getVideoDetails(videoId) {
  try {
    const response = await youtube.videos.list({
      part: 'snippet,statistics,contentDetails',
      id: videoId
    });

    // console.log(`Video details fetched for video : ${response.data.items[0].snippet.title}`);
    if (!response.data.items || response.data.items.length === 0) {
      console.log(`No details found for video ${videoId}`);
      return null;
    }
    
    const videoData = response.data.items[0];
    const snippet = videoData.snippet;
    const statistics = videoData.statistics;

    // console.log(`Video details fetched for video with title: ${snippet.title}`);
    
    // Extract video details
    const viewCount = parseInt(statistics.viewCount) || 0;
    const likeCount = parseInt(statistics.likeCount) || 0;
    const commentCount = parseInt(statistics.commentCount) || 0;
    
    // Calculate engagement metrics
    const engagementMetrics = calculateEngagementMetrics(
      viewCount, likeCount, commentCount
    );
    
    // Detect sponsorships
    const sponsorshipInfo = detectSponsorship(snippet.description, snippet.tags);
    
    // Create detailed video object
    return {
      title: snippet.title,
      description: snippet.description,
      viewCount,
      likeCount,
      commentCount,
      favoriteCount: parseInt(statistics.favoriteCount) || 0,
      duration: videoData.contentDetails.duration,
      definition: videoData.contentDetails.definition, // SD or HD
      dimension: videoData.contentDetails.dimension, // 2d or 3d
      caption: videoData.contentDetails.caption === 'true', // Has captions?
      licensedContent: videoData.contentDetails.licensedContent,
      contentRating: videoData.contentDetails.contentRating,
      tags: snippet.tags || [],
      categoryId: snippet.categoryId,
      liveBroadcastContent: snippet.liveBroadcastContent,
      defaultLanguage: snippet.defaultLanguage,
      defaultAudioLanguage: snippet.defaultAudioLanguage,
      engagementMetrics,
      sponsorshipInfo,
      adInsights: {
        lastAnalyzed: null,
        sentiment: null,
        aiAnalysis: null,
        adStyle: null,
        adEffectiveness: null
      }
    };
  } catch (error) {
    console.error(`Error fetching details for video ${videoId}:`, error.message);
    return null;
  }
}

/**
 * Get comments for a video
 * @param {string} videoId - YouTube video ID
 * @param {number} maxResults - Maximum number of comments to retrieve
 * @returns {Promise<Array>} Array of comment objects
 */
async function getVideoComments(videoId, maxResults = 100) {
  try {
    const response = await youtube.commentThreads.list({
      part: 'snippet',
      videoId: videoId,
      maxResults: maxResults,
      order: 'relevance' // Get most relevant comments
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      console.log(`No comments found for video ${videoId}`);
      return [];
    }
    
    // console.log(`Comments found for video : ${response.data.items.length}`);

    // Extract comment data
    const comments = response.data.items.map(item => {
      const comment = item.snippet.topLevelComment.snippet;
      return {
        commentId: item.id,
        text: comment.textDisplay,
        authorName: comment.authorDisplayName,
        authorProfileUrl: comment.authorProfileImageUrl,
        likeCount: comment.likeCount,
        publishedAt: comment.publishedAt,
        updatedAt: comment.updatedAt
      };
    });
    
    return comments;
  } catch (error) {
    console.error(`Error fetching comments for video ${videoId}:`, error.message);
    return [];
  }
}

/**
 * Analyze sentiment of video comments
 * @param {Array} comments - Array of comment objects
 * @returns {Object} Sentiment analysis results
 */
function analyzeCommentSentiment(comments) {
  if (!comments || comments.length === 0) {
    return {
      averageSentiment: 0,
      positivePercentage: 0,
      negativePercentage: 0,
      neutralPercentage: 0,
      totalComments: 0,
      keywordSentiment: {}
    };
  }
  
  let totalSentiment = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  const keywordSentiment = {};
  
  for (const comment of comments) {
    const tokens = tokenizer.tokenize(comment.text);
    const sentimentScore = sentiment.getSentiment(tokens) || 0; // Ensure we have a number
    // console.log(`Sentiment score for comment: ${comment.text} is ${sentimentScore}`);
    
    totalSentiment += sentimentScore;
    
    if (sentimentScore > 0.05) {
      positiveCount++;
    } else if (sentimentScore < -0.05) {
      negativeCount++;
    } else {
      neutralCount++;
    }
    
    // Analyze sentiment for keywords related to ads
    const adKeywords = ['ad', 'sponsor', 'promotion', 'sponsored', 'brand', 'product'];
    for (const keyword of adKeywords) {
      if (comment.text.toLowerCase().includes(keyword)) {
        if (!keywordSentiment[keyword]) {
          keywordSentiment[keyword] = {
            count: 0,
            totalSentiment: 0,
            averageSentiment: 0
          };
        }
        
        keywordSentiment[keyword].count++;
        keywordSentiment[keyword].totalSentiment += sentimentScore;
      }
    }
  }
  
  // Calculate averages for keyword sentiment
  for (const keyword in keywordSentiment) {
    if (keywordSentiment[keyword].count > 0) {
      keywordSentiment[keyword].averageSentiment = 
        (keywordSentiment[keyword].totalSentiment / keywordSentiment[keyword].count) || 0;
    }
  }
  
  // Ensure all values are valid numbers
  const totalComments = comments.length;
  return {
    averageSentiment: totalComments > 0 ? (totalSentiment / totalComments) || 0 : 0,
    positivePercentage: totalComments > 0 ? ((positiveCount / totalComments) * 100) || 0 : 0,
    negativePercentage: totalComments > 0 ? ((negativeCount / totalComments) * 100) || 0 : 0,
    neutralPercentage: totalComments > 0 ? ((neutralCount / totalComments) * 100) || 0 : 0,
    totalComments: totalComments,
    keywordSentiment
  };
}

/**
 * Analyze video content using AI
 * @param {Object} videoData - Video data object
 * @param {Array} comments - Video comments
 * @returns {Promise<Object>} AI analysis results
 */
async function analyzeVideoContent(videoData, comments) {
  try {
    // Extract relevant information for analysis
    const { title, description, tags, sponsorshipInfo, engagementMetrics } = videoData;

    
    // Prepare context for AI analysis
    const prompt = `You are an expert at analyzing YouTube video content and providing insights about advertising and sponsorship.

Analyze this YouTube video content for ad insights:

Title: ${title}
Description: ${description.substring(0, 1000)} // Limit description length
Tags: ${tags ? tags.join(', ') : ''}
Has Sponsorship: ${sponsorshipInfo.hasSponsorship}
Sponsorship Details: ${sponsorshipInfo.sponsorshipDetails}
Engagement Rate: ${engagementMetrics.overallEngagementRate.toFixed(2)}%

Comment Samples:
${comments.slice(0, 5).map(c => c.text).join('\n')}

Provide insights on:
1. Ad Style (long-form vs short-form, narrative style, CTAs)
2. Brand Mentions and Product Placements
3. Audience Engagement with Ads
4. Effectiveness of Ad Placement
5. Recommendations for Improving Ad Performance`;

    console.log(`Generating AI insights for video: ${title}`);
    
    // Use Gemini AI for advanced analysis
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiInsights = response.text().trim();
    
    console.log(`AI response received for video: ${title}`);
    
    // Determine ad style based on sponsorship info and AI analysis
    let adStyle = "Unknown";
    if (sponsorshipInfo.hasSponsorship) {
      if (sponsorshipInfo.adDuration) {
        adStyle = sponsorshipInfo.adDuration > 60 ? "Long-form" : "Short-form";
      } else if (aiInsights.toLowerCase().includes("long-form")) {
        adStyle = "Long-form";
      } else if (aiInsights.toLowerCase().includes("short-form")) {
        adStyle = "Short-form";
      }
    }
    
    // Evaluate ad effectiveness based on engagement metrics and sentiment
    const commentSentiment = analyzeCommentSentiment(comments);
    const adEffectiveness = calculateAdEffectiveness(engagementMetrics, commentSentiment);
    
    return {
      aiInsights,
      adStyle,
      adEffectiveness,
      adSentiment: commentSentiment,
      lastAnalyzed: new Date()
    };
  } catch (error) {
    console.error('Error analyzing video content:', error.message);
    return {
      aiInsights: "Analysis failed",
      adStyle: "Unknown",
      adEffectiveness: 0,
      adSentiment: {
        averageSentiment: 0,
        positivePercentage: 0,
        negativePercentage: 0,
        neutralPercentage: 0
      },
      lastAnalyzed: new Date()
    };
  }
}

/**
 * Calculate ad effectiveness score
 * @param {Object} engagementMetrics - Video engagement metrics
 * @param {Object} sentiment - Comment sentiment analysis
 * @returns {number} Ad effectiveness score (0-100)
 */
function calculateAdEffectiveness(engagementMetrics, sentiment) {
  // Weight factors
  const weights = {
    engagement: 0.5,
    sentiment: 0.5
  };
  
  // Normalize engagement metrics (0-100)
  const normalizedEngagement = Math.min(engagementMetrics.adEffectivenessScore * 10, 100);
  
  // Calculate sentiment score (0-100)
  const sentimentScore = (sentiment.positivePercentage - sentiment.negativePercentage + 100) / 2;
  
  // Calculate weighted score
  const effectivenessScore = (normalizedEngagement * weights.engagement) + 
                            (sentimentScore * weights.sentiment);
  
  return Math.max(0, Math.min(100, effectivenessScore));
}

/**
 * Generate an ad insights report for a video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Ad insights report
 */
async function generateAdInsightsReport(videoId) {
  try {
    // Get video details
    const videoData = await getVideoDetails(videoId);
    if (!videoData) {
      return { success: false, error: 'Video not found' };
    }

    // console.log(`Video details fetched for viewcount: ${videoData.viewCount}`);
    
    // Get video comments
    const comments = await getVideoComments(videoId);

    // console.log(`Comments found for video : ${comments.length}`);
    
    // Analyze video content
    const analysisResults = await analyzeVideoContent(videoData, comments);
    
    // Create report
    const report = {
      videoId: videoId,
      title: videoData.title,
      channelId: videoData.channelId,
      channelTitle: videoData.channelTitle,
      publishedAt: videoData.publishedAt,
      viewCount: videoData.viewCount,
      adData: {
        hasSponsorship: videoData.sponsorshipInfo.hasSponsorship,
        sponsorshipDetails: videoData.sponsorshipInfo.sponsorshipDetails,
        adIndicators: videoData.sponsorshipInfo.adIndicators,
        detectedBrands: videoData.sponsorshipInfo.detectedBrands,
        adDuration: videoData.sponsorshipInfo.adDuration
      },
      engagement: {
        likeCount: videoData.likeCount,
        commentCount: videoData.commentCount,
        likeToViewRatio: videoData.engagementMetrics.likeToViewRatio,
        commentToViewRatio: videoData.engagementMetrics.commentToViewRatio,
        overallEngagementRate: videoData.engagementMetrics.overallEngagementRate
      },
      sentimentAnalysis: analysisResults.adSentiment,
      adStyle: analysisResults.adStyle,
      adEffectiveness: analysisResults.adEffectiveness,
      aiInsights: analysisResults.aiInsights,
      generatedAt: new Date()
    };
    
    // Save report to database
    await saveAdInsightsReport(videoId, report);
    
    return { success: true, report };
  } catch (error) {
    console.error(`Error generating ad insights report for video ${videoId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Save ad insights report to database
 * @param {string} videoId - YouTube video ID
 * @param {Object} report - Ad insights report
 */
async function saveAdInsightsReport(videoId, report) {
  try {
    await Video.findOneAndUpdate(
      { videoId },
      { 
        $set: { 
          adInsights: {
            lastAnalyzed: report.generatedAt,
            sentiment: report.sentimentAnalysis,
            aiAnalysis: report.aiInsights,
            adStyle: report.adStyle,
            adEffectiveness: report.adEffectiveness
          }
        }
      },
      { new: true }
    );
    
    console.log(`Ad insights report saved for video ${videoId}`);
  } catch (error) {
    console.error(`Error saving ad insights report for video ${videoId}:`, error.message);
  }
}

/**
 * Generate batch ad insights reports for all videos in a channel
 * @param {string} channelId - YouTube channel ID
 * @returns {Promise<Object>} Batch processing results
 */
async function generateChannelAdInsights(channelId) {
  try {
    const videos = await Video.find({ channelId });
    
    if (!videos || videos.length === 0) {
      return { success: false, error: 'No videos found for this channel' };
    }
    
    const results = {
      total: videos.length,
      processed: 0,
      failed: 0,
      reports: []
    };
    
    for (const video of videos) {
      try {
        const result = await generateAdInsightsReport(video.videoId);
        if (result.success) {
          results.processed++;
          results.reports.push({
            videoId: video.videoId,
            title: video.title,
            success: true
          });
        } else {
          results.failed++;
          results.reports.push({
            videoId: video.videoId,
            title: video.title,
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        results.failed++;
        results.reports.push({
          videoId: video.videoId,
          title: video.title,
          success: false,
          error: error.message
        });
      }
    }
    
    return { success: true, results };
  } catch (error) {
    console.error(`Error generating batch ad insights for channel ${channelId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch videos from a specific YouTube channel
 * @param {string} channelId - The YouTube channel ID
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Array>} Array of video objects
 */
async function fetchVideosFromChannel(channelId, maxResults = 10) {
  try {
    // First, get the upload playlist ID for the channel
    const channelResponse = await youtube.channels.list({
      part: 'contentDetails',
      id: channelId
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log(`No channel found with ID: ${channelId}`);
      return [];
    }

    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

    // Then, fetch videos from the uploads playlist
    const playlistResponse = await youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: maxResults
    });

    if (!playlistResponse.data.items || playlistResponse.data.items.length === 0) {
      console.log(`No videos found for channel: ${channelId}`);
      return [];
    }

    // Extract video details
    const videos = [];
    
    for (const item of playlistResponse.data.items) {
      const videoId = item.contentDetails.videoId;
      
      // Get additional video details including statistics
      const videoDetails = await getVideoDetails(videoId);
      
      if (!videoDetails) continue;
      
      videos.push({
        videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        source: 'channel',
        ...videoDetails
      });
    }

    return videos;
  } catch (error) {
    console.error(`Error fetching videos from channel ${channelId}:`, error.message);
    return [];
  }
}

/**
 * Search for videos based on keywords
 * @param {string} keyword - The keyword to search for
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Array>} Array of video objects
 */
async function searchVideos(keyword, maxResults = 10) {
  try {
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: keyword,
      type: 'video',
      maxResults: maxResults,
      order: 'date' // Get the most recent videos
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      console.log(`No videos found for keyword: ${keyword}`);
      return [];
    }

    // Extract video details
    const videos = [];
    
    for (const item of searchResponse.data.items) {
      const videoId = item.id.videoId;
      
      // Get additional video details including statistics
      const videoDetails = await getVideoDetails(videoId);
      
      if (!videoDetails) continue;
      
      videos.push({
        videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        source: 'search',
        keyword: keyword,
        ...videoDetails
      });
    }

    return videos;
  } catch (error) {
    console.error(`Error searching videos with keyword ${keyword}:`, error.message);
    return [];
  }
}

/**
 * Fetch all videos from configured channels and keywords
 */
async function fetchAllVideos() {
  try {
    console.log('Starting to fetch videos...');
    let allVideos = [];

    // Fetch videos from channels
    for (const channelId of config.youtubeChannels) {
      console.log(`Fetching videos from channel: ${channelId}`);
      const channelVideos = await fetchVideosFromChannel(channelId);
      allVideos = [...allVideos, ...channelVideos];
    }

    // Search for videos by keywords
    for (const keyword of config.searchKeywords) {
      console.log(`Searching videos with keyword: ${keyword}`);
      const keywordVideos = await searchVideos(keyword);
      allVideos = [...allVideos, ...keywordVideos];
    }

    console.log(`Total videos fetched: ${allVideos.length}`);

    // Save all videos to database
    await saveVideosToDatabase(allVideos);

    return allVideos;
  } catch (error) {
    console.error('Error fetching all videos:', error.message);
    return [];
  }
}

/**
 * Save fetched videos to the database
 * @param {Array} videos - Array of video objects to save
 */
async function saveVideosToDatabase(videos) {
  try {
    let newVideos = 0;
    let updatedVideos = 0;

    for (const video of videos) {
      // Check if video already exists in database
      const existingVideo = await Video.findOne({ videoId: video.videoId });

      if (!existingVideo) {
        // Create new video document
        await Video.create(video);
        newVideos++;
      } else {
        // Update existing video document
        await Video.findOneAndUpdate({ videoId: video.videoId }, video, { new: true });
        updatedVideos++;
      }
    }

    console.log(`Videos saved to database: ${newVideos} new, ${updatedVideos} updated`);
  } catch (error) {
    console.error('Error saving videos to database:', error.message);
  }
}

// Export functions
module.exports = {
  fetchVideosFromChannel,
  searchVideos,
  fetchAllVideos,
  getVideoDetails,
  getVideoComments,
  analyzeCommentSentiment,
  generateAdInsightsReport,
  generateChannelAdInsights,
  saveVideosToDatabase
};