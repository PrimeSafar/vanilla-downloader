# VanillaDownloader

<img src="public/logo.png" alt="VanillaDownloader Logo" width="200"/>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

VanillaDownloader is a high-speed video and audio downloader built with a striking Neobrutalist design aesthetic. It provides a seamless direct download pipeline using `yt-dlp` under the hood to process media links and pipe them directly to the browser for instant, native downloads.

## Features

*   **Direct Download Pipeline:** Bypasses intermediate server storage by streaming media directly to the user's browser.
*   **Neobrutalist UI:** A bold, high-contrast user interface with hard shadows and vibrant colors.
*   **Format Selection:** Choose between high-quality video or audio-only downloads.
*   **Bilingual Support:** Built-in toggles for English and Arabic localization.
*   **Security:** Input validation to prevent Server-Side Request Forgery (SSRF) and malicious usage.

## Architecture

The application operates using a modern split-stack integrated into a single repository:
*   **Frontend:** React Single Page Application (SPA) bundled with Vite, styled utilizing Tailwind CSS.
*   **Backend:** Express server managing API requests and spawning `yt-dlp` child processes for streaming.

## Running Locally

To set up and run VanillaDownloader on your local machine, follow these steps:

### Prerequisites

*   Node.js installed on your system.
*   Git installed on your system.
*   `yt-dlp` binary (automatically handled during the build step, but requires `curl`).

### Installation

1.  Clone the repository:
    ```bash
    git clone git@github.com:PrimeSafar/vanilla-downloader.git
    cd vanilla-downloader
    ```

2.  Install all required dependencies:
    ```bash
    npm install
    ```

### Development Mode

To run the application in development mode (which provides Hot Module Replacement for the frontend):

1.  Start the Vite frontend development server:
    ```bash
    npm run dev
    ```

2.  In a separate terminal, start the Express backend server:
    ```bash
    node server.js
    ```

### Production Build

To build the application for production and run the unified server:

1.  Execute the build script. This compiles the React frontend and downloads the required `yt-dlp` binary:
    ```bash
    npm run build
    ```

2.  Start the production server:
    ```bash
    npm start
    ```

The application will now be accessible locally, serving the optimized frontend and handling API requests through the Express backend.

## Deployment

*   **Frontend:** Configured for deployment on Firebase Hosting.
*   **Backend:** Configured for deployment on Render, utilizing the start script `node server.js`.
