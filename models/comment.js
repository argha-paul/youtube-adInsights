const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  commentId: {
    type: String,
    required: true,
    unique: true
  },
  videoId: {
    type: String,
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true
  },
  authorName: String,
  authorProfileUrl: String,
  likeCount: Number,
  publishedAt: Date,
  updatedAt: Date,
  
  // Sentiment analysis
  sentiment: {
    score: Number,
    comparative: Number,
    classification: String, // 'positive', 'negative', or 'neutral'
    keywords: [String]
  },
  
  // Ad-related indicators
  adRelated: {
    isAdRelated: Boolean,
    adKeywords: [String],
    brandMentions: [String]
  }
}, { timestamps: true });

module.exports = mongoose.model('Comment', CommentSchema);