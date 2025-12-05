import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Cleanup expired challenges every 5 minutes
 * This replaces MongoDB's TTL index functionality
 */
crons.interval(
  "cleanup expired challenges",
  { minutes: 5 },
  internal.challenges.cleanupExpiredChallenges
);

export default crons;
