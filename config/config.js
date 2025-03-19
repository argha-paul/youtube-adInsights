const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  mongodbUri: process.env.MONGODB_URI,
  port: process.env.PORT || 3000,

  // openaiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // YouTube channels to monitor (add your channel IDs here)
  youtubeChannels: [
    'UCsLiV4WJfkTEHH0b9PmRklw', // Example: Maximus Tech channel
    'UC-lHJZR3Gqxm24_Vd_AJ5Yw'  // Example: PewDiePie channel
  ],
  // Keywords to search for (add your keywords here)
  searchKeywords: [
    'node.js tutorial',
    'javascript programming'
  ],
  // Cron schedule for fetching new videos (default: every hour)
  cronSchedule: '0 * * * *'
};