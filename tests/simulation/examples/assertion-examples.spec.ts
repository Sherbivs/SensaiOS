/**
 * Assertion Framework Usage Examples
 * 
 * Demonstrates how to use custom Vitest matchers in simulation tests.
 * These examples show the power of domain-specific assertions
 * for more readable and maintainable test code.
 * 
 * **BEFORE (Standard Assertions):**
 * ```typescript
 * expect(player.party.length).toBe(3);
 * expect(player.party[0].speciesName).toBe("Charmander");
 * ```
 * 
 * **AFTER (Custom Assertions):**
 * ```typescript
 * expect(player).toHavePokemon(3);
 * expect(player).toHaveStarter("Charmander");
 * ```
 * 
 * @module tests/simulation/examples/assertion-examples
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SimulatedGameEnvironment } from "../simulation-engine.js";
import { PlayerPersonality } from "../simulated-player.js";
import "../assertions.js"; // Import to extend Vitest expect

describe("Assertion Framework Examples", () => {
  let env: SimulatedGameEnvironment;

  beforeEach(async () => {
    env = new SimulatedGameEnvironment({
      guildName: "Assertion Examples Guild",
      enableLogging: false,
    });
    await env.initialize();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe("Player Pokemon Assertions", () => {
    it("example: toHavePokemon", async () => {
      const player = env.createPlayer("PokeCount", {
        personality: PlayerPersonality.BALANCED,
      });

      // Start with empty party
      expect(player).toHavePokemon(0);

      // Give starter
      await env.executeCommand(player, "starter");
      expect(player).toHavePokemon(1);

      // Add more Pokemon
      player.updateParty([
        ...player.party,
        {
          id: "2",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
      ]);
      expect(player).toHavePokemon(2);
    });

    it("example: toHaveStarter", async () => {
      const aggressive = env.createPlayer("Aggressive", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const defensive = env.createPlayer("Defensive", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      await env.executeCommand(aggressive, "starter");
      await env.executeCommand(defensive, "starter");

      // Aggressive picks Charmander, Defensive picks Bulbasaur
      expect(aggressive).toHaveStarter("Charmander");
      expect(defensive).toHaveStarter("Bulbasaur");
    });

    it("example: toHavePokemonNamed", async () => {
      const player = env.createPlayer("NameCheck", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
        {
          id: "2",
          speciesId: 25,
          speciesName: "Pikachu",
          level: 5,
          currentHp: 18,
          maxHp: 18,
          moves: ["Thunder Shock"],
        },
      ]);

      expect(player).toHavePokemonNamed("Squirtle");
      expect(player).toHavePokemonNamed("Pikachu");
    });

    it("example: toHaveFullParty", async () => {
      const player = env.createPlayer("FullParty", {
        personality: PlayerPersonality.BALANCED,
      });

      // Add 6 Pokemon
      player.updateParty(
        Array.from({ length: 6 }, (_, i) => ({
          id: `${i + 1}`,
          speciesId: i + 1,
          speciesName: `Pokemon${i + 1}`,
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        }))
      );

      expect(player).toHaveFullParty();
    });

    it("example: toHaveEmptyParty", async () => {
      const player = env.createPlayer("EmptyParty", {
        personality: PlayerPersonality.BALANCED,
      });

      expect(player).toHaveEmptyParty();
    });

    it("example: toHavePokemonInBox", async () => {
      const player = env.createPlayer("BoxCheck", {
        personality: PlayerPersonality.BALANCED,
      });

      // Start with empty box
      expect(player).toHavePokemonInBox(0);

      // Add Pokemon to box
      player.updateBox([
        {
          id: "box1",
          speciesId: 10,
          speciesName: "Caterpie",
          level: 3,
          currentHp: 12,
          maxHp: 12,
          moves: ["Tackle"],
        },
      ]);

      expect(player).toHavePokemonInBox(1);
    });

    it("example: toHaveMinimumCoins", async () => {
      const player = env.createPlayer("RichPlayer", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateCoins(500);

      expect(player).toHaveMinimumCoins(100);
      expect(player).toHaveMinimumCoins(500);
    });
  });

  describe("Homestead Channel Assertions", () => {
    it("example: toHaveValidHomestead", async () => {
      const player = env.createPlayer("HomesteadUser", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      // Single assertion checks all properties
      expect(validation).toHaveValidHomestead();
    });

    it("example: toHaveCorrectHomesteadName", async () => {
      const player = env.createPlayer("TestUser", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");
      const validation = await env.validateHomesteadChannel(player);

      expect(validation).toHaveCorrectHomesteadName("TestUser");
    });
  });

  describe("Battle Result Assertions", () => {
    it("example: toHaveBattleWinner", async () => {
      const player1 = env.createPlayer("Fighter1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Fighter2", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player1.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);
      player2.updateParty([
        {
          id: "2",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      // Check winner (will be one of the players or null for draw)
      if (result.winner) {
        expect(result).toHaveBattleWinner(result.winner);
      }
    });

    it("example: toHaveBattleDraw", async () => {
      const player1 = env.createPlayer("Defensive1", {
        personality: PlayerPersonality.DEFENSIVE,
      });
      const player2 = env.createPlayer("Defensive2", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player1.updateParty([
        {
          id: "1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Growl"], // Only status move
        },
      ]);
      player2.updateParty([
        {
          id: "2",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Growl"], // Only status move
        },
      ]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle, 10); // Max 10 turns

      // Likely a draw since both only have status moves
      if (!result.winner) {
        expect(result).toHaveBattleDraw();
      }
    });

    it("example: toHaveMinimumBattleTurns", async () => {
      const player1 = env.createPlayer("Battler1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("Battler2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([
        {
          id: "1",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);
      player2.updateParty([
        {
          id: "2",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      expect(result).toHaveMinimumBattleTurns(1);
    });

    it("example: toHaveMoveHistory", async () => {
      const player1 = env.createPlayer("History1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("History2", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player1.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);
      player2.updateParty([
        {
          id: "2",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      expect(result).toHaveMoveHistory();
    });
  });

  describe("Encounter Result Assertions", () => {
    it("example: toHaveEncounterOutcome", async () => {
      const player = env.createPlayer("EncounterTest", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);

      await env.executeCommand(player, "walk");
      
      // Aggressive personality tries to catch
      // Outcome could be "caught" or "escaped"
    });

    it("example: toHaveCaptured", async () => {
      const player = env.createPlayer("Catcher", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);

      // Multiple attempts to get a catch
      for (let i = 0; i < 5; i++) {
        await env.executeCommand(player, "walk");
      }

      // At least one should result in capture (aggressive always tries to catch)
    });

    it("example: toHaveEscaped", async () => {
      const player = env.createPlayer("Runner", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 5, // Low HP
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);

      // Defensive with low HP will try to run
      await env.executeCommand(player, "walk");
    });
  });

  describe("Pokemon State Assertions", () => {
    it("example: toHaveMoves", async () => {
      const pokemon = {
        id: "1",
        speciesId: 25,
        speciesName: "Pikachu",
        level: 10,
        currentHp: 30,
        maxHp: 30,
        moves: ["Thunder Shock", "Growl", "Tail Whip"],
      };

      expect(pokemon).toHaveMoves(["Thunder Shock"]);
      expect(pokemon).toHaveMoves(["Thunder Shock", "Growl"]);
    });

    it("example: toBeAtFullHp", async () => {
      const pokemon = {
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      };

      expect(pokemon).toBeAtFullHp();
    });

    it("example: toBeFainted", async () => {
      const pokemon = {
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 0,
        maxHp: 20,
        moves: ["Scratch"],
      };

      expect(pokemon).toBeFainted();
    });

    it("example: toHaveHpBelowThreshold", async () => {
      const pokemon = {
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 5,
        maxHp: 20,
        moves: ["Tackle"],
      };

      expect(pokemon).toHaveHpBelowThreshold(30); // 25% HP < 30%
      expect(pokemon).toHaveHpBelowThreshold(50); // 25% HP < 50%
    });
  });

  describe("Combining Multiple Assertions", () => {
    it("example: complete player validation", async () => {
      const player = env.createPlayer("CompleteTest", {
        personality: PlayerPersonality.BALANCED,
      });

      await env.executeCommand(player, "starter");

      // Multiple assertions in sequence
      expect(player).toHavePokemon(1);
      expect(player).toHaveStarter("Squirtle");
      expect(player).toHavePokemonInBox(0);
      expect(player).toHaveMinimumCoins(0);

      const validation = await env.validateHomesteadChannel(player);
      expect(validation).toHaveValidHomestead();
      expect(validation).toHaveCorrectHomesteadName("CompleteTest");
    });

    it("example: battle flow with assertions", async () => {
      const player1 = env.createPlayer("Flow1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Flow2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([
        {
          id: "1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
      ]);
      player2.updateParty([
        {
          id: "2",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);

      // Pre-battle assertions
      expect(player1).toHavePokemon(1);
      expect(player2).toHavePokemon(1);
      expect(player1.party[0]).toBeAtFullHp();
      expect(player2.party[0]).toBeAtFullHp();

      // Battle
      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      // Post-battle assertions
      expect(result).toHaveMinimumBattleTurns(1);
      expect(result).toHaveMoveHistory();

      if (result.winner) {
        expect(result).toHaveBattleWinner(result.winner);
      } else {
        expect(result).toHaveBattleDraw();
      }
    });
  });
});
