// config.js
module.exports = {
    roleMessageIds: {
        matchmaking: "1276256865092636784",
        smashBros: "1276256865092636784",
        valorant: "1276293355399151760",
        minecraft: "1276294247108182016",
        lethalcompany: "1276296159564005416",
        miscgames: "1276296976182411335",
        updates: "1276298066789535765",
        repo: "1395453341890248754",
        dbd: "1425834397017309227",
        valRanks: "REPLACE_WITH_MESSAGE_ID" // Add the message ID from !setupvalranks command
    },
    roleMappings: {
        'EggGold': '818839698306236487',
        'dancin': '768666021178638396',
        'jettCool': '1058201257338228757',
        'steveChairSpin': '701465918634459146',
        'diamond': '818840981293891675',
        'Bracken': '1190377213342777474',
        '🔥': '1021080456223019108',
        'pingsock': '701465164716703808',
        'mega_grin': '1349166787526397982',
        'ghosty': '767531901128409109',
        // Valorant Rank Roles - Replace with your actual role IDs
        'Iron': '1437184754624630937',
        'Bronze': '1437184839320342678',
        'Silver': '1437184911801979010',
        'Gold': '1437184972833296394',
        'Platinum': '1437185027132621070',
        'Diamond': '1437185100939792595',
        'Ascendant': '1437185137778360360',
        'Immortal': '1437185506780647494',
        'Radiant': '1437185548950310942'
    },
    // Array of Valorant rank role IDs for mutual exclusivity
    valorantRankRoles: [
        'REPLACE_WITH_IRON_ROLE_ID',
        'REPLACE_WITH_BRONZE_ROLE_ID',
        'REPLACE_WITH_SILVER_ROLE_ID',
        'REPLACE_WITH_GOLD_ROLE_ID',
        'REPLACE_WITH_PLATINUM_ROLE_ID',
        'REPLACE_WITH_DIAMOND_ROLE_ID',
        'REPLACE_WITH_ASCENDANT_ROLE_ID',
        'REPLACE_WITH_IMMORTAL_ROLE_ID',
        'REPLACE_WITH_RADIANT_ROLE_ID'
    ],
    topEggRoleId: '701309444562092113',
    thinIceRoleId: '1210273721705693217', // Replace with your Thin Ice role ID
    loggingChannelId: '1276266582234103808', // Replace with your logging channel ID
    alertChannelId: '1276267465227108455', // Replace with your alert channel ID
    announcementsChannelId: '1276298066789535765', // Announcements channel for birthday wishes
    changelogChannelId: '1435984527531970632', // Channel for posting GitHub commit updates
    alertKeywords: ['ban', 'kick', 'trouble'],// Replace with the keywords you want to monitor

    // API Keys - Use environment variables (preferred for security)
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY // Always use environment variable for OpenAI key
};
