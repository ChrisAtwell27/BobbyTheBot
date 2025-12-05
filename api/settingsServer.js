const express = require("express");
const cors = require("cors");
const {
  getSettings,
  setSetting,
  getSetting,
  getServerTier,
} = require("../utils/settingsManager");
const { getRequirement, meetsRequirement } = require("../config/settingTiers");

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
        methods: ["GET", "POST", "PUT", "DELETE"],
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
          const tier = await getServerTier(guildId); // Get current tier
          res.json({ success: true, guildId, tier, settings });
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

          // Check Tier Permissions
          const currentTier = await getServerTier(guildId);
          const requiredTier = getRequirement(key);

          if (!meetsRequirement(currentTier, requiredTier)) {
            return res.status(403).json({
              success: false,
              error: "Forbidden: Higher subscription tier required",
              tier: { current: currentTier, required: requiredTier },
            });
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

    // =====================================================================
    // ADMIN ROLES MANAGEMENT ENDPOINTS
    // =====================================================================

    // Get admin roles for a guild
    this.app.get(
      "/api/settings/:guildId/admin-roles",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const adminRoles = await getSetting(guildId, "adminRoles", []);

          // Also fetch role names from Discord if client is available
          let rolesWithNames = [];
          if (this.client && Array.isArray(adminRoles)) {
            try {
              const guild = await this.client.guilds.fetch(guildId);
              rolesWithNames = adminRoles.map((roleId) => {
                const role = guild.roles.cache.get(roleId);
                return {
                  id: roleId,
                  name: role ? role.name : "Unknown Role",
                  color: role ? role.hexColor : "#000000",
                };
              });
            } catch (fetchError) {
              // If we can't fetch guild, just return IDs
              rolesWithNames = adminRoles.map((roleId) => ({
                id: roleId,
                name: "Unknown",
                color: "#000000",
              }));
            }
          }

          res.json({
            success: true,
            guildId,
            adminRoles: rolesWithNames,
            adminRoleIds: adminRoles,
          });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    );

    // Add an admin role
    this.app.post(
      "/api/settings/:guildId/admin-roles",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { roleId } = req.body;

          if (!roleId) {
            return res
              .status(400)
              .json({ success: false, error: "Missing roleId" });
          }

          // Get current admin roles
          const currentRoles = await getSetting(guildId, "adminRoles", []);

          // Check if role already exists
          if (currentRoles.includes(roleId)) {
            return res
              .status(400)
              .json({ success: false, error: "Role is already an admin role" });
          }

          // Add the new role
          const newRoles = [...currentRoles, roleId];
          const result = await setSetting(guildId, "adminRoles", newRoles);

          if (result) {
            res.json({
              success: true,
              message: "Admin role added",
              adminRoles: newRoles,
            });
          } else {
            res
              .status(500)
              .json({ success: false, error: "Failed to add admin role" });
          }
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    );

    // Remove an admin role
    this.app.delete(
      "/api/settings/:guildId/admin-roles/:roleId",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId, roleId } = req.params;

          // Get current admin roles
          const currentRoles = await getSetting(guildId, "adminRoles", []);

          // Check if role exists
          if (!currentRoles.includes(roleId)) {
            return res
              .status(404)
              .json({ success: false, error: "Role is not an admin role" });
          }

          // Remove the role
          const newRoles = currentRoles.filter((id) => id !== roleId);
          const result = await setSetting(guildId, "adminRoles", newRoles);

          if (result) {
            res.json({
              success: true,
              message: "Admin role removed",
              adminRoles: newRoles,
            });
          } else {
            res
              .status(500)
              .json({ success: false, error: "Failed to remove admin role" });
          }
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    );

    // Get all available roles in the guild (for selection dropdown)
    this.app.get(
      "/api/settings/:guildId/available-roles",
      this.verifyAuth.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;

          if (!this.client) {
            return res
              .status(500)
              .json({ success: false, error: "Bot client not available" });
          }

          const guild = await this.client.guilds.fetch(guildId);
          const roles = guild.roles.cache
            .filter((role) => !role.managed && role.name !== "@everyone")
            .sort((a, b) => b.position - a.position)
            .map((role) => ({
              id: role.id,
              name: role.name,
              color: role.hexColor,
              position: role.position,
            }));

          res.json({
            success: true,
            guildId,
            roles,
          });
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
