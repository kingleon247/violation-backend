// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "violation-worker",
      script: "tsx",
      args: "src/worker/scrapeRunner.ts",
      cwd: "./frontend-app",
      env: {
        NODE_ENV: "production",
        // DB + worker config:
        DB_URL: process.env.DB_URL,
        SCRAPER_PY:
          "C:/Users/kingl/__code/next-scraper/backend-app/.venv/Scripts/python.exe",
        SCRAPER_PY_VERSION: "",
        SCRAPER_PATH:
          "C:/Users/kingl/__code/next-scraper/backend-app/baltimore_violations_scraper.py",
        SCRAPER_OUT: "C:/Users/kingl/__code/next-scraper/backend-app/data",
        SCRAPER_TIMEOUT_MS: "240000", // 4m per neighborhood (tune as needed)
        SCRAPER_STALE_MINUTES: "15",
        SCRAPER_IDLE_SLEEP_MS: "2000",
        SCRAPER_REAP_EVERY: "15",
        WORKER_LOG_JSON: "1",
      },
      // Auto-restart & health
      watch: false,
      autorestart: true,
      max_restarts: 50,
      exp_backoff_restart_delay: 2000,
      // Keep logs bounded
      error_file: "./frontend-app/.pm2/worker-error.log",
      out_file: "./frontend-app/.pm2/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS Z",
      // Windows friendly
      windowsHide: true,
    },
  ],
};
