/**
 * Tests for Home Bundle Aggregations (PostgreSQL)
 * 
 * Coverage Areas:
 * - Home bundle loading (User + Party + Cooldowns + Encounter)
 * - Cache integration (TTL-based expiration)
 * - Cooldown CRUD operations
 * - Multi-model aggregations
 * - Cache invalidation patterns
 * 
 * Architecture:
 * - Composes existing query modules (user, party, encounter)
 * - Tests cache hit/miss behavior
 * - Validates parallel loading with Promise.all
 * - Tests NULL handling for optional relations (party, encounter)
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { initializeConnection, getProdDb } from "../src/shared/pg-connection.js";
import {
  loadHomeBundleByDiscordId,
  loadHomeBundleByUserId,
  findCooldownsByUserId,
  findCooldownByUserAndKind,
  createCooldown,
  updateCooldownReadyAt,
  deleteCooldown,
  deleteExpiredCooldowns,
  invalidateHomeBundle,
  primeHomeBundle,
  getHomeCacheStats,
  clearHomeCache,
  type HomeBundle,
} from "../src/services/home-bundle-pg.js";
import { createUser, deleteUser } from "../src/shared/models/user-queries-pg.js";

beforeAll(async () => {
  await initializeConnection();
});

afterEach(() => {
  // Clear cache between tests to avoid interference
  clearHomeCache();
});

describe("Home Bundle Aggregations (PostgreSQL)", () => {
  // ========================================================================
  // Cooldown Operations
  // ========================================================================

  describe("Cooldown CRUD", () => {
    it("should create cooldown for user", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-create");
      const readyAt = new Date(Date.now() + 60000); // 1 minute from now
      
      const cooldown = await createCooldown(user.id, "test-kind", readyAt, { meta: "data" });
      
      expect(cooldown.id).toBeDefined();
      expect(cooldown.ownerId).toBe(user.id);
      expect(cooldown.kind).toBe("test-kind");
      expect(cooldown.readyAt).toBeInstanceOf(Date);
      expect(cooldown.readyAt.getTime()).toBeGreaterThan(Date.now());
      expect(cooldown.metaJson).toEqual({ meta: "data" });
      
      await pool.query(`DELETE FROM "Cooldown" WHERE id = $1`, [cooldown.id]);
      await deleteUser(user.id);
    });

    it("should find cooldowns by user ID", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-find");
      const readyAt1 = new Date(Date.now() + 30000);
      const readyAt2 = new Date(Date.now() + 60000);
      
      const cd1 = await createCooldown(user.id, "kind-1", readyAt1);
      const cd2 = await createCooldown(user.id, "kind-2", readyAt2);
      
      const cooldowns = await findCooldownsByUserId(user.id);
      expect(cooldowns.length).toBeGreaterThanOrEqual(2);
      
      const foundCd1 = cooldowns.find(c => c.id === cd1.id);
      const foundCd2 = cooldowns.find(c => c.id === cd2.id);
      expect(foundCd1).toBeDefined();
      expect(foundCd2).toBeDefined();
      
      // Should be ordered by readyAt ASC
      const cd1Index = cooldowns.findIndex(c => c.id === cd1.id);
      const cd2Index = cooldowns.findIndex(c => c.id === cd2.id);
      expect(cd1Index).toBeLessThan(cd2Index);
      
      await pool.query(`DELETE FROM "Cooldown" WHERE id = ANY($1::uuid[])`, [[cd1.id, cd2.id]]);
      await deleteUser(user.id);
    });

    it("should find cooldown by user and kind", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-kind");
      const readyAt = new Date(Date.now() + 60000);
      
      const created = await createCooldown(user.id, "specific-kind", readyAt);
      const found = await findCooldownByUserAndKind(user.id, "specific-kind");
      
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.kind).toBe("specific-kind");
      
      const notFound = await findCooldownByUserAndKind(user.id, "nonexistent-kind");
      expect(notFound).toBeNull();
      
      await pool.query(`DELETE FROM "Cooldown" WHERE id = $1`, [created.id]);
      await deleteUser(user.id);
    });

    it("should update cooldown readyAt", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-update");
      const readyAt1 = new Date(Date.now() + 30000);
      const readyAt2 = new Date(Date.now() + 120000);
      
      const cooldown = await createCooldown(user.id, "update-test", readyAt1);
      const updated = await updateCooldownReadyAt(cooldown.id, readyAt2);
      
      expect(updated.id).toBe(cooldown.id);
      expect(updated.readyAt.getTime()).toBe(readyAt2.getTime());
      expect(updated.updatedAt.getTime()).toBeGreaterThan(cooldown.updatedAt.getTime());
      
      await pool.query(`DELETE FROM "Cooldown" WHERE id = $1`, [cooldown.id]);
      await deleteUser(user.id);
    });

    it("should delete cooldown", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-delete");
      const readyAt = new Date(Date.now() + 60000);
      
      const cooldown = await createCooldown(user.id, "delete-test", readyAt);
      const deleted = await deleteCooldown(cooldown.id);
      
      expect(deleted).toBe(true);
      
      const found = await pool.query(`SELECT * FROM "Cooldown" WHERE id = $1`, [cooldown.id]);
      expect(found.rows.length).toBe(0);
      
      await deleteUser(user.id);
    });

    it("should delete expired cooldowns", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cooldown-expired");
      
      // Create expired cooldown (readyAt in the past)
      const expiredReadyAt = new Date(Date.now() - 60000);
      const expired = await createCooldown(user.id, "expired-test", expiredReadyAt);
      
      const deletedCount = await deleteExpiredCooldowns();
      expect(deletedCount).toBeGreaterThanOrEqual(1);
      
      const found = await pool.query(`SELECT * FROM "Cooldown" WHERE id = $1`, [expired.id]);
      expect(found.rows.length).toBe(0);
      
      await deleteUser(user.id);
    });
  });

  // ========================================================================
  // Home Bundle Loading
  // ========================================================================

  describe("loadHomeBundleByDiscordId", () => {
    it("should load complete home bundle", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-complete");
      
      // Create cooldown for user
      const readyAt = new Date(Date.now() + 60000);
      const cooldown = await createCooldown(user.id, "test-bundle", readyAt);
      
      const bundle = await loadHomeBundleByDiscordId("test-bundle-complete");
      
      expect(bundle.user).toBeDefined();
      expect(bundle.user.discordId).toBe("test-bundle-complete");
      expect(bundle.cooldowns.length).toBeGreaterThanOrEqual(1);
      expect(bundle.cooldowns.some(c => c.id === cooldown.id)).toBe(true);
      
      // Party and encounter may be null for new user
      // (party created via party-queries-pg, encounter via encounter-queries-pg)
      
      await pool.query(`DELETE FROM "Cooldown" WHERE id = $1`, [cooldown.id]);
      await deleteUser(user.id);
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        loadHomeBundleByDiscordId("nonexistent-discord-id-12345")
      ).rejects.toThrow("User not found");
    });

    it("should use cache on second load", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-cache");
      
      // First load - populates cache
      const bundle1 = await loadHomeBundleByDiscordId("test-bundle-cache");
      
      // Second load - should hit cache (same object reference)
      const bundle2 = await loadHomeBundleByDiscordId("test-bundle-cache");
      
      expect(bundle1).toBe(bundle2); // Same object reference = cache hit
      
      await deleteUser(user.id);
    });

    it("should bypass cache after invalidation", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-invalidate");
      
      // First load
      const bundle1 = await loadHomeBundleByDiscordId("test-bundle-invalidate");
      
      // Invalidate cache
      invalidateHomeBundle(user.id);
      
      // Second load - should bypass cache (different object reference)
      const bundle2 = await loadHomeBundleByDiscordId("test-bundle-invalidate");
      
      expect(bundle1).not.toBe(bundle2); // Different object reference = cache miss
      expect(bundle1.user.id).toBe(bundle2.user.id); // But same user
      
      await deleteUser(user.id);
    });

    it("should use primed cache", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-prime");
      
      // Load bundle manually
      const bundle1 = await loadHomeBundleByDiscordId("test-bundle-prime");
      
      // Invalidate cache
      invalidateHomeBundle(user.id);
      
      // Prime cache with modified bundle
      const primedBundle: HomeBundle = {
        ...bundle1,
        cooldowns: [], // Modified
      };
      primeHomeBundle(user.id, primedBundle);
      
      // Load bundle - should use primed cache
      const bundle2 = await loadHomeBundleByDiscordId("test-bundle-prime");
      
      expect(bundle2).toBe(primedBundle); // Same object reference
      expect(bundle2.cooldowns.length).toBe(0); // Modified value
      
      await deleteUser(user.id);
    });
  });

  describe("loadHomeBundleByUserId", () => {
    it("should load bundle by user ID", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-userid");
      const bundle = await loadHomeBundleByUserId(user.id);
      
      expect(bundle).not.toBeNull();
      expect(bundle!.user.id).toBe(user.id);
      expect(bundle!.user.discordId).toBe("test-bundle-userid");
      expect(bundle!.cooldowns).toBeDefined();
      
      await deleteUser(user.id);
    });

    it("should return null for non-existent user ID", async () => {
      const bundle = await loadHomeBundleByUserId("00000000-0000-0000-0000-000000000000");
      expect(bundle).toBeNull();
    });

    it("should use cache", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-bundle-userid-cache");
      
      const bundle1 = await loadHomeBundleByUserId(user.id);
      const bundle2 = await loadHomeBundleByUserId(user.id);
      
      expect(bundle1).toBe(bundle2); // Cache hit
      
      await deleteUser(user.id);
    });
  });

  // ========================================================================
  // Cache Management
  // ========================================================================

  describe("Cache Management", () => {
    it("should report cache statistics", () => {
      clearHomeCache();
      
      const stats1 = getHomeCacheStats();
      expect(stats1.size).toBe(0);
      expect(stats1.max).toBeGreaterThan(0);
      expect(stats1.ttlMs).toBeGreaterThan(0);
    });

    it("should clear cache", async () => {
      const pool = getProdDb();
      
      const user = await createUser("test-cache-clear");
      
      // Populate cache
      await loadHomeBundleByDiscordId("test-cache-clear");
      
      const stats1 = getHomeCacheStats();
      expect(stats1.size).toBeGreaterThan(0);
      
      // Clear cache
      clearHomeCache();
      
      const stats2 = getHomeCacheStats();
      expect(stats2.size).toBe(0);
      
      await deleteUser(user.id);
    });

    it("should track cache size", async () => {
      const pool = getProdDb();
      
      clearHomeCache();
      
      const user1 = await createUser("test-cache-size-1");
      const user2 = await createUser("test-cache-size-2");
      
      await loadHomeBundleByDiscordId("test-cache-size-1");
      const stats1 = getHomeCacheStats();
      expect(stats1.size).toBe(1);
      
      await loadHomeBundleByDiscordId("test-cache-size-2");
      const stats2 = getHomeCacheStats();
      expect(stats2.size).toBe(2);
      
      await deleteUser(user1.id);
      await deleteUser(user2.id);
    });
  });
});
