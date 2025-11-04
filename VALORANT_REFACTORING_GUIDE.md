# Valorant Handler Refactoring Guide

This document outlines the refactoring completed and remaining work for the Valorant handlers.

## ✅ Completed Modules

### 1. Core Utilities
- **utils/validators.js** - Input validation and sanitization
- **utils/interactionUtils.js** - Safe Discord interaction handling
- **utils/valorantCanvasUtils.js** - Shared canvas visualization utilities

### 2. Valorant API Modules
- **valorantApi/apiClient.js** - HTTP requests to Henrik Dev API
- **valorantApi/rankUtils.js** - Rank mappings and calculations
- **valorantApi/registrationManager.js** - User registration CRUD operations
- **valorantApi/matchStats.js** - Match statistics processing
- **valorantApi/statsVisualizer.js** - Player profile visualization
- **valorantApi/teamBalancer.js** - Team balancing algorithms

## 📝 Refactoring valorantApiHandler.js

### Changes Needed at Top of File

Replace lines 1-270 with:

```javascript
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');

// Import new modules
const { validateValorantRegistration } = require('../utils/validators');
const { safeInteractionResponse } = require('../utils/interactionUtils');

// Import Valorant API modules
const { getAccountData, getMMRData, getStoredMatches } = require('../valorantApi/apiClient');
const { RANK_MAPPING, loadRankImage, createFallbackRankIcon, getRankInfo, calculateMMR } = require('../valorantApi/rankUtils');
const {
    getUserRegistration,
    getAllRegisteredUsers,
    addUserRegistration,
    removeUserRegistration,
    getUserRankData,
    isUserRegistered,
    getRegistrationCount
} = require('../valorantApi/registrationManager');
const { getPlayerMatchStats } = require('../valorantApi/matchStats');
const { createStatsVisualization } = require('../valorantApi/statsVisualizer');
const { calculateEnhancedSkillScore, createBalancedTeams } = require('../valorantApi/teamBalancer');

// Valid regions (from validators)
const { VALID_REGIONS } = require('../utils/validators');
```

### Functions to Remove (Now in Modules)

These functions are now imported from modules and can be removed:
- Lines 78-131: `loadUserRegistrations`, `saveUserRegistrations`, `addUserRegistration`, `removeUserRegistration`
- Lines 134-166: `loadRankImage`, `createFallbackRankIcon`
- Lines 169-216: `makeAPIRequest`
- Lines 219-241: `loadImageFromURL`
- Lines 244-264: `getUserRegistration`, `getUserRankData`, `getAllRegisteredUsers`
- Lines 273-463: `getPlayerMatchStats`, `getPlayerMatchStatsLegacy`
- Lines 466-738: `createStatsVisualization`
- Lines 741-784: `safeInteractionResponse`
- Lines 1429-1517: `calculateEnhancedSkillScore`, `createBalancedTeams`

### Functions to Keep

These are specific to this handler and should remain:
- `showRegistrationPrompt` (line 1592)
- `handleRegistrationSubmission` (line 1646) - but add validation
- `showUserStats` (line 1711)
- `showUserMatches` (needs to be added if not present)
- `handleCreateTeams` (line 1202)
- `displayBalancedTeams` (line 1519)

### Add Validation to Registration

In `handleRegistrationSubmission` function (around line 1646), add:

```javascript
// Validate inputs
const validation = validateValorantRegistration({
    name: name,
    tag: tag,
    region: region
});

if (!validation.valid) {
    const errorMessages = Object.values(validation.errors).join('\\n');
    return await safeInteractionResponse(interaction, 'reply', {
        content: `❌ Validation failed:\\n${errorMessages}`,
        ephemeral: true
    });
}

// Use sanitized values
const { name: cleanName, tag: cleanTag, region: cleanRegion } = validation.sanitized;
```

## 🔄 Next Steps

1. **Test Current Setup**
   - Verify all new modules work independently
   - Test imports don't cause conflicts

2. **Update Smaller Handlers First**
   - valorantTeamHandler.js (906 lines)
   - valorantInhouseHandler.js (970 lines)
   - valorantMapHandler.js (904 lines)

3. **Complete valorantApiHandler.js Refactoring**
   - Remove duplicate functions
   - Add validation
   - Test all commands

## 📊 Benefits

- **Security**: Input validation prevents injection attacks
- **Maintainability**: Single source of truth for each function
- **Performance**: Image caching reduces redundant loads
- **Testability**: Modules can be unit tested independently
- **Code Reuse**: Other handlers can now use these modules easily
