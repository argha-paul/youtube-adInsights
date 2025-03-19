const mongoose = require('mongoose');

const AdInsightSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  title: String,
  channelTitle: String,
  publishedAt: Date,
  
  // Ad detection
  hasSponsorship: Boolean,
  sponsorshipDetails: String,
  adIndicators: [String],
  detectedBrands: [String],
  adDuration: Number,
  adStyle: String,
  
  // Metrics
  viewCount: Number,
  likeCount: Number,
  commentCount: Number,
  engagementRate: Number,
  adEffectiveness: Number,
  
  // Sentiment analysis
  sentimentAnalysis: {
    averageSentiment: Number,
    positivePercentage: Number,
    negativePercentage: Number,
    neutralPercentage: Number,
    totalComments: Number,
    keywordSentiment: Object
  },
  
  // AI Analysis
  aiInsights: String,
  
  // Report generation
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('AdInsight', AdInsightSchema);