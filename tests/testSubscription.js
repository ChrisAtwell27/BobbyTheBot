/**
 * Subscription System Test Script
 *
 * This script tests the subscription utilities to ensure they're working correctly.
 * Uses Convex as the database backend.
 *
 * Run this with: node tests/testSubscription.js
 */

require('dotenv').config();
const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
const {
    checkSubscription,
    getSubscriptionByOwner,
    normalizeTier,
    TIERS,
    TIER_HIERARCHY,
    clearOwnerSubscriptionCache
} = require('../utils/subscriptionUtils');

// Test Discord IDs (use your own for actual testing)
const TEST_USER_FREE = 'test_free_user_123';
const TEST_USER_PLUS = 'test_plus_user_456';
const TEST_USER_ULTIMATE = 'test_ultimate_user_789';
const TEST_USER_NONE = 'test_no_subscription_999';
const TEST_GUILD_ID = 'test_guild_001';

let convexClient = null;

function getConvexClient() {
    if (!convexClient) {
        const convexUrl = process.env.CONVEX_URL;
        if (!convexUrl) {
            throw new Error('CONVEX_URL environment variable is not set');
        }
        convexClient = new ConvexHttpClient(convexUrl);
    }
    return convexClient;
}

async function setupTestData() {
    console.log('\n📝 Setting up test data...');
    const client = getConvexClient();

    // Create test subscriptions using upsertSubscription
    // Free tier user
    await client.mutation(api.subscriptions.upsertSubscription, {
        discordId: TEST_USER_FREE,
        discordUsername: 'TestFreeUser',
        tier: 'free',
        status: 'active',
        verifiedGuilds: [{
            guildId: TEST_GUILD_ID,
            guildName: 'Test Guild',
            verifiedAt: Date.now()
        }]
    });

    // Plus tier user
    await client.mutation(api.subscriptions.upsertSubscription, {
        discordId: TEST_USER_PLUS,
        discordUsername: 'TestPlusUser',
        tier: 'plus',
        status: 'active',
        verifiedGuilds: [{
            guildId: TEST_GUILD_ID,
            guildName: 'Test Guild',
            verifiedAt: Date.now()
        }]
    });

    // Ultimate tier user
    await client.mutation(api.subscriptions.upsertSubscription, {
        discordId: TEST_USER_ULTIMATE,
        discordUsername: 'TestUltimateUser',
        tier: 'ultimate',
        status: 'active',
        verifiedGuilds: [{
            guildId: TEST_GUILD_ID,
            guildName: 'Test Guild',
            verifiedAt: Date.now()
        }]
    });

    console.log('✅ Test data created');
}

async function runTests() {
    console.log('\n🧪 Starting Subscription System Tests...\n');
    console.log('═'.repeat(60));

    let passCount = 0;
    let failCount = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            passCount++;
        } catch (error) {
            console.log(`❌ FAIL: ${name}`);
            console.log(`   Error: ${error.message}`);
            failCount++;
        }
    };

    // Test 1: Tier Normalization
    await test('Tier normalization - legacy tiers', () => {
        if (normalizeTier('basic') !== TIERS.PLUS) throw new Error('basic should map to plus');
        if (normalizeTier('premium') !== TIERS.ULTIMATE) throw new Error('premium should map to ultimate');
        if (normalizeTier('enterprise') !== TIERS.ULTIMATE) throw new Error('enterprise should map to ultimate');
    });

    // Test 2: Tier Hierarchy
    await test('Tier hierarchy values', () => {
        if (TIER_HIERARCHY[TIERS.FREE] >= TIER_HIERARCHY[TIERS.PLUS]) {
            throw new Error('FREE should be lower than PLUS');
        }
        if (TIER_HIERARCHY[TIERS.PLUS] >= TIER_HIERARCHY[TIERS.ULTIMATE]) {
            throw new Error('PLUS should be lower than ULTIMATE');
        }
    });

    // Test 3: Free user accessing free features
    await test('Free user can access free tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_FREE);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.FREE, TEST_USER_FREE);
        if (!result.hasAccess) throw new Error('Free user should have access to free features');
        if (result.guildTier !== TIERS.FREE) throw new Error('Guild tier should be free');
    });

    // Test 4: Free user accessing plus features
    await test('Free user cannot access plus tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_FREE);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.PLUS, TEST_USER_FREE);
        if (result.hasAccess) throw new Error('Free user should NOT have access to plus features');
    });

    // Test 5: Plus user accessing free features
    await test('Plus user can access free tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_PLUS);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.FREE, TEST_USER_PLUS);
        if (!result.hasAccess) throw new Error('Plus user should have access to free features');
    });

    // Test 6: Plus user accessing plus features
    await test('Plus user can access plus tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_PLUS);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.PLUS, TEST_USER_PLUS);
        if (!result.hasAccess) throw new Error('Plus user should have access to plus features');
        if (result.guildTier !== TIERS.PLUS) throw new Error('Guild tier should be plus');
    });

    // Test 7: Plus user accessing ultimate features
    await test('Plus user cannot access ultimate tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_PLUS);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.ULTIMATE, TEST_USER_PLUS);
        if (result.hasAccess) throw new Error('Plus user should NOT have access to ultimate features');
    });

    // Test 8: Ultimate user accessing all features
    await test('Ultimate user can access all tier features', async () => {
        clearOwnerSubscriptionCache(TEST_USER_ULTIMATE);
        const freeCheck = await checkSubscription(TEST_GUILD_ID, TIERS.FREE, TEST_USER_ULTIMATE);
        const plusCheck = await checkSubscription(TEST_GUILD_ID, TIERS.PLUS, TEST_USER_ULTIMATE);
        const ultimateCheck = await checkSubscription(TEST_GUILD_ID, TIERS.ULTIMATE, TEST_USER_ULTIMATE);

        if (!freeCheck.hasAccess || !plusCheck.hasAccess || !ultimateCheck.hasAccess) {
            throw new Error('Ultimate user should have access to all features');
        }
        if (ultimateCheck.guildTier !== TIERS.ULTIMATE) {
            throw new Error('Guild tier should be ultimate');
        }
    });

    // Test 9: User with no subscription defaults to free
    await test('User with no subscription defaults to free tier', async () => {
        clearOwnerSubscriptionCache(TEST_USER_NONE);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.FREE, TEST_USER_NONE);
        if (!result.hasAccess) throw new Error('User with no sub should have free access');
        if (result.guildTier !== TIERS.FREE) throw new Error('Guild tier should default to free');
    });

    // Test 10: User with no subscription cannot access plus
    await test('User with no subscription cannot access plus tier', async () => {
        clearOwnerSubscriptionCache(TEST_USER_NONE);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.PLUS, TEST_USER_NONE);
        if (result.hasAccess) throw new Error('User with no sub should NOT have plus access');
    });

    // Test 11: Subscription caching works
    await test('Subscription caching works', async () => {
        // Clear cache first
        clearOwnerSubscriptionCache(TEST_USER_PLUS);

        // First call should hit database
        const result1 = await getSubscriptionByOwner(TEST_USER_PLUS);

        // Second call should hit cache (we can't directly test this without timing, but ensure it works)
        const result2 = await getSubscriptionByOwner(TEST_USER_PLUS);

        if (!result1 || !result2) throw new Error('Cache should return subscription');
        if (result1.discordId !== result2.discordId) throw new Error('Cache should return same data');
    });

    // Test 12: Expired subscription treated as free
    await test('Expired subscription is treated as free tier', async () => {
        const client = getConvexClient();
        const expiredUser = 'test_expired_user_111';

        // Create an expired subscription
        await client.mutation(api.subscriptions.upsertSubscription, {
            discordId: expiredUser,
            discordUsername: 'TestExpiredUser',
            tier: 'plus',
            status: 'expired',
            expiresAt: new Date('2020-01-01').getTime(),
            verifiedGuilds: [{
                guildId: TEST_GUILD_ID,
                guildName: 'Test Guild',
                verifiedAt: Date.now()
            }]
        });

        clearOwnerSubscriptionCache(expiredUser);
        const result = await checkSubscription(TEST_GUILD_ID, TIERS.PLUS, expiredUser);

        if (result.hasAccess) throw new Error('Expired subscription should not have plus access');
        if (result.guildTier !== TIERS.FREE) throw new Error('Expired user should be treated as free');

        // Cleanup - cancel the subscription (sets to free tier)
        await client.mutation(api.subscriptions.cancelSubscription, {
            discordId: expiredUser
        });
    });

    console.log('═'.repeat(60));
    console.log(`\n📊 Test Results: ${passCount} passed, ${failCount} failed`);

    if (failCount === 0) {
        console.log('🎉 All tests passed!\n');
    } else {
        console.log('⚠️  Some tests failed. Please review the errors above.\n');
        process.exit(1);
    }
}

async function cleanupTestData() {
    console.log('🧹 Cleaning up test data...');
    const client = getConvexClient();

    // Cancel/cleanup test subscriptions
    const testUsers = [TEST_USER_FREE, TEST_USER_PLUS, TEST_USER_ULTIMATE];

    for (const userId of testUsers) {
        try {
            await client.mutation(api.subscriptions.cancelSubscription, {
                discordId: userId
            });
        } catch (error) {
            // Ignore errors during cleanup (subscription might not exist)
        }
    }

    console.log('✅ Test data cleaned up\n');
}

async function main() {
    console.log('🚀 Subscription System Test Suite');
    console.log('─'.repeat(60));
    console.log('📦 Using Convex database backend');

    try {
        // Initialize Convex client
        console.log('🔌 Connecting to Convex...');
        getConvexClient();
        console.log('✅ Connected to Convex');

        // Setup test data
        await setupTestData();

        // Run tests
        await runTests();

        // Cleanup
        await cleanupTestData();

    } catch (error) {
        console.error('💥 Fatal error during testing:', error);
        process.exit(1);
    } finally {
        console.log('\n✨ Test suite complete!\n');
    }
}

// Run the tests
main();
