// ===============================================
// VALORANT AGENT UTILITIES
// ===============================================
// Provides agent-related constants, functions and mappings
// for preferred agent selection and display

// All Valorant agents with their roles and colors
const AGENT_DATA = {
    // Controllers
    astra: { name: 'Astra', role: 'Controller', color: '#9B59B6', emoji: '🌌' },
    brimstone: { name: 'Brimstone', role: 'Controller', color: '#E67E22', emoji: '🔥' },
    clove: { name: 'Clove', role: 'Controller', color: '#9B59B6', emoji: '🦋' },
    harbor: { name: 'Harbor', role: 'Controller', color: '#3498DB', emoji: '🌊' },
    omen: { name: 'Omen', role: 'Controller', color: '#2C3E50', emoji: '👻' },
    viper: { name: 'Viper', role: 'Controller', color: '#27AE60', emoji: '🐍' },

    // Duelists
    iso: { name: 'Iso', role: 'Duelist', color: '#9B59B6', emoji: '⚡' },
    jett: { name: 'Jett', role: 'Duelist', color: '#85C1E9', emoji: '💨' },
    neon: { name: 'Neon', role: 'Duelist', color: '#3498DB', emoji: '⚡' },
    phoenix: { name: 'Phoenix', role: 'Duelist', color: '#E74C3C', emoji: '🔥' },
    raze: { name: 'Raze', role: 'Duelist', color: '#E67E22', emoji: '💥' },
    reyna: { name: 'Reyna', role: 'Duelist', color: '#9B59B6', emoji: '👁️' },
    vyse: { name: 'Vyse', role: 'Duelist', color: '#F39C12', emoji: '🔧' },
    yoru: { name: 'Yoru', role: 'Duelist', color: '#3498DB', emoji: '🌀' },

    // Initiators
    breach: { name: 'Breach', role: 'Initiator', color: '#E67E22', emoji: '🦾' },
    fade: { name: 'Fade', role: 'Initiator', color: '#2C3E50', emoji: '👁️' },
    gekko: { name: 'Gekko', role: 'Initiator', color: '#27AE60', emoji: '🦎' },
    kayo: { name: 'KAY/O', role: 'Initiator', color: '#7F8C8D', emoji: '🤖' },
    skye: { name: 'Skye', role: 'Initiator', color: '#27AE60', emoji: '🦅' },
    sova: { name: 'Sova', role: 'Initiator', color: '#3498DB', emoji: '🏹' },
    tejo: { name: 'Tejo', role: 'Initiator', color: '#E74C3C', emoji: '🎯' },

    // Sentinels
    chamber: { name: 'Chamber', role: 'Sentinel', color: '#F1C40F', emoji: '🔫' },
    cypher: { name: 'Cypher', role: 'Sentinel', color: '#F1C40F', emoji: '📷' },
    deadlock: { name: 'Deadlock', role: 'Sentinel', color: '#7F8C8D', emoji: '🔒' },
    killjoy: { name: 'Killjoy', role: 'Sentinel', color: '#F1C40F', emoji: '🤖' },
    sage: { name: 'Sage', role: 'Sentinel', color: '#1ABC9C', emoji: '💚' },
    waylay: { name: 'Waylay', role: 'Sentinel', color: '#9B59B6', emoji: '🎭' },
};

// Role colors for grouping
const ROLE_COLORS = {
    Controller: '#9B59B6',
    Duelist: '#E74C3C',
    Initiator: '#3498DB',
    Sentinel: '#27AE60',
};

// Role emojis for display
const ROLE_EMOJIS = {
    Controller: '🌀',
    Duelist: '⚔️',
    Initiator: '🎯',
    Sentinel: '🛡️',
};

// Get all agents as array
function getAllAgents() {
    return Object.entries(AGENT_DATA).map(([key, data]) => ({
        id: key,
        ...data
    }));
}

// Get agents by role
function getAgentsByRole(role) {
    return Object.entries(AGENT_DATA)
        .filter(([, data]) => data.role === role)
        .map(([key, data]) => ({ id: key, ...data }));
}

// Get agent data by ID
function getAgentById(agentId) {
    const agent = AGENT_DATA[agentId.toLowerCase()];
    return agent ? { id: agentId.toLowerCase(), ...agent } : null;
}

// Get agent name by ID (convenience function)
function getAgentName(agentId) {
    const agent = AGENT_DATA[agentId.toLowerCase()];
    return agent ? agent.name : agentId;
}

// Get agent color by ID
function getAgentColor(agentId) {
    const agent = AGENT_DATA[agentId.toLowerCase()];
    return agent ? agent.color : '#808080';
}

// Get agent emoji by ID
function getAgentEmoji(agentId) {
    const agent = AGENT_DATA[agentId.toLowerCase()];
    return agent ? agent.emoji : '🎮';
}

// Get agent role by ID
function getAgentRole(agentId) {
    const agent = AGENT_DATA[agentId.toLowerCase()];
    return agent ? agent.role : 'Unknown';
}

// Validate agent ID
function isValidAgent(agentId) {
    return agentId && agentId.toLowerCase() in AGENT_DATA;
}

// Format agents for display (with emojis)
function formatAgentList(agentIds) {
    return agentIds
        .filter(isValidAgent)
        .map(id => {
            const agent = getAgentById(id);
            return `${agent.emoji} ${agent.name}`;
        })
        .join(', ');
}

// Format agents for compact display (just names)
function formatAgentListCompact(agentIds) {
    return agentIds
        .filter(isValidAgent)
        .map(id => getAgentName(id))
        .join(' / ');
}

// Get select menu options grouped by role
function getAgentSelectOptions() {
    const roles = ['Duelist', 'Initiator', 'Controller', 'Sentinel'];
    const options = [];

    for (const role of roles) {
        const agents = getAgentsByRole(role);
        for (const agent of agents) {
            options.push({
                label: agent.name,
                value: agent.id,
                description: `${role} ${ROLE_EMOJIS[role]}`,
                emoji: agent.emoji,
            });
        }
    }

    return options;
}

// Constants
const MAX_PREFERRED_AGENTS = 3;

module.exports = {
    AGENT_DATA,
    ROLE_COLORS,
    ROLE_EMOJIS,
    MAX_PREFERRED_AGENTS,
    getAllAgents,
    getAgentsByRole,
    getAgentById,
    getAgentName,
    getAgentColor,
    getAgentEmoji,
    getAgentRole,
    isValidAgent,
    formatAgentList,
    formatAgentListCompact,
    getAgentSelectOptions,
};
