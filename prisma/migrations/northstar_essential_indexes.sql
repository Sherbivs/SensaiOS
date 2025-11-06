-- Northstar Essential Performance Indexes (Phase 1)
-- Apply after Phase 1 migration completes
-- Uses psql for CONCURRENTLY support (cannot run in transaction)

-- User Profile & Leaderboard Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_battles
ON "User" ("totalBattles" DESC, "totalWins" DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_catches
ON "User" ("totalCatches" DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_streak
ON "User" ("dailyQuestStreak" DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_activity
ON "User" ("lastActivityAt" DESC NULLS LAST)
WHERE "lastActivityAt" > NOW() - INTERVAL '30 days';

-- User Event Timeline Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_timeline
ON "UserEvent" ("userId", "occurredAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_category
ON "UserEvent" ("category", "occurredAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_session
ON "UserEvent" ("sessionId", "occurredAt" DESC)
WHERE "sessionId" IS NOT NULL;

-- Exclude low-value info events from indexes (saves space)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_important
ON "UserEvent" ("userId", "occurredAt" DESC)
WHERE severity != 'info';

-- Achievement Progress Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievements_progress
ON "UserAchievement" ("userId", "isCompleted", "progress");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievements_completed
ON "UserAchievement" ("completedAt" DESC NULLS LAST)
WHERE "isCompleted" = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_achievements_category
ON "Achievement" (category, "sortOrder");

-- Analytics Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stats_date
ON "DailyStats" (date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboard_lookup
ON "Leaderboard" (category, period);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboard_expiry
ON "Leaderboard" ("expiresAt")
WHERE "expiresAt" IS NOT NULL;

-- UserProfile lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_profile_friend_code
ON "UserProfile" ("friendCode")
WHERE "friendCode" IS NOT NULL;
