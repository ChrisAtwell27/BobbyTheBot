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
        description: 'You are a **Soldier Bee**! You have 1 bullets. You can shoot one player at night.',
        abilities: ['Shoot one player each night (1 bullets total)', 'Basic attack', 'If you shoot a Bee, you die from guilt'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'shoot',
        attack: 1, // Basic attack
        defense: 0,
        bullets: 1
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
    TRACKER_BEE: {
        name: 'Tracker Bee',
        emoji: '🗺️',
        team: 'bee',
        description: 'You are a **Tracker Bee**! You can follow one player each night to see who they visit.',
        abilities: ['Follow one player each night', 'See who they visit', 'Does not see what action they perform'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'track',
        attack: 0,
        defense: 0
    },
    POLLINATOR_BEE: {
        name: 'Pollinator Bee',
        emoji: '🌸',
        team: 'bee',
        description: 'You are a **Pollinator Bee**! You can pollinate a player each night. The next night, you will see everyone who visited them and everyone they visited.',
        abilities: ['Pollinate one player each night', 'Receive results from 2 nights ago', 'See all visitors to target and all players target visited'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'pollinate',
        attack: 0,
        defense: 0
    },
    SPY_BEE: {
        name: 'Spy Bee',
        emoji: '🕵️',
        team: 'bee',
        description: 'You are a **Spy Bee**! You can see who the Wasps visit each night and read all their communications.',
        abilities: ['See all Wasp visits each night', 'Read all Wasp chat messages', 'Identify Wasp targets and plans'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'spy',
        attack: 0,
        defense: 0
    },
    TRAPPER_BEE: {
        name: 'Trapper Bee',
        emoji: '🪤',
        team: 'bee',
        description: 'You are a **Trapper Bee**! You can set a trap at one player\'s house. If an attacker visits, they are roleblocked and revealed to you.',
        abilities: ['Set a trap at one player\'s house each night', 'Attackers visiting are roleblocked', 'Learn the identity of trapped attackers'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'trap',
        attack: 0,
        defense: 0
    },
    RETRIBUTIONIST_BEE: {
        name: 'Retributionist Bee',
        emoji: '⚰️',
        team: 'bee',
        description: 'You are a **Retributionist Bee**! Once per game, you can revive a dead Bee to use their ability for one night.',
        abilities: ['Revive one dead Bee once per game', 'Revived player uses their ability for one night', 'Only works on Bee team members'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'retribution',
        attack: 0,
        defense: 0,
        hasRevived: false
    },
    BEEKEEPER: {
        name: 'Beekeeper',
        emoji: '🍯',
        team: 'bee',
        description: 'You are a **Beekeeper**! You can choose to protect the hive or inspect honey stores each night.',
        abilities: ['Protect the hive: Learn if Wasps tried to kill tonight (once per game)', 'Inspect stores: Learn how many Wasps are alive', 'Choose your action each night'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'beekeeper',
        attack: 0,
        defense: 0,
        hasProtected: false
    },
    LIBRARIAN_BEE: {
        name: 'Librarian Bee',
        emoji: '📚',
        team: 'bee',
        description: 'You are a **Librarian Bee**! You can investigate if a player has special powers (limited-use abilities).',
        abilities: ['Investigate one player each night', 'Learn if they have limited-use abilities (bullets, vests, cleans, etc.)', 'Does not reveal exact role or which ability'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'librarian',
        attack: 0,
        defense: 0
    },
    CORONER_BEE: {
        name: 'Coroner Bee',
        emoji: '🔬',
        team: 'bee',
        description: 'You are a **Coroner Bee**! You can examine dead players to learn how they died.',
        abilities: ['Examine one dead player each night', 'Learn how they died (attacked, lynched, poison, etc.)', 'If attacked, learn attack level (basic/powerful/unstoppable)'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'coroner',
        attack: 0,
        defense: 0
    },
    TRANSPORTER_BEE: {
        name: 'Transporter Bee',
        emoji: '🔄',
        team: 'bee',
        description: 'You are a **Transporter Bee**! You can swap two players each night, redirecting all actions targeting them.',
        abilities: ['Choose two players each night', 'All actions targeting them are swapped', 'Visitors targeting player A go to player B and vice versa', 'Can cause chaos or save people'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'transport',
        attack: 0,
        defense: 0
    },
    PSYCHIC_BEE: {
        name: 'Psychic Bee',
        emoji: '🔮',
        team: 'bee',
        description: 'You are a **Psychic Bee**! You receive visions showing you suspects each night.',
        abilities: ['Receive a vision of 3 random players each night', 'At least one is Evil (Wasp or Evil Neutral)', 'Use deduction to narrow down suspects'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: true,
        actionType: 'psychic',
        attack: 0,
        defense: 0
    },
    MARSHAL_BEE: {
        name: 'Marshal Bee',
        emoji: '🎖️',
        team: 'bee',
        description: 'You are a **Marshal Bee**! You can protect someone from being lynched if they are innocent.',
        abilities: ['Choose one player during day phase (before voting)', 'If they are lynched and are Bee team, you reveal and save them', 'If Wasp or Evil Neutral, they still die', 'One-time use'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: false,
        actionType: 'marshal',
        attack: 0,
        defense: 0,
        hasUsedProtection: false
    },
    MUTE_BEE: {
        name: 'Mute Bee',
        emoji: '🤐',
        team: 'bee',
        description: 'You are a **Mute Bee**! You are mute and cannot speak in voice, but when you communicate in text, its translated to emojis!',
        abilities: ['Server muted for entire game', 'All text messages are translated to emojis', 'Can hear voice chat normally', 'Can still participate in voting', 'Unique emoji communication style'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: false,
        attack: 0,
        defense: 0,
        isMuteBee: true // Special flag for message handling
    },
    DEAF_BEE: {
        name: 'Deaf Bee',
        emoji: '🦻',
        team: 'bee',
        description: 'You are a **Deaf Bee**! You are deafened and cannot hear voice chat, but you can read text and speak normally!',
        abilities: ['Server deafened for entire game', 'Cannot hear voice communications', 'Can speak in voice and text normally', 'Can still participate in voting', 'Rely on text chat for information'],
        winCondition: 'Eliminate all Wasps and harmful Neutrals',
        nightAction: false,
        attack: 0,
        defense: 0,
        isDeafBee: true // Special flag for voice state handling
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
    BLACKMAILER_WASP: {
        name: 'Blackmailer Wasp',
        emoji: '🤐',
        team: 'wasp',
        description: 'You are a **Blackmailer Wasp**! You can blackmail one player each night, preventing them from talking during the next day phase.',
        abilities: ['Blackmail one player each night', 'Target cannot send messages during next day phase', 'Can be revealed if they try to speak', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'blackmail',
        attack: 0,
        defense: 0
    },
    HYPNOTIST_WASP: {
        name: 'Hypnotist Wasp',
        emoji: '🌀',
        team: 'wasp',
        description: 'You are a **Hypnotist Wasp**! You can hypnotize one player each night to give them false feedback about what happened.',
        abilities: ['Hypnotize one player each night', 'Give them false night feedback', 'Confuse investigators with fake messages', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'hypnotize',
        attack: 0,
        defense: 0
    },
    POISONER_WASP: {
        name: 'Poisoner Wasp',
        emoji: '🧪',
        team: 'wasp',
        description: 'You are a **Poisoner Wasp**! You can poison one player each night. They will die in 2 nights unless healed.',
        abilities: ['Poison one player each night', 'Victim dies in 2 nights', 'Poison can be cured by healing', 'Poison is undetectable until death', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'poison',
        attack: 1, // Basic attack (delayed)
        defense: 0
    },
    SABOTEUR_WASP: {
        name: 'Saboteur Wasp',
        emoji: '⚙️',
        team: 'wasp',
        description: 'You are a **Saboteur Wasp**! You can sabotage one player each night. Their ability fails without them knowing.',
        abilities: ['Sabotage one player each night', 'Their action fails silently', 'They receive false success feedback', 'Different from roleblock - appears to succeed', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'sabotage',
        attack: 0,
        defense: 0
    },
    MIMIC_WASP: {
        name: 'Mimic Wasp',
        emoji: '🎨',
        team: 'wasp',
        description: 'You are a **Mimic Wasp**! You can disguise as a Bee role each night. If investigated, you appear as that role.',
        abilities: ['Choose a Bee role each night (3 uses)', 'Appear as that role if investigated', 'Must predict investigator timing', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'mimic',
        attack: 0,
        defense: 0,
        mimics: 3
    },
    SILENCER_WASP: {
        name: 'Silencer Wasp',
        emoji: '🔇',
        team: 'wasp',
        description: 'You are a **Silencer Wasp**! You can silence one player each night, making their ability results return nothing.',
        abilities: ['Choose one player each night (3 uses)', 'Their ability results return "No result"', 'Does not roleblock them - they think it worked', 'More subtle than Saboteur', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'silencer',
        attack: 0,
        defense: 0,
        silences: 3
    },
    MOLE_WASP: {
        name: 'Mole Wasp',
        emoji: '🐛',
        team: 'wasp',
        description: 'You are a **Mole Wasp**! Each night, you learn the role of one random Bee.',
        abilities: ['Automatically learn one random Bee role each night', 'Cannot learn the same Bee twice', 'No control over who you learn', 'Basic defense', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'mole',
        attack: 0,
        defense: 1 // Basic defense
    },
    KIDNAPPER_WASP: {
        name: 'Kidnapper Wasp',
        emoji: '🎒',
        team: 'wasp',
        description: 'You are a **Kidnapper Wasp**! Once per game, you can kidnap someone for an entire cycle.',
        abilities: ['Once per game, kidnap one player', 'They cannot act, vote, or be visited for 1 night/day cycle', 'They can see and talk in Wasp chat during kidnapping', 'They return next night', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'kidnap',
        attack: 0,
        defense: 0,
        hasKidnapped: false
    },
    YAKUZA_WASP: {
        name: 'Yakuza Wasp',
        emoji: '⚡',
        team: 'wasp',
        description: 'You are a **Yakuza Wasp**! Once per game, you can convert a neutral player to become a Wasp.',
        abilities: ['Once per game, convert a neutral player', 'They become a Killer Wasp', 'Fails on Bees or Neutral Killing roles', 'Basic defense', 'Communicate with Wasps'],
        winCondition: 'Equal or outnumber all other players',
        nightAction: true,
        actionType: 'yakuza',
        attack: 0,
        defense: 1, // Basic defense
        hasConverted: false
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
    },
    PIRATE_BEETLE: {
        name: 'Pirate Beetle',
        emoji: '🏴‍☠️',
        team: 'neutral',
        subteam: 'chaos',
        description: 'You are a **Pirate Beetle**! You must plunder players by dueling them at night. Win 2 duels to achieve victory.',
        abilities: ['Challenge one player to a duel each night (rock-paper-scissors)', 'Win 2 duels to win the game', 'Basic defense', 'Become Butterfly after winning'],
        winCondition: 'Successfully plunder 2 players by winning duels',
        nightAction: true,
        actionType: 'pirate_duel',
        attack: 0,
        defense: 1, // Basic defense
        duelsWon: 0,
        duelsNeeded: 2
    },
    GUARDIAN_ANT: {
        name: 'Guardian Ant',
        emoji: '🐜',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are a **Guardian Ant**! You choose one player on Night 1 to protect. They cannot die at night while you live.',
        abilities: ['Choose one player to guard on Night 1', 'Target cannot die at night while you are alive', 'If target dies, become Butterfly', 'Basic defense'],
        winCondition: 'Keep your target alive and see them win',
        nightAction: true,
        actionType: 'guardian',
        attack: 0,
        defense: 1, // Basic defense
        hasTarget: true,
        guardianTarget: null
    },
    GOSSIP_BEETLE: {
        name: 'Gossip Beetle',
        emoji: '🗣️',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are a **Gossip Beetle**! You can send anonymous messages to players at night to spread rumors and create chaos.',
        abilities: ['Send one anonymous message each night', 'Messages appear as "Anonymous Gossip"', 'Spread false information and create chaos', 'Basic defense'],
        winCondition: 'Survive to the end of the game',
        nightAction: true,
        actionType: 'gossip',
        attack: 0,
        defense: 1 // Basic defense
    },
    PHANTOM_MOTH: {
        name: 'Phantom Moth',
        emoji: '👤',
        team: 'neutral',
        subteam: 'evil',
        description: 'You are a **Phantom Moth**! If you get lynched during the day, you become invisible and return after 1 cycle.',
        abilities: ['No night action', 'Survive being lynched once', 'Become invisible for 1 night/day cycle', 'Return to the game after', 'Must survive to the end after returning'],
        winCondition: 'Get lynched, then survive to the end',
        nightAction: false,
        attack: 0,
        defense: 1, // Basic defense
        hasBeenLynched: false
    },
    GAMBLER_BEETLE: {
        name: 'Gambler Beetle',
        emoji: '🎰',
        team: 'neutral',
        subteam: 'chaos',
        description: 'You are a **Gambler Beetle**! Bet on who will die each night. Collect 3 coins to win!',
        abilities: ['Bet on one player each night', 'Gain a lucky coin if they die', 'Win at 3 coins', 'Spend 1 coin to survive an attack'],
        winCondition: 'Collect 3 lucky coins by correctly predicting deaths',
        nightAction: true,
        actionType: 'gamble',
        attack: 0,
        defense: 0, // Special coin defense
        luckyCoins: 0
    },
    MATCHMAKER_BEETLE: {
        name: 'Matchmaker Beetle',
        emoji: '💕',
        team: 'neutral',
        subteam: 'chaos',
        description: 'You are a **Matchmaker Beetle**! On Night 1, you are linked with one random player. If they die, you die. If they win, you win.',
        abilities: ['Automatically linked with one player on Night 1', 'If they die, you die', 'If they win, you win', 'They don\'t know about the link', 'Basic defense'],
        winCondition: 'Your linked partner wins',
        nightAction: false,
        attack: 0,
        defense: 1, // Basic defense
        hasLinkedPartner: false,
        linkedPartner: null,
        minPlayers: 10
    },
    DOPPELGANGER: {
        name: 'Doppelgänger',
        emoji: '🎭',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are a **Doppelgänger**! On Night 1, choose a player. You become their exact role and team, but they don\'t know.',
        abilities: ['Choose one player on Night 1', 'Become their exact role and team', 'If they die, you die', 'They don\'t know you copied them'],
        winCondition: 'Win with the team of whoever you copied',
        nightAction: true,
        actionType: 'doppelganger',
        attack: 0,
        defense: 0,
        hasCopied: false,
        copiedTarget: null
    },
    ORACLE: {
        name: 'Oracle',
        emoji: '🔮',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are an **Oracle**! Each night, receive a cryptic hint about the game state to help you survive.',
        abilities: ['Receive cryptic hints each night', 'Hints about game state, visits, or future events', 'Use information to play both sides', 'Basic defense'],
        winCondition: 'Survive to the end of the game',
        nightAction: true,
        actionType: 'oracle',
        attack: 0,
        defense: 1 // Basic defense
    },
    JUDGE: {
        name: 'Judge',
        emoji: '⚖️',
        team: 'neutral',
        subteam: 'chaos',
        description: 'You are a **Judge**! You can force a revote during voting phase once per game.',
        abilities: ['Once per game, cancel all current votes and force a revote', 'Must be used before execution', 'Can save someone or force different target', 'Must successfully change the vote outcome to win'],
        winCondition: 'Survive and successfully use your ability to change a vote outcome, then survive to end',
        nightAction: false,
        attack: 0,
        defense: 1, // Basic defense
        hasUsedAbility: false,
        changedOutcome: false
    },
    MERCENARY: {
        name: 'Mercenary',
        emoji: '💰',
        team: 'neutral',
        subteam: 'benign',
        description: 'You are a **Mercenary**! You are automatically assigned to help either Bees or Wasps.',
        abilities: ['Randomly assigned to Bee or Wasp side on Night 1', 'Receive 2 bulletproof vests', 'Learn which side you are on', 'Win with your assigned team'],
        winCondition: 'Win with assigned team (Bees or Wasps)',
        nightAction: true,
        actionType: 'vest', // Uses vest like Butterfly
        attack: 0,
        defense: 0, // Vests provide defense
        vests: 2,
        assignedTeam: null // Will be set to 'bee' or 'wasp'
    },
    CULTIST: {
        name: 'Cultist',
        emoji: '🕯️',
        team: 'neutral',
        subteam: 'evil',
        description: 'You are a **Cultist**! Convert players to your cult and win together.',
        abilities: ['Convert one player each night', 'Converted players join the Cult', 'Win after converting 3 players', 'Fails on Wasps and Neutral Killing roles', 'Basic defense'],
        winCondition: 'Convert 3 players and have all cult members alive',
        nightAction: true,
        actionType: 'cultist',
        attack: 0,
        defense: 1, // Basic defense
        conversions: 0
    },
    WILDCARD: {
        name: 'Wildcard',
        emoji: '🎲',
        team: 'neutral',
        subteam: 'chaos',
        description: 'You are a **Wildcard**! Each night, you randomly receive a different ability.',
        abilities: ['Randomly receive one ability each night:', '1) Basic Defense', '2) Random Investigation Result', '3) See who visited you', '4) Roleblock Immunity', '5) Nothing'],
        winCondition: 'Survive to the end of the game',
        nightAction: true,
        actionType: 'wildcard',
        attack: 0,
        defense: 0 // Varies by night
    }
};

module.exports = { ROLES };
