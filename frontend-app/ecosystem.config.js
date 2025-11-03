module.exports = {
  apps: [
    {
      name: "next-scraper-web",
      cwd: "./",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" },
    },
    {
      name: "next-scraper-worker",
      cwd: "./",
      script: "node",
      args: ".next/standalone/src/worker/scrapeRunner.js",
      // If you’re not using standalone build, point directly to ts-node or built file
      // args: "dist/worker/scrapeRunner.js",
      env: {
        NODE_ENV: "production",
        SCRAPER_PY: "py",
        SCRAPER_PY_VERSION: "-3.11",
        SCRAPER_PATH:
          "C:/Users/kingl/__code/next-scraper/backend-app/baltimore_violations_scraper.py",
        SCRAPER_OUT: "C:/Users/kingl/__code/next-scraper/backend-app/data",
      },
    },
  ],
};
