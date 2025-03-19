# Fetch Youtube Video 

This repository contains the backend APIs to fetch and store YouTube videos based on a predefined list of channels or search keywords. It is built using Node.js and Express.js.

## Table of Contents

* [Installation](###Installation)
* [Running MongoDB](###Running-MongoDB)
* [Start the Application](###Start-the-Application)
* [API Endpoints](###API-Endpoints)


### Installation

1.  **Clone the repository:**

    ```bash
    git clone [repository-url.git]
    cd [repository-name]
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

    or

    ```bash
    yarn install
    ```

3.  **Create a `.env` file:**

    Create a .env file with these variables:
    ```bash
    # YouTube API Key
    YOUTUBE_API_KEY={Youtube-API-key}

    # Mongodb connection string where youtube_db is the databse name.
    MONGODB_URI=mongodb://localhost:27017/youtube_db

    # Gemini API Key
    GEMINI_API_KEY={gemini-API-key}

    # Server
    PORT=3000
    ```


### Running MongoDB

Make sure MongoDB is running on your machine or you have a MongoDB connection string.


### Start the Application

To start the development server with hot reloading, use the following command:
```bash
    npm run dev
```

The server should start, and you can access the API endpoints at http://localhost:3000

### API Endpoints

Here's a summary of all the API endpoints available:

- GET /api/fetch-now: Immediately fetch and store videos from all configured channels and keywords
- GET /api/videos: Get all stored videos with pagination
- GET /api/videos/channel/:channelId: Get videos from a specific channel
- GET /api/videos/search?keyword=example: Search for videos by keyword
- GET /api/videos/:videoId: Get details of a specific video
- POST /api/channels: Add a new channel to monitor (body: { "channelId": "UC..." })
- POST /api/keywords: Add a new search keyword (body: { "keyword": "example" })
- GET /health: Health check endpoint
- GET /api/videos/trending: Get trending videos (based on view count, likes, and engagement)
- GET /api/videos/engagement: Get videos with highest engagement
- GET /api/videos/sponsored: Get videos with sponsorships
- GET /api/videos/category/:categoryId: Get videos by category
- GET /api/videos/tag/:tag: Get videos by tag
- GET /api/channels/:channelId/stats: Get channel statistics
- GET /api/videos/:videoId/recommendations: Get video recommendations based on similarity
