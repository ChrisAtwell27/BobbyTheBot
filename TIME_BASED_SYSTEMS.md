# ⏰ Time-Based Pet Systems

## Overview
Your virtual pet now has **realistic time-based stat changes** that happen automatically over time!

## 🔄 How It Works

### Automatic Stat Updates
Stats are updated **every time you check your pet** based on how much time has passed since the last update.

### Update Frequency
- Background task runs every **5 minutes** to update all pets
- Stats also update when you interact with your pet
- Calculations are based on **actual time passed** (minute-by-minute)

## 📊 Stat Behaviors

### 🍽️ HUNGER (Decreases Over Time)
- **What happens**: Your pet gets hungrier as time passes
- **Rate**: Based on pet type (e.g., rabbits get hungrier faster than cats)
- **Effect**: Low hunger (<20) causes health to decline faster
- **Solution**: Feed your pet regularly!

**Decay rates per hour:**
- Fish: ~4.8 hunger
- Cat: ~7.2 hunger
- Rabbit: ~12 hunger
- Dog: ~9.6 hunger
- Dragon: ~14.4 hunger

### 😊 HAPPINESS (Decreases Over Time)
- **What happens**: Your pet gets sad without attention
- **Rate**: Varies by pet type and personality
- **Modifiers**:
  - Playful/Energetic personalities: Slower decay
  - Lazy personality: Faster decay
- **Effect**: Low happiness (<20) affects health
- **Solution**: Play with your pet, give them treats!

**Decay rates per hour:**
- Cat: ~4.8 happiness
- Rabbit: ~6 happiness
- Dog: ~7.2 happiness
- Dragon: ~9.6 happiness

### ⚡ ENERGY (Increases Over Time!)
- **What happens**: Your pet naturally recovers energy while resting
- **Passive recovery**: **+12 energy per hour** when resting
- **Sleep recovery**: **+120 energy per hour** when sleeping (10x faster!)
- **Negative effects**:
  - Energy drains if hunger < 20 or health < 30
  - Energy drains faster if health is critical (<20)

**Recovery rates:**
- Resting: +0.2 energy/minute (12/hour)
- Sleeping: +2.0 energy/minute (120/hour)
- Starving: -0.3 energy/minute (-18/hour)

### 🛁 CLEANLINESS (Decreases Over Time)
- **What happens**: Your pet gets dirty naturally
- **Rate**: Varies by pet type
- **Effect**: Low cleanliness (<20) affects health
- **Solution**: Clean your pet regularly!

**Decay rates per hour:**
- Cat: ~3.6 cleanliness
- Penguin: ~3.6 cleanliness
- Dog: ~6 cleanliness
- Dragon: ~8.4 cleanliness

### ❤️ HEALTH (Complex System)
- **Base decay**: Very slow (0.3-0.6 per hour)
- **Accelerated decay when**:
  - Hunger < 20: 2x faster
  - Happiness < 20: 1.5x faster
  - Cleanliness < 20: 1.5x faster
- **Critical health (<20)**: All other stats decline faster
- **Solution**: Keep all stats high!

## 😴 Sleep System

### How Sleep Works
1. Click the **Sleep** button when energy < 90
2. Pet enters sleep state with faster energy recovery
3. Recovers **2 energy per minute** while sleeping
4. **Automatically wakes up** when energy reaches 95

### Sleep Benefits
- 10x faster energy recovery than passive resting
- Small health boost (+5) when starting sleep
- Small immediate energy boost (+10)
- Continues recovering even when you're offline

### Sleep Duration
Depends on how tired your pet is:
- 80 energy → 10 minutes to full
- 50 energy → 25 minutes to full
- 20 energy → 40 minutes to full

## 🎭 Personality Effects on Time

Your pet's personality affects how stats change over time:

### Playful/Energetic
- Happiness decays 20% slower
- Needs more activity

### Lazy
- Energy decay 20% slower
- Happiness decays 10% slower

### Curious
- Gains 30% more XP from activities
- Happiness decays 10% slower

### Brave/Gentle
- Better health maintenance

### Mischievous
- Gets dirty 20% faster
- Happier overall

## 🎮 Real-Time Strategy Tips

### Optimal Care Schedule
1. **Check every 2-3 hours** for best results
2. **Feed** when hunger drops below 60
3. **Play** when happiness drops below 70
4. **Clean** when cleanliness drops below 50
5. **Let sleep** when energy drops below 40

### Managing Time Offline
- **Before leaving**: Feed to 100, play to 100, clean to 100
- **Energy**: Will passively recover while you're gone
- **Hunger**: Will decrease, so don't leave too long
- **Expected decay per 8 hours** (overnight):
  - Hunger: -38 to -58 (depending on type)
  - Happiness: -23 to -38
  - Energy: +96 (if not sleeping) or full if sleeping
  - Cleanliness: -14 to -34

### Emergency Situations
If stats get critically low (<20):
- Feed immediately (hunger)
- Use medicine (health)
- Give treats (happiness)
- Clean (cleanliness)
- Put to sleep (energy)

## 📈 Visual Indicators

### Dashboard Shows
- ⚡ "Energy recovering at 2/min" when sleeping
- 😴 "Currently Sleeping (X min)" status
- Real-time stat values updated each time you check
- Footer message: "Stats update in real-time!"

### Stat Display
Stats are color-coded in the display:
- **Green** (80-100): Excellent
- **Yellow** (50-79): Okay
- **Orange** (20-49): Needs attention
- **Red** (<20): Critical!

## 💡 Pro Tips

1. **Energy is self-sustaining**: It recovers automatically, so focus on hunger/happiness
2. **Sleep when needed**: Don't wait until energy is at 0
3. **Prevention > Cure**: Keep stats high to avoid health decay
4. **Personality matters**: Choose activities that match your pet's personality
5. **Time management**: Better to check regularly than to let stats crash
6. **Overnight strategy**: Max out hunger and happiness before bed, let energy recover naturally

## 🔮 What's Next?

Potential future enhancements:
- Weather effects on stat decay
- Seasonal events affecting metabolism
- Pet aging affecting decay rates
- Special items that slow decay
- Breeding affecting inherited decay rates

---

**Your pet is now truly alive with realistic time-based behavior!** ⏰🐾
