/**
 * Minecraft Recipe Parser for Craftle
 * Parses MC 1.21.11 recipe JSON files and generates recipes.json
 * Uses item IDs that directly map to texture filenames
 */

const fs = require('fs');
const path = require('path');

// Paths
const RECIPE_DIR = path.join(__dirname, '../../images/minecraft-assets-1.21.11/data/minecraft/recipe');
const ITEM_TEXTURES = path.join(__dirname, '../../images/minecraft-assets-1.21.11/assets/minecraft/textures/item');
const BLOCK_TEXTURES = path.join(__dirname, '../../images/minecraft-assets-1.21.11/assets/minecraft/textures/block');
const OUTPUT_FILE = path.join(__dirname, '../data/recipes.json');

// Difficulty classification based on ingredient rarity
const RARE_ITEMS = new Set([
  'diamond', 'emerald', 'netherite_ingot', 'blaze_rod', 'blaze_powder',
  'ender_pearl', 'ghast_tear', 'nether_star', 'dragon_breath', 'shulker_shell',
  'heart_of_the_sea', 'nautilus_shell', 'elytra', 'totem_of_undying', 'trident',
  'phantom_membrane', 'rabbit_foot', 'wither_skeleton_skull', 'dragon_head',
  'netherite_scrap', 'ancient_debris', 'echo_shard', 'disc_fragment_5'
]);

const MEDIUM_ITEMS = new Set([
  'iron_ingot', 'gold_ingot', 'copper_ingot', 'redstone', 'lapis_lazuli',
  'quartz', 'glowstone_dust', 'prismarine_shard', 'prismarine_crystals',
  'obsidian', 'crying_obsidian', 'slime_ball', 'magma_cream', 'honey_bottle',
  'honeycomb', 'amethyst_shard', 'pointed_dripstone', 'glow_ink_sac',
  'leather', 'rabbit_hide', 'scute', 'ink_sac', 'glow_berries'
]);

// Tag to representative item mapping
const TAG_REPRESENTATIVES = {
  'planks': 'oak_planks',
  'logs': 'oak_log',
  'logs_that_burn': 'oak_log',
  'wooden_slabs': 'oak_slab',
  'wool': 'white_wool',
  'stone_tool_materials': 'cobblestone',
  'stone_crafting_materials': 'cobblestone',
  'iron_tool_materials': 'iron_ingot',
  'diamond_tool_materials': 'diamond',
  'gold_tool_materials': 'gold_ingot',
  'netherite_tool_materials': 'netherite_ingot',
  'eggs': 'egg',
  'coals': 'coal',
  'sand': 'sand',
  'soul_fire_base_blocks': 'soul_sand',
  'wooden_buttons': 'oak_button',
  'wooden_doors': 'oak_door',
  'wooden_pressure_plates': 'oak_pressure_plate',
  'wooden_trapdoors': 'oak_trapdoor',
  'wooden_fences': 'oak_fence',
  'wooden_fence_gates': 'oak_fence_gate',
  'boats': 'oak_boat',
  'chest_boats': 'oak_chest_boat',
  'signs': 'oak_sign',
  'hanging_signs': 'oak_hanging_sign',
  'crimson_stems': 'crimson_stem',
  'warped_stems': 'warped_stem',
  'bamboo_blocks': 'bamboo_block',
};

// Curated list of iconic recipes to include
const CURATED_RECIPES = [
  // Tools - All tiers (most recognizable!)
  'wooden_pickaxe', 'wooden_axe', 'wooden_shovel', 'wooden_hoe', 'wooden_sword',
  'stone_pickaxe', 'stone_axe', 'stone_shovel', 'stone_hoe', 'stone_sword',
  'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_hoe', 'iron_sword',
  'golden_pickaxe', 'golden_axe', 'golden_shovel', 'golden_hoe', 'golden_sword',
  'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_hoe', 'diamond_sword',

  // Armor - All tiers
  'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots',
  'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
  'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots',
  'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',

  // Weapons & Combat
  'bow', 'arrow', 'crossbow', 'shield', 'spectral_arrow',

  // Basic crafting essentials
  'crafting_table', 'furnace', 'chest', 'stick', 'torch', 'ladder',
  'oak_door', 'iron_door', 'oak_fence', 'oak_fence_gate',
  'oak_sign', 'oak_trapdoor', 'oak_boat', 'oak_stairs', 'oak_slab',

  // Food
  'bread', 'cake', 'cookie', 'pumpkin_pie', 'golden_apple', 'golden_carrot',

  // Redstone classics
  'piston', 'sticky_piston', 'redstone_torch', 'repeater', 'comparator',
  'observer', 'dispenser', 'dropper', 'hopper', 'tnt', 'lever',
  'tripwire_hook', 'daylight_detector', 'redstone_lamp', 'target', 'note_block',

  // Storage & Utility
  'barrel', 'ender_chest', 'brewing_stand', 'cauldron',
  'anvil', 'enchanting_table', 'beacon', 'bookshelf', 'lectern',
  'cartography_table', 'smithing_table', 'fletching_table', 'loom',
  'stonecutter', 'grindstone', 'composter', 'blast_furnace', 'smoker',

  // Transport
  'rail', 'powered_rail', 'detector_rail', 'activator_rail',
  'minecart', 'chest_minecart', 'furnace_minecart', 'tnt_minecart', 'hopper_minecart',

  // Decorative
  'painting', 'item_frame', 'armor_stand', 'flower_pot',
  'white_bed', 'lantern', 'soul_lantern', 'campfire', 'soul_campfire',
  'chain', 'lightning_rod', 'candle', 'scaffolding', 'hay_block',

  // Tools & Misc
  'bucket', 'clock', 'compass', 'map', 'fishing_rod', 'flint_and_steel',
  'shears', 'lead', 'spyglass',

  // Blocks
  'iron_block', 'gold_block', 'diamond_block', 'emerald_block', 'lapis_block',
  'redstone_block', 'coal_block', 'copper_block',
  'quartz_block', 'quartz_pillar', 'smooth_quartz', 'chiseled_quartz_block',
  'glowstone', 'sea_lantern', 'jack_o_lantern', 'end_rod',
  'bricks', 'stone_bricks', 'nether_bricks', 'end_stone_bricks',
  'prismarine', 'prismarine_bricks', 'dark_prismarine',
  'purpur_block', 'purpur_pillar', 'honey_block', 'honeycomb_block',
  'slime_block', 'dried_kelp_block', 'packed_mud', 'mud_bricks',

  // Paper & Books
  'paper', 'book', 'writable_book',

  // Nether/End items
  'blaze_powder', 'magma_cream', 'fire_charge', 'eye_of_ender',
  'end_crystal',

  // Misc
  'glass_pane', 'iron_bars', 'bone_block', 'melon', 'snow_block',
  'packed_ice', 'blue_ice',

  // Copper items
  'cut_copper',
];

// Check if texture exists
function textureExists(itemId) {
  const itemPath = path.join(ITEM_TEXTURES, `${itemId}.png`);
  const blockPath = path.join(BLOCK_TEXTURES, `${itemId}.png`);
  return fs.existsSync(itemPath) || fs.existsSync(blockPath);
}

// Convert Minecraft ID to clean name
function idToName(id) {
  return id
    .replace('minecraft:', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Clean item ID (remove minecraft: prefix and tag prefix)
function cleanItemId(id) {
  if (!id) return null;
  return id.replace('minecraft:', '').replace('#minecraft:', '').replace('#', '');
}

// Check if it's a tag reference
function isTag(id) {
  return id && id.startsWith('#');
}

// Get a representative item for a tag
function getTagRepresentative(tagId) {
  const tag = cleanItemId(tagId);
  return TAG_REPRESENTATIVES[tag] || null;
}

// Determine difficulty based on ingredients
function getDifficulty(ingredients) {
  let hasRare = false;
  let hasMedium = false;

  for (const item of ingredients) {
    if (RARE_ITEMS.has(item)) hasRare = true;
    if (MEDIUM_ITEMS.has(item)) hasMedium = true;
  }

  if (hasRare) return 'hard';
  if (hasMedium) return 'medium';
  return 'easy';
}

// Expand pattern to 3x3 grid
function expandPattern(pattern, key) {
  // Ensure pattern is 3 rows
  while (pattern.length < 3) {
    pattern.push('   ');
  }

  // Ensure each row is 3 characters
  pattern = pattern.map(row => {
    while (row.length < 3) {
      row += ' ';
    }
    return row;
  });

  // Convert to grid
  const grid = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) {
      const char = pattern[i][j];
      if (char === ' ') {
        row.push(null);
      } else {
        const itemRef = key[char];
        if (!itemRef) {
          row.push(null);
        } else if (isTag(itemRef)) {
          const rep = getTagRepresentative(itemRef);
          row.push(rep);
        } else {
          row.push(cleanItemId(itemRef));
        }
      }
    }
    grid.push(row);
  }

  return grid;
}

// Get all unique items from grid
function getGridItems(grid) {
  const items = new Set();
  for (const row of grid) {
    for (const cell of row) {
      if (cell) items.add(cell);
    }
  }
  return Array.from(items);
}

// Get category for an item
function getCategoryForItem(itemId) {
  if (itemId.includes('pickaxe') || itemId.includes('axe') || itemId.includes('shovel') ||
      itemId.includes('hoe') || itemId.includes('shears') || itemId.includes('bucket') ||
      itemId.includes('fishing_rod') || itemId.includes('flint_and_steel')) {
    return 'tools';
  }
  if (itemId.includes('sword') || itemId.includes('bow') || itemId.includes('arrow') ||
      itemId.includes('shield') || itemId.includes('crossbow') || itemId.includes('trident')) {
    return 'weapons';
  }
  if (itemId.includes('helmet') || itemId.includes('chestplate') || itemId.includes('leggings') ||
      itemId.includes('boots')) {
    return 'armor';
  }
  if (itemId.includes('redstone') || itemId.includes('piston') || itemId.includes('repeater') ||
      itemId.includes('comparator') || itemId.includes('observer') || itemId.includes('hopper') ||
      itemId.includes('dispenser') || itemId.includes('dropper') || itemId.includes('lever') ||
      itemId.includes('button') || itemId.includes('pressure_plate') || itemId.includes('tnt') ||
      itemId.includes('tripwire') || itemId.includes('daylight')) {
    return 'redstone';
  }
  if (itemId.includes('bread') || itemId.includes('cake') || itemId.includes('cookie') ||
      itemId.includes('pie') || itemId.includes('stew') || itemId.includes('soup') ||
      itemId.includes('apple') || itemId.includes('carrot') || itemId.includes('potato')) {
    return 'food';
  }
  if (itemId.includes('rail') || itemId.includes('minecart') || itemId.includes('boat')) {
    return 'transport';
  }
  if (itemId.includes('chest') || itemId.includes('barrel') || itemId.includes('shulker')) {
    return 'storage';
  }
  if (itemId.includes('torch') || itemId.includes('lantern') || itemId.includes('glowstone') ||
      itemId.includes('sea_lantern') || itemId.includes('end_rod') || itemId.includes('jack_o_lantern')) {
    return 'lighting';
  }
  if (itemId.includes('bed') || itemId.includes('banner') || itemId.includes('painting') ||
      itemId.includes('item_frame') || itemId.includes('flower_pot') ||
      itemId.includes('candle') || itemId.includes('chain') || itemId.includes('sign') ||
      itemId.includes('door') || itemId.includes('fence') || itemId.includes('trapdoor') ||
      itemId.includes('ladder') || itemId.includes('scaffolding') || itemId.includes('carpet')) {
    return 'decoration';
  }
  if (itemId.includes('planks') || itemId.includes('log') || itemId.includes('stone') ||
      itemId.includes('brick') || itemId.includes('block') || itemId.includes('sand') ||
      itemId.includes('glass') || itemId.includes('terracotta') || itemId.includes('concrete')) {
    return 'building';
  }
  return 'misc';
}

// Parse a single recipe file
function parseRecipe(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const recipe = JSON.parse(content);

    // Only process shaped crafting recipes
    if (recipe.type !== 'minecraft:crafting_shaped') {
      return null;
    }

    const outputId = cleanItemId(recipe.result.id);
    const outputCount = recipe.result.count || 1;
    const pattern = recipe.pattern;
    const key = recipe.key;

    // Skip if missing required fields
    if (!outputId || !pattern || !key) {
      return null;
    }

    // Expand pattern to grid
    const grid = expandPattern([...pattern], key);

    // Get unique ingredients
    const ingredients = getGridItems(grid);

    // Skip if no valid ingredients
    if (ingredients.length === 0) {
      return null;
    }

    // Skip if any ingredient texture is missing
    for (const item of ingredients) {
      if (!textureExists(item)) {
        console.warn(`[Skip] Missing texture for: ${item} in recipe ${outputId}`);
        return null;
      }
    }

    // Determine difficulty
    const difficulty = getDifficulty(ingredients);

    // Get category
    const category = getCategoryForItem(outputId);

    return {
      id: outputId,
      output: idToName(outputId),
      outputCount,
      grid,
      category,
      difficulty,
      description: `Crafts ${outputCount} ${idToName(outputId)}`,
      ingredients
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

// Main parsing function
function parseAllRecipes() {
  console.log('Parsing Minecraft recipes...');
  console.log(`Recipe directory: ${RECIPE_DIR}`);
  console.log(`Item textures: ${ITEM_TEXTURES}`);
  console.log(`Block textures: ${BLOCK_TEXTURES}`);

  const recipes = [];
  const items = {};
  const seenRecipes = new Set();

  // Read all recipe files
  const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} recipe files`);

  for (const file of files) {
    const recipeName = file.replace('.json', '');

    // Skip non-curated recipes
    const isCurated = CURATED_RECIPES.some(r => recipeName === r || recipeName.startsWith(r + '_from_'));
    if (!isCurated) continue;

    // Skip duplicate recipes (like _from_stonecutting variants)
    if (recipeName.includes('_from_') || recipeName.includes('_stonecutting')) continue;

    const filePath = path.join(RECIPE_DIR, file);
    const recipe = parseRecipe(filePath);

    if (recipe && !seenRecipes.has(recipe.id)) {
      seenRecipes.add(recipe.id);
      recipes.push(recipe);

      // Collect items
      for (const itemId of recipe.ingredients) {
        if (!items[itemId]) {
          items[itemId] = {
            id: itemId,
            name: idToName(itemId),
            category: getCategoryForItem(itemId),
            hasTexture: textureExists(itemId)
          };
        }
      }

      // Add output item too
      if (!items[recipe.id]) {
        items[recipe.id] = {
          id: recipe.id,
          name: idToName(recipe.id),
          category: recipe.category,
          hasTexture: textureExists(recipe.id)
        };
      }
    }
  }

  console.log(`Parsed ${recipes.length} curated recipes`);
  console.log(`Found ${Object.keys(items).length} unique items`);

  // Sort recipes by difficulty then name
  recipes.sort((a, b) => {
    const diffOrder = { easy: 0, medium: 1, hard: 2 };
    if (diffOrder[a.difficulty] !== diffOrder[b.difficulty]) {
      return diffOrder[a.difficulty] - diffOrder[b.difficulty];
    }
    return a.output.localeCompare(b.output);
  });

  // Remove ingredients field (was just for processing)
  recipes.forEach(r => delete r.ingredients);

  // Write output
  const output = { items, recipes };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);

  // Print stats
  const stats = {
    total: recipes.length,
    easy: recipes.filter(r => r.difficulty === 'easy').length,
    medium: recipes.filter(r => r.difficulty === 'medium').length,
    hard: recipes.filter(r => r.difficulty === 'hard').length,
  };
  console.log('\nDifficulty breakdown:');
  console.log(`  Easy: ${stats.easy}`);
  console.log(`  Medium: ${stats.medium}`);
  console.log(`  Hard: ${stats.hard}`);
  console.log(`  Total: ${stats.total}`);

  // Print category breakdown
  const categories = {};
  recipes.forEach(r => {
    categories[r.category] = (categories[r.category] || 0) + 1;
  });
  console.log('\nCategory breakdown:');
  Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  return output;
}

// Run the parser
if (require.main === module) {
  parseAllRecipes();
  console.log('\nDone! Run your bot and try !craftle to test!');
}

module.exports = { parseAllRecipes };
