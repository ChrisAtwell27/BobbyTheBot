const express = require("express");
const cors = require("cors");
const {
  getSettings,
  setSetting,
  getSetting,
} = require("../utils/settingsManager");

/**
 * Settings API Server
 * Provides REST endpoints for managing bot settings per guild.
 */
class SettingsServer {
  constructor(client) {
    this.client = client;
    this.app = express();
    this.apiKey =
      process.env.SETTINGS_API_KEY ||
      process.env.MAFIA_WEBHOOK_SECRET ||
      "default-secret";

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(
      cors({
        origin: process.env.SETTINGS_WEB_ORIGIN || "*",
        methods: ["GET", "POST", "PUT"],
        allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
      })
    );

    this.app.use((req, res, next) => {
      console.log(`[Settings API] ${req.method} ${req.path}`);
      next();
    });
  }

  verifyAuth(req, res, next) {
    const key = req.headers["x-api-key"];
    const auth = req.headers["authorization"];

    // Allow if key matches or bearer token matches
    if (
      key === this.apiKey ||
      (auth && auth.startsWith("Bearer ") && auth.substring(7) === this.apiKey)
    ) {
      return next();
    }

    res.status(401).json({ success: false, error: "Unauthorized" });
  }

  setupRoutes() {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "online", service: "Settings API" });
    });

    // Get all settings for a guild
    this.app.get(
      "/api/settings/:guildId",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const settings = await getSettings(guildId);
          res.json({ success: true, guildId, settings });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    );

    // Update a specific setting
    this.app.post(
      "/api/settings/:guildId",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { key, value } = req.body;

          if (!key) {
            return res
              .status(400)
              .json({ success: false, error: "Missing key" });
          }

          const result = await setSetting(guildId, key, value);

          if (result) {
            const newSettings = await getSettings(guildId);
            res.json({
              success: true,
              message: "Setting updated",
              settings: newSettings,
            });
          } else {
            res
              .status(500)
              .json({ success: false, error: "Failed to update setting" });
          }
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    );
  }

  start(port = 3003) {
    this.server = this.app.listen(port, () => {
      console.log(`✅ Settings API server listening on port ${port}`);
    });
  }

  stop() {
    if (this.server) this.server.close();
  }
}

module.exports = SettingsServer;
