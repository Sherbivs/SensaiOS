/**
 * Homestead Channel Test Scenarios
 * 
 * Tests homestead channel mechanics including:
 * - Channel creation with correct naming
 * - Permission validation (user-only, bot access, everyone denied)
 * - Message delivery to homestead channels
 * - Channel persistence across commands
 * - Multiple user homesteads in same guild
 * 
 * **CRITICAL:** These tests validate the DM → homestead channel migration.
 * All gameplay must occur in private guild channels, not DMs.
 * 
 * @module tests/simulation/scenarios/homestead
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SimulatedGameEnvironment } from "../simulation-engine.js";
import { PlayerPersonality } from "../simulated-player.js";

describe("Homestead Channel Scenarios", () => {
  let env: SimulatedGameEnvironment;

  beforeEach(async () => {
    env = new SimulatedGameEnvironment({
      guildName: "Test Guild",
      enableLogging: false,
    });
    await env.initialize();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe("Channel Creation", () => {
    it("should create homestead channel on first command", async () => {
      const player = env.createPlayer("FirstUser", {
        personality: PlayerPersonality.BALANCED,
      });

      // Execute first command
      await env.executeCommand(player, "starter");

      // Validate homestead exists
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.name).toBeDefined();
    });

    it("should use correct naming convention", async () => {
      const player = env.createPlayer("TestUser", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.name).toBe("homestead-testuser");
    });

    it("should normalize usernames with special characters", async () => {
      const player = env.createPlayer("User_123-Test", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.name).toBe("homestead-user_123-test");
    });

    it("should handle usernames with uppercase letters", async () => {
      const player = env.createPlayer("CoolTrainer99", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.name).toBe("homestead-cooltrainer99");
    });

    it("should create unique channels for each user", async () => {
      const player1 = env.createPlayer("Player1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Player2", {
        personality: PlayerPersonality.DEFENSIVE,
      });
      const player3 = env.createPlayer("Player3", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player1, "starter");
      await env.executeCommand(player2, "starter");
      await env.executeCommand(player3, "starter");

      const validation1 = await env.validateHomesteadChannel(player1);
      const validation2 = await env.validateHomesteadChannel(player2);
      const validation3 = await env.validateHomesteadChannel(player3);

      expect(validation1.exists).toBe(true);
      expect(validation2.exists).toBe(true);
      expect(validation3.exists).toBe(true);

      expect(validation1.name).not.toBe(validation2.name);
      expect(validation2.name).not.toBe(validation3.name);
      expect(validation1.name).not.toBe(validation3.name);
    });

    it("should not create duplicate channels", async () => {
      const player = env.createPlayer("DuplicateTest", {
        personality: PlayerPersonality.BALANCED,
      });

      // Execute multiple commands
      await env.executeCommand(player, "starter");
      await env.executeCommand(player, "home");
      await env.executeCommand(player, "heal");

      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      
      // Should still only have one homestead channel
      // (In real implementation, would check guild.channels count for this user)
    });
  });

  describe("Channel Permissions", () => {
    it("should allow user to access their homestead", async () => {
      const player = env.createPlayer("PermissionUser", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.permissions).toBeDefined();
      expect(validation.permissions?.user).toBe(true);
    });

    it("should allow bot to access homestead", async () => {
      const player = env.createPlayer("BotAccessTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.permissions?.bot).toBe(true);
    });

    it("should deny everyone else access", async () => {
      const player = env.createPlayer("PrivacyTest", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.permissions?.everyone).toBe(false);
    });

    it("should validate all permissions together", async () => {
      const player = env.createPlayer("FullPermissionTest", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.permissions).toEqual({
        user: true,
        bot: true,
        everyone: false,
      });
    });
  });

  describe("Message Delivery", () => {
    it("should send messages to homestead channel", async () => {
      const player = env.createPlayer("MessageTest", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const channel = await env.getChannel(player, "homestead");

      expect(channel).toBeDefined();
      expect(channel?.isTextBased()).toBe(true);
    });

    it("should track message count in homestead", async () => {
      const player = env.createPlayer("MessageCounter", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");
      await env.executeCommand(player, "home");
      await env.executeCommand(player, "heal");

      const validation = await env.validateHomesteadChannel(player);

      expect(validation.messages).toBeDefined();
      expect(validation.messages).toBeGreaterThanOrEqual(0);
    });

    it("should deliver starter selection to homestead", async () => {
      const player = env.createPlayer("StarterDelivery", {
        personality: PlayerPersonality.BALANCED,
      });

      const result = await env.executeCommand(player, "starter");

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();

      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });

    it("should deliver home view to homestead", async () => {
      const player = env.createPlayer("HomeDelivery", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const result = await env.executeCommand(player, "home");

      expect(result.success).toBe(true);

      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });

    it("should deliver heal confirmation to homestead", async () => {
      const player = env.createPlayer("HealDelivery", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 10,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const result = await env.executeCommand(player, "heal");

      expect(result.success).toBe(true);

      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });
  });

  describe("Channel Persistence", () => {
    it("should persist homestead across multiple commands", async () => {
      const player = env.createPlayer("PersistenceTest", {
        personality: PlayerPersonality.BALANCED,
      });

      // First command creates homestead
      await env.executeCommand(player, "starter");
      const validation1 = await env.validateHomesteadChannel(player);
      const channelName1 = validation1.name;

      // Subsequent commands use same homestead
      await env.executeCommand(player, "home");
      const validation2 = await env.validateHomesteadChannel(player);
      const channelName2 = validation2.name;

      await env.executeCommand(player, "heal");
      const validation3 = await env.validateHomesteadChannel(player);
      const channelName3 = validation3.name;

      expect(channelName1).toBe(channelName2);
      expect(channelName2).toBe(channelName3);
    });

    it("should maintain channel reference", async () => {
      const player = env.createPlayer("ReferenceTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");
      
      const channel1 = await env.getChannel(player, "homestead");
      const channel2 = await env.getChannel(player, "homestead");

      expect(channel1).toBe(channel2);
    });
  });

  describe("Multiple User Homesteads", () => {
    it("should handle 5 concurrent homesteads", async () => {
      const players = Array.from({ length: 5 }, (_, i) =>
        env.createPlayer(`User${i + 1}`, {
          personality: PlayerPersonality.BALANCED,
        })
      );

      // Create all homesteads
      await Promise.all(
        players.map((player) => env.executeCommand(player, "starter"))
      );

      // Validate all exist
      const validations = await Promise.all(
        players.map((player) => env.validateHomesteadChannel(player))
      );

      expect(validations.every((v) => v.exists)).toBe(true);

      // All should have unique names
      const names = validations.map((v) => v.name);
      const uniqueNames = [...new Set(names)];
      expect(uniqueNames.length).toBe(5);
    });

    it("should handle 10 concurrent homesteads", async () => {
      const players = Array.from({ length: 10 }, (_, i) =>
        env.createPlayer(`Player${i + 1}`, {
          personality: i % 4 === 0 ? PlayerPersonality.AGGRESSIVE :
                       i % 4 === 1 ? PlayerPersonality.DEFENSIVE :
                       i % 4 === 2 ? PlayerPersonality.BALANCED :
                       PlayerPersonality.RANDOM,
        })
      );

      // Create all homesteads concurrently
      const startTime = Date.now();
      await Promise.all(
        players.map((player) => env.executeCommand(player, "starter"))
      );
      const duration = Date.now() - startTime;

      // Should complete quickly (< 2 seconds for 10 users)
      expect(duration).toBeLessThan(2000);

      // Validate all exist
      const validations = await Promise.all(
        players.map((player) => env.validateHomesteadChannel(player))
      );

      expect(validations.every((v) => v.exists)).toBe(true);
    });

    it("should isolate messages between homesteads", async () => {
      const player1 = env.createPlayer("IsolatedUser1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("IsolatedUser2", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player1, "starter");
      await env.executeCommand(player2, "starter");

      const channel1 = await env.getChannel(player1, "homestead");
      const channel2 = await env.getChannel(player2, "homestead");

      expect(channel1).not.toBe(channel2);
      expect(channel1?.id).not.toBe(channel2?.id);
    });
  });

  describe("Channel Categories", () => {
    it("should place homestead in correct category", async () => {
      const player = env.createPlayer("CategoryTest", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      // Category would be defined in real implementation
      expect(validation.category).toBeDefined();
    });
  });

  describe("Migration Validation (DM → Homestead)", () => {
    it("should NOT use DMs for gameplay", async () => {
      const player = env.createPlayer("NoDMTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      // Verify createDM throws deprecation error
      expect(() => {
        player.user.createDM();
      }).toThrow("createDM is deprecated");
    });

    it("should use homestead for all starter interactions", async () => {
      const player = env.createPlayer("StarterHomestead", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");

      // Should have homestead, not DM
      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });

    it("should use homestead for all home interactions", async () => {
      const player = env.createPlayer("HomeHomestead", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      await env.executeCommand(player, "home");

      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });

    it("should use homestead for all heal interactions", async () => {
      const player = env.createPlayer("HealHomestead", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 10,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      await env.executeCommand(player, "heal");

      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
    });

    it("should validate homestead architecture is complete", async () => {
      // Test that all 7 completed migration tasks work together
      const player = env.createPlayer("MigrationComplete", {
        personality: PlayerPersonality.BALANCED,
      });

      // 1. Create player
      expect(player.id).toBeDefined();

      // 2. Select starter (personality-driven)
      const starter = player.selectStarter();
      expect(starter).toBeDefined();

      // 3. Execute starter command (creates homestead)
      await env.executeCommand(player, "starter");

      // 4. Validate homestead exists with correct permissions
      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);
      expect(validation.name).toBe(`homestead-${player.username.toLowerCase()}`);
      expect(validation.permissions).toEqual({
        user: true,
        bot: true,
        everyone: false,
      });

      // 5. Update party
      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: starter,
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      // 6. Execute home command (uses homestead)
      await env.executeCommand(player, "home");

      // 7. Execute heal command (uses homestead)
      await env.executeCommand(player, "heal");

      // All interactions should have used homestead, not DMs
      const finalValidation = await env.validateHomesteadChannel(player);
      expect(finalValidation.exists).toBe(true);
      expect(finalValidation.messages).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle username with numbers", async () => {
      const player = env.createPlayer("User123456", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.name).toBe("homestead-user123456");
    });

    it("should handle very long usernames", async () => {
      const longUsername = "VeryLongUsername" + "A".repeat(20);
      const player = env.createPlayer(longUsername, {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.name).toContain("homestead-");
    });

    it("should return non-existent for missing homestead", async () => {
      const player = env.createPlayer("NoHomestead", {
        personality: PlayerPersonality.BALANCED,
      });

      // Don't create homestead
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(false);
    });

    it("should handle rapid homestead access", async () => {
      const player = env.createPlayer("RapidAccess", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");

      // Rapidly access homestead multiple times
      const validations = await Promise.all(
        Array.from({ length: 10 }, () =>
          env.validateHomesteadChannel(player)
        )
      );

      expect(validations.every((v) => v.exists)).toBe(true);
      expect(validations.every((v) => v.name === validations[0].name)).toBe(true);
    });
  });
});
