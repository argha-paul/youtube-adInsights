const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  publishedAt: Date,
  channelId: String,
  channelTitle: String,
  thumbnailUrl: String,
  source: String, // 'channel' or 'search'
  keyword: String, // For search results
  
  // Video statistics
  viewCount: Number,
  likeCount: Number,
  commentCount: Number,
  favoriteCount: Number,
  
  // Video details
  duration: String,
  definition: String, // SD or HD
  dimension: String, // 2d or 3d
  caption: Boolean,
  licensedContent: Boolean,
  contentRating: Object,
  tags: [String],
  categoryId: String,
  liveBroadcastContent: String,
  defaultLanguage: String,
  defaultAudioLanguage: String,
  
  // Engagement metrics
  engagementMetrics: {
    likeToViewRatio: Number,
    commentToViewRatio: Number,
    overallEngagementRate: Number,
    adEffectivenessScore: Number
  },
  
  // Sponsorship information
  sponsorshipInfo: {
    hasSponsorship: Boolean,
    sponsorshipDetails: String,
    adIndicators: [String],
    detectedBrands: [String],
    adDuration: Number
  },
  
  // Ad insights
  adInsights: {
    lastAnalyzed: Date,
    sentiment: {
      averageSentiment: Number,
      positivePercentage: Number,
      negativePercentage: Number,
      neutralPercentage: Number,
      totalComments: Number,
      keywordSentiment: Object
    },
    aiAnalysis: String,
    adStyle: String,
    adEffectiveness: Number
  },
  
  // Store recent comments
  recentComments: [{
    commentId: String,
    text: String,
    authorName: String,
    authorProfileUrl: String,
    likeCount: Number,
    publishedAt: Date,
    updatedAt: Date,
    sentiment: Number
  }]
}, { timestamps: true });

module.exports = mongoose.model('Video', VideoSchema);