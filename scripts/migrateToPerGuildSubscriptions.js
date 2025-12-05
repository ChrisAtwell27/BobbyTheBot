/**
 * Migration Script: Per-Guild Subscriptions
 *
 * This script migrates existing user-level subscriptions to per-guild format
 * where each guild has its own tier, status, and trial information.
 *
 * Run with: node scripts/migrateToPerGuildSubscriptions.js
 */

const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
require('dotenv').config();

async function migrateSubscriptions() {
    console.log('🔄 Starting per-guild subscription migration...\n');

    // Initialize Convex client
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
        console.error('❌ CONVEX_URL environment variable is not set');
        process.exit(1);
    }

    const convex = new ConvexHttpClient(convexUrl);
    console.log('✅ Connected to Convex\n');

    try {
        // Get all subscriptions
        const subscriptions = await convex.query(api.subscriptions.getSubscriptionsByStatus, {
            status: 'active'
        });

        console.log(`Found ${subscriptions.length} active subscriptions to migrate\n`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const subscription of subscriptions) {
            try {
                console.log(`Processing subscription for Discord ID: ${subscription.discordId}`);
                console.log(`  - Current tier: ${subscription.tier}`);
                console.log(`  - Verified guilds: ${subscription.verifiedGuilds?.length || 0}`);

                if (!subscription.verifiedGuilds || subscription.verifiedGuilds.length === 0) {
                    console.log(`  ⏭️  Skipping - no verified guilds\n`);
                    skippedCount++;
                    continue;
                }

                // Check if already migrated (has per-guild tier data)
                const firstGuild = subscription.verifiedGuilds[0];
                if (firstGuild.tier !== undefined && firstGuild.status !== undefined) {
                    console.log(`  ⏭️  Already migrated\n`);
                    skippedCount++;
                    continue;
                }

                // Migrate each guild
                for (const guild of subscription.verifiedGuilds) {
                    console.log(`  📦 Migrating guild: ${guild.guildName} (${guild.guildId})`);

                    // Determine status and expiration
                    let guildStatus = subscription.status;
                    let guildTier = subscription.tier;
                    let expiresAt = subscription.expiresAt;
                    let trialEndsAt = null;

                    // If user-level subscription was on trial, convert to per-guild trial
                    if (subscription.status === 'trial' || guildStatus === 'pending') {
                        guildStatus = 'trial';
                        guildTier = 'free';
                        // Set trial to expire in 7 days from verification date
                        const verifiedDate = guild.verifiedAt || Date.now();
                        trialEndsAt = verifiedDate + (7 * 24 * 60 * 60 * 1000);
                    }

                    // Update guild subscription
                    await convex.mutation(api.subscriptions.updateGuildSubscription, {
                        discordId: subscription.discordId,
                        guildId: guild.guildId,
                        tier: guildTier,
                        status: guildStatus,
                        expiresAt: expiresAt || undefined,
                        trialEndsAt: trialEndsAt || undefined,
                    });

                    console.log(`    ✅ Migrated: tier=${guildTier}, status=${guildStatus}`);
                }

                migratedCount++;
                console.log(`  ✅ Successfully migrated subscription\n`);

            } catch (error) {
                console.error(`  ❌ Error migrating subscription: ${error.message}\n`);
                errorCount++;
            }
        }

        // Also check for expired and cancelled subscriptions
        const expiredSubs = await convex.query(api.subscriptions.getSubscriptionsByStatus, {
            status: 'expired'
        });

        console.log(`\nFound ${expiredSubs.length} expired subscriptions to migrate\n`);

        for (const subscription of expiredSubs) {
            try {
                if (!subscription.verifiedGuilds || subscription.verifiedGuilds.length === 0) {
                    skippedCount++;
                    continue;
                }

                const firstGuild = subscription.verifiedGuilds[0];
                if (firstGuild.tier !== undefined) {
                    skippedCount++;
                    continue;
                }

                for (const guild of subscription.verifiedGuilds) {
                    await convex.mutation(api.subscriptions.updateGuildSubscription, {
                        discordId: subscription.discordId,
                        guildId: guild.guildId,
                        tier: 'free',
                        status: 'expired',
                    });
                }

                migratedCount++;
            } catch (error) {
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('Migration Summary:');
        console.log('='.repeat(50));
        console.log(`✅ Successfully migrated: ${migratedCount}`);
        console.log(`⏭️  Skipped (already migrated): ${skippedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('='.repeat(50) + '\n');

        if (errorCount === 0) {
            console.log('🎉 Migration completed successfully!');
        } else {
            console.log('⚠️  Migration completed with some errors. Please review the logs above.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateSubscriptions()
    .then(() => {
        console.log('\n✅ Migration script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
