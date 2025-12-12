/**
 * Onboarding Test Scenarios
 * 
 * Tests new player onboarding flow including:
 * - Starter Pokémon selection (all 4 personalities)
 * - Homestead channel creation
 * - Party initialization
 * - First-time user experience
 * 
 * @module tests/simulation/scenarios/onboarding
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SimulatedGameEnvironment } from "../simulation-engine.js";
import { PlayerPersonality } from "../simulated-player.js";

describe("Onboarding Scenarios", () => {
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

  describe("Starter Selection", () => {
    it("should allow aggressive player to select Charmander", async () => {
      // Create aggressive player
      const player = env.createPlayer("Ash", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      // AI selects starter based on personality
      const starterChoice = player.selectStarter();

      // Aggressive personality prefers Charmander
      expect(starterChoice).toBe("Charmander");
      expect(player.personality).toBe(PlayerPersonality.AGGRESSIVE);
    });

    it("should allow defensive player to select Bulbasaur", async () => {
      // Create defensive player
      const player = env.createPlayer("Gary", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      // AI selects starter
      const starterChoice = player.selectStarter();

      // Defensive personality prefers Bulbasaur
      expect(starterChoice).toBe("Bulbasaur");
      expect(player.personality).toBe(PlayerPersonality.DEFENSIVE);
    });

    it("should allow balanced player to select Squirtle", async () => {
      // Create balanced player
      const player = env.createPlayer("Misty", {
        personality: PlayerPersonality.BALANCED,
      });

      // AI selects starter
      const starterChoice = player.selectStarter();

      // Balanced personality prefers Squirtle
      expect(starterChoice).toBe("Squirtle");
      expect(player.personality).toBe(PlayerPersonality.BALANCED);
    });

    it("should allow random player to select any starter", async () => {
      // Create random player
      const player = env.createPlayer("Brock", {
        personality: PlayerPersonality.RANDOM,
      });

      // AI selects random starter
      const starterChoice = player.selectStarter();

      // Random can select any of the three
      expect(["Bulbasaur", "Charmander", "Squirtle"]).toContain(starterChoice);
      expect(player.personality).toBe(PlayerPersonality.RANDOM);
    });

    it("should respect preferred starter override", async () => {
      // Create player with preferred starter
      const player = env.createPlayer("May", {
        personality: PlayerPersonality.AGGRESSIVE,
        preferredStarter: "Bulbasaur", // Override aggressive default
      });

      // AI respects preference over personality
      const starterChoice = player.selectStarter();

      expect(starterChoice).toBe("Bulbasaur");
    });

    it("should emit decision event on starter selection", async () => {
      const player = env.createPlayer("Dawn", {
        personality: PlayerPersonality.BALANCED,
      });

      let decisionEmitted = false;
      let decisionData: any = null;

      player.on("decision", (data) => {
        decisionEmitted = true;
        decisionData = data;
      });

      const starterChoice = player.selectStarter();

      expect(decisionEmitted).toBe(true);
      expect(decisionData).toBeDefined();
      expect(decisionData.type).toBe("starter");
      expect(decisionData.choice).toBe(starterChoice);
      expect(decisionData.reasoning).toBeDefined();
    });
  });

  describe("Homestead Channel Creation", () => {
    it("should create homestead channel for new player", async () => {
      const player = env.createPlayer("Serena", {
        personality: PlayerPersonality.BALANCED,
      });

      // Execute starter command (should trigger homestead creation)
      await env.executeCommand(player, "starter");

      // Validate homestead channel exists
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.name).toBe(`homestead-${player.username.toLowerCase()}`);
    });

    it("should create homestead channel with correct naming", async () => {
      const player = env.createPlayer("CoolTrainer123", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.name).toBe("homestead-cooltrainer123");
    });

    it("should create homestead channel with correct permissions", async () => {
      const player = env.createPlayer("TestUser", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.permissions).toBeDefined();
      expect(validation.permissions?.user).toBe(true); // User can access
      expect(validation.permissions?.bot).toBe(true); // Bot can access
      expect(validation.permissions?.everyone).toBe(false); // Others cannot
    });

    it("should handle multiple players creating homesteads concurrently", async () => {
      // Create multiple players
      const players = [
        env.createPlayer("Player1", { personality: PlayerPersonality.AGGRESSIVE }),
        env.createPlayer("Player2", { personality: PlayerPersonality.DEFENSIVE }),
        env.createPlayer("Player3", { personality: PlayerPersonality.BALANCED }),
      ];

      // Execute starter command for all players concurrently
      await Promise.all(
        players.map((player) => env.executeCommand(player, "starter"))
      );

      // Validate all homesteads created
      const validations = await Promise.all(
        players.map((player) => env.validateHomesteadChannel(player))
      );

      expect(validations.every((v) => v.exists)).toBe(true);
      expect(validations[0].name).toBe("homestead-player1");
      expect(validations[1].name).toBe("homestead-player2");
      expect(validations[2].name).toBe("homestead-player3");
    });
  });

  describe("Party Initialization", () => {
    it("should initialize empty party for new player", async () => {
      const player = env.createPlayer("NewPlayer", {
        personality: PlayerPersonality.BALANCED,
      });

      expect(player.party).toHaveLength(0);
      expect(player.box).toHaveLength(0);
      expect(player.hasStarter).toBe(false);
    });

    it("should update party after starter selection", async () => {
      const player = env.createPlayer("StarterTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      const starterChoice = player.selectStarter();

      // Simulate database updating party (would happen in real game)
      player.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: starterChoice,
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch", "Growl"],
        },
      ]);

      expect(player.party).toHaveLength(1);
      expect(player.party[0].speciesName).toBe(starterChoice);
      expect(player.hasStarter).toBe(true);
    });

    it("should emit partyUpdated event when party changes", async () => {
      const player = env.createPlayer("EventTest", {
        personality: PlayerPersonality.BALANCED,
      });

      let eventEmitted = false;
      let eventData: any = null;

      player.on("partyUpdated", (data) => {
        eventEmitted = true;
        eventData = data;
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle", "Tail Whip"],
        },
      ]);

      expect(eventEmitted).toBe(true);
      expect(eventData).toBeDefined();
      expect(eventData.partySize).toBe(1);
    });
  });

  describe("First-Time User Experience", () => {
    it("should complete full onboarding flow", async () => {
      // 1. Create player
      const player = env.createPlayer("CompleteTest", {
        personality: PlayerPersonality.BALANCED,
      });

      expect(player.id).toBeDefined();
      expect(player.username).toBe("CompleteTest");

      // 2. Select starter
      const starterChoice = player.selectStarter();
      expect(["Bulbasaur", "Charmander", "Squirtle"]).toContain(starterChoice);

      // 3. Execute starter command
      const result = await env.executeCommand(player, "starter");
      expect(result.success).toBe(true);

      // 4. Validate homestead created
      const validation = await env.validateHomesteadChannel(player);
      expect(validation.exists).toBe(true);

      // 5. Update party (simulating database sync)
      player.updateParty([
        {
          id: "1",
          speciesId: 7,
          speciesName: starterChoice,
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle", "Tail Whip"],
        },
      ]);

      expect(player.party).toHaveLength(1);
      expect(player.hasStarter).toBe(true);
    });

    it("should handle rapid onboarding of multiple users", async () => {
      const startTime = Date.now();

      // Create 5 players with different personalities
      const players = [
        env.createPlayer("Rapid1", { personality: PlayerPersonality.AGGRESSIVE }),
        env.createPlayer("Rapid2", { personality: PlayerPersonality.DEFENSIVE }),
        env.createPlayer("Rapid3", { personality: PlayerPersonality.BALANCED }),
        env.createPlayer("Rapid4", { personality: PlayerPersonality.RANDOM }),
        env.createPlayer("Rapid5", { personality: PlayerPersonality.BALANCED }),
      ];

      // All select starters
      const starters = players.map((p) => p.selectStarter());
      expect(starters).toHaveLength(5);

      // All execute starter command
      const results = await Promise.all(
        players.map((p) => env.executeCommand(p, "starter"))
      );
      expect(results.every((r) => r.success)).toBe(true);

      // All get homesteads
      const validations = await Promise.all(
        players.map((p) => env.validateHomesteadChannel(p))
      );
      expect(validations.every((v) => v.exists)).toBe(true);

      const duration = Date.now() - startTime;
      
      // Should complete quickly (< 2 seconds for 5 players)
      expect(duration).toBeLessThan(2000);
    });

    it("should maintain player state across commands", async () => {
      const player = env.createPlayer("StateTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      // Initial state
      expect(player.coins).toBe(0);
      expect(player.party).toHaveLength(0);

      // Select starter
      const starter = player.selectStarter();

      // Update state
      player.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: starter,
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);
      player.updateCoins(100);

      // Verify state persisted
      expect(player.party).toHaveLength(1);
      expect(player.coins).toBe(100);
      expect(player.getState()).toContain('"coins":100');
      expect(player.getState()).toContain('"partySize":1');
    });
  });

  describe("Edge Cases", () => {
    it("should handle duplicate username creation attempt", async () => {
      env.createPlayer("DuplicateUser", {
        personality: PlayerPersonality.BALANCED,
      });

      expect(() => {
        env.createPlayer("DuplicateUser", {
          personality: PlayerPersonality.AGGRESSIVE,
        });
      }).toThrow("Player \"DuplicateUser\" already exists");
    });

    it("should allow retrieving existing player", async () => {
      const originalPlayer = env.createPlayer("ExistingUser", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      const retrievedPlayer = env.getPlayer("ExistingUser");

      expect(retrievedPlayer).toBeDefined();
      expect(retrievedPlayer?.id).toBe(originalPlayer.id);
      expect(retrievedPlayer?.username).toBe("ExistingUser");
    });

    it("should return undefined for non-existent player", async () => {
      const player = env.getPlayer("NonExistentUser");
      expect(player).toBeUndefined();
    });

    it("should handle player with special characters in username", async () => {
      const player = env.createPlayer("User_123-Test", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation.exists).toBe(true);
      expect(validation.name).toBe("homestead-user_123-test");
    });
  });
});
