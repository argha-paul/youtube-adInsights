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

* `/api/fetch-now`: Fetches and stores videos immediately from YouTube API.
* `/api/videos`: Retrieves all stored videos with pagination.
* `/api/videos/:videoId`: Retrieves a specific video by its ID.
* `/api/videos/search/:keyword`: Searches videos by keyword with pagination.
* `/api/channels/:channelId/videos`: Retrieves videos from a specific channel with pagination.
* `/api/videos/:videoId/generate-insights`: Generates an ad insights report for a specific video.
* `/api/videos/:videoId/ad-insights`: Retrieves existing ad insights for a specific video.
* `/api/channels/:channelId/generate-insights`: Initiates batch ad insights generation for a channel.
* `/api/channels/:channelId/insights-status`: Retrieves the batch processing status for a channel's ad insights.
* `/api/videos/:videoId/comments`: Retrieves comments for a specific video with pagination.
* `/api/videos/:videoId/refresh-comments`: Fetches and refreshes comments for a video from YouTube API, including sentiment analysis.
* `/api/dashboard`: Retrieves ad insights dashboard data, including overall stats, ad styles, top brands, sentiment, and recent insights.
* `/api/fetch/channel/:channelId`: Fetches videos from a specific YouTube channel.
* `/api/fetch/search/:keyword`: Searches and fetches videos by keyword from YouTube.
* `/api/compare/channels`: Compares ad insights between multiple channels.
* `/api/trends/ad-metrics`: Retrieves ad insights trends over time for specified metrics.
