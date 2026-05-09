module.exports = {
  apps: [
    {
      name: "cli-web",
      script: "node",
      // Add your command and flags after --name:
      //   e.g. "dist/index.js --name 'Claude' claude --dangerously-skip-permissions"
      args: "dist/index.js --name 'cli' bash",
      env: {
        PORT: 5000,
        NODE_ENV: "production",
      },
    },
  ],
};
