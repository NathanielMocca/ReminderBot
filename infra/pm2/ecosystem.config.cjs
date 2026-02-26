module.exports = {
  apps: [
    {
      name: "reminder-server",
      cwd: "./apps/server",
      script: "dist/apps/server/src/index.js",
      interpreter: "node",
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "reminder-bot",
      cwd: "./apps/bot",
      script: "dist/apps/bot/src/index.js",
      interpreter: "node",
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
