/**
 * Mafia Game Roles - Town of Salem style with Bee theming
 *
 * Role Structure:
 * - name: Display name of the role
 * - emoji: Emoji representation
 * - team: 'bee', 'wasp', or 'neutral'
 * - subteam: For neutrals - 'killing', 'evil', or 'benign'
 * - description: Full role description
 * - abilities: Array of ability descriptions
 * - winCondition: How this role wins
 * - nightAction: Boolean - has night action
 * - actionType: Type of action (for processing)
 * - attack: Attack level (0=none, 1=basic, 2=powerful, 3=unstoppable)
 * - defense: Defense level (0=none, 1=basic, 2=powerful, 3=invincible)
 */

const ROLES = {
    // === BEE ROLES (Town equivalent) ===
    QUEENS_GUARD: {
        name: "Queen's Guard",
        emoji: '👮',
        team: 'bee',
        description: 'You are the **Queen\'s Guard**! You can investigate one player each night to see if they are suspicious (Wasp/Neutral Evil).',
        abilities: ['Investigate one player each night', 'Learn if they are suspicious or not'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'investigate_suspicious',
        attack: 0,
        defense: 0
    },
    SCOUT_BEE: {
        name: 'Scout Bee',
        emoji: '🔍',
        team: 'bee',
        description: 'You are a **Scout Bee**! You can investigate one player each night to learn their exact role.',
        abilities: ['Investigate one player each night', 'Learn their exact role'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'investigate_exact',
        attack: 0,
        defense: 0
    },
    NURSE_BEE: {
        name: 'Nurse Bee',
        emoji: '⚕️',
        team: 'bee',
        description: 'You are a **Nurse Bee**! You can heal one player each night, protecting them from basic attacks.',
        abilities: ['Heal one player each night', 'Prevents them from dying to basic attacks', 'Self-heal once'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'heal',
        attack: 0,
        defense: 0,
        selfHealsLeft: 1
    },
    GUARD_BEE: {
        name: 'Bodyguard Bee',
        emoji: '🛡️',
        team: 'bee',
        description: 'You are a **Bodyguard Bee**! You can protect one player each night. If they are attacked, you will die instead fighting the attacker.',
        abilities: ['Protect one player each night', 'Die in their place if attacked', 'Kill one attacker'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'guard',
        attack: 2, // Powerful attack against attacker
        defense: 0
    },
    LOOKOUT_BEE: {
        name: 'Lookout Bee',
        emoji: '👁️',
        team: 'bee',
        description: 'You are a **Lookout Bee**! You can watch one player each night to see who visits them.',
        abilities: ['Watch one player each night', 'See everyone who visits them'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'lookout',
        attack: 0,
        defense: 0
    },
    SOLDIER_BEE: {
        name: 'Soldier Bee',
        emoji: '⚔️',
        team: 'bee',
        description: 'You are a **Soldier Bee**! You have 3 bullets. You can shoot one player each night.',
        abilities: ['Shoot one player each night (3 bullets total)', 'Basic attack', 'If you shoot a Bee, you die from guilt'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'shoot',
        attack: 1, // Basic attack
        defense: 0,
        bullets: 3
    },
    QUEEN_BEE: {
        name: 'Queen Bee',
        emoji: '👑',
        team: 'bee',
        description: 'You are the **Queen Bee**! You can reveal yourself during the day to gain 3 extra votes.',
        abilities: ['Reveal during day phase for 3 extra votes'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: false,
        canReveal: true,
        attack: 0,
        defense: 0
    },
    WORKER_BEE: {
        name: 'Worker Bee',
        emoji: '🐝',
        team: 'bee',
        description: 'You are a **Worker Bee**! You have no special abilities, but you can help identify threats through discussion and voting.',
        abilities: ['Vote during the day phase'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: false,
        attack: 0,
        defense: 0
    },
    JAILER_BEE: {
        name: 'Jailer Bee',
        emoji: '⛓️',
        team: 'bee',
        description: 'You are a **Jailer Bee**! You can jail one player each night, protecting them but preventing their actions. You can execute your jailed target.',
        abilities: ['Jail one player each night', 'Target cannot perform actions or be visited', 'Execute jailed target (3 executions max)', 'If you execute a Bee, you lose all executions'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'jail',
        attack: 3, // Unstoppable execution
        defense: 0,
        executions: 3
    },
    ESCORT_BEE: {
        name: 'Escort Bee',
        emoji: '💃',
        team: 'bee',
        description: 'You are an **Escort Bee**! You can distract one player each night, preventing them from performing their action.',
        abilities: ['Roleblock one player each night', 'Prevent their night action', 'Cannot roleblock the same person twice in a row'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'roleblock',
        attack: 0,
        defense: 0
    },
    MEDIUM_BEE: {
        name: 'Medium Bee',
        emoji: '👻',
        team: 'bee',
        description: 'You are a **Medium Bee**! You can speak with the dead and learn information from the afterlife.',
        abilities: ['Speak with one dead player each night', 'Learn their role and last will'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'seance',
        attack: 0,
        defense: 0
    },
    VETERAN_BEE: {
        name: 'Veteran Bee',
        emoji: '🎖️',
        team: 'bee',
        description: 'You are a **Veteran Bee**! You can go on alert at night, killing anyone who visits you.',
        abilities: ['Go on alert 3 times', 'Kill all visitors with powerful attack', 'Cannot be roleblocked while on alert'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'alert',
        attack: 2, // Powerful attack
        defense: 0, // 2 when on alert
        alerts: 3
    },

    // === WASP ROLES (Mafia equivalent) ===
    WASP_QUEEN: {
        name: 'Wasp Queen',
        emoji: '👸',
        team: 'wasp',
        description: 'You are the **Wasp Queen**! You are the leader of the Wasps. You choose who to kill each night and cannot be detected by Queen\'s Guard.',
        abilities: ['Choose kill target each night', 'Basic attack', 'Basic defense', 'Immune to detection', 'Appear as not suspicious', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'mafia_kill',
        attack: 1, // Basic attack
        defense: 1, // Basic defense
        immuneToDetection: true
    },
    KILLER_WASP: {
        name: 'Killer Wasp',
        emoji: '🗡️',
        team: 'wasp',
        description: 'You are a **Killer Wasp**! You carry out the kills for the Wasp team.',
        abilities: ['Kill target chosen by Wasps', 'Basic attack', 'Become Wasp Queen if Queen dies', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'mafia_kill',
        attack: 1, // Basic attack
        defense: 0
    },
    DECEIVER_WASP: {
        name: 'Deceiver Wasp',
        emoji: '🎭',
        team: 'wasp',
        description: 'You are a **Deceiver Wasp**! You can frame one player each night, making them appear suspicious.',
        abilities: ['Frame one player each night', 'They will appear suspicious to investigators', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'frame',
        attack: 0,
        defense: 0
    },
    SPY_WASP: {
        name: 'Spy Wasp',
        emoji: '🕵️',
        team: 'wasp',
        description: 'You are a **Spy Wasp**! You can investigate one player each night to learn their exact role.',
        abilities: ['Investigate one player each night', 'Learn their exact role', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'consigliere',
        attack: 0,
        defense: 0
    },
    CONSORT_WASP: {
        name: 'Consort Wasp',
        emoji: '💋',
        team: 'wasp',
        description: 'You are a **Consort Wasp**! You can distract one player each night, preventing them from performing their action.',
        abilities: ['Roleblock one player each night', 'Prevent their night action', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'roleblock',
        attack: 0,
        defense: 0
    },
    JANITOR_WASP: {
        name: 'Janitor Wasp',
        emoji: '🧹',
        team: 'wasp',
        description: 'You are a **Janitor Wasp**! You can clean up a dead body, hiding their role and last will.',
        abilities: ['Clean one dead body (3 uses)', 'Hide their role from investigators', 'Learn the cleaned role yourself', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'clean',
        attack: 0,
        defense: 0,
        cleans: 3
    },
    DISGUISER_WASP: {
        name: 'Disguiser Wasp',
        emoji: '🎪',
        team: 'wasp',
        description: 'You are a **Disguiser Wasp**! You can disguise as someone who died, making you appear as their role to investigators.',
        abilities: ['Disguise as a dead player (3 uses)', 'Appear as their role to investigations', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'disguise',
        attack: 0,
        defense: 0,
        disguises: 3
    },

    // === NEUTRAL ROLES ===
    MURDER_HORNET: {
        name: 'Murder Hornet',
        emoji: '💀',
        team: 'neutral',
        subteam: 'killing',
        description: 'You are a **Murder Hornet**! You must kill everyone who opposes you. You kill anyone who visits you.',
        abilities: ['Kill one player each night', 'Basic attack', 'Kill anyone who visits you', 'Basic defense'],
        winCondition: 'Be the last player alive',
        nightAction: true,
        actionType: 'serial_kill',
        attack: 1, // Basic attack
        defense: 1 // Basic defense
    },
    FIRE_ANT: {
        name: 'Fire Ant',
        emoji: '🔥',
        team: 'neutral',
        subteam: 'killing',
        description: 'You are a **Fire Ant**! You can douse players in gasoline and ignite them all at once.',
        abilities: ['Douse one player each night OR ignite all doused', 'Unstoppable attack when igniting', 'Basic defense', 'Immune to fire'],
        winCondition: 'Be the last player alive',
        nightAction: true,
        actionType: 'arsonist',
        attack: 3, // Unstoppable when igniting
        defense: 1 // Basic defense
    },
    CLOWN_BEETLE: {
        name: 'Clown Beetle',
        emoji: '🤡',
        team: 'neutral',
        subteam: 'evil',
        description: 'You are a **Clown Beetle** (Jester)! Your goal is to be voted out during the day.',
        abilities: ['Haunt one guilty voter after being lynched'],
        winCondition: 'Get yourself lynched during the day',
        nightAction: false,
        attack: 3, // Unstoppable haunt
        defense: 0
    },
    BOUNTY_HUNTER: {
        name: 'Bounty Hunter',
        emoji: '🎯',
        team: 'neutral',
        subteam: 'evil',
        description: 'You are a **Bounty Hunter** (Executioner)! You have a target that you must get lynched.',
        abilities: ['Get your target lynched during the day', 'Become Clown Beetle if target dies at night'],
        winCondition: 'See your target lynched',
        nightAction: false,
        hasTarget: true,
        attack: 0,
        defense: 1 // Basic defense
    },
    BUTTERFLY: {
        name: 'Butterfly',
        emoji: '🦋',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are a **Butterfly** (Survivor)! You just want to survive until the end.',
        abilities: ['Put on a vest 4 times for powerful defense'],
        winCondition: 'Survive to the end of the game',
        nightAction: true,
        actionType: 'vest',
        attack: 0,
        defense: 0, // 2 when vested
        vests: 3
    },
    SPIDER: {
        name: 'Spider',
        emoji: '🕷️',
        team: 'neutral',
        subteam: 'evil',
        description: 'You are a **Spider** (Witch)! You can control one player each night, forcing them to target another.',
        abilities: ['Control one player to visit another', 'Basic defense'],
        winCondition: 'Survive to see Bees or Wasps lose',
        nightAction: true,
        actionType: 'witch',
        attack: 0,
        defense: 1 // Basic defense
    },
    AMNESIAC_BEETLE: {
        name: 'Amnesiac Beetle',
        emoji: '🪲',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are an **Amnesiac Beetle**! You have forgotten your role. You can remember the role of a dead player.',
        abilities: ['Remember the role of any dead player', 'Become that role and join their team', 'Must choose before all roles are revealed'],
        winCondition: 'Remember a role, then win with that team',
        nightAction: true,
        actionType: 'remember',
        attack: 0,
        defense: 1, // Basic defense
        hasRemembered: false
    }
};

module.exports = { ROLES };
