module.exports = {
  apps: [
    {
      name: "cli-web",
      script: "npm",
      args: "run start",
      env: {
        PORT: 5000,
        NODE_ENV: "production",
      },
    },
  ],
};
