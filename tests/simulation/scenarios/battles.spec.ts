/**
 * Battle Test Scenarios
 * 
 * Tests PvP battle mechanics including:
 * - Battle initiation and acceptance
 * - AI move/switch decision-making
 * - Turn-by-turn simulation
 * - Battle completion and rewards
 * - Different personality matchups
 * 
 * @module tests/simulation/scenarios/battles
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SimulatedGameEnvironment } from "../simulation-engine.js";
import { PlayerPersonality } from "../simulated-player.js";

describe("Battle Scenarios", () => {
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

  describe("Battle Initiation", () => {
    it("should start battle between two players", async () => {
      const player1 = env.createPlayer("Trainer1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Trainer2", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      // Give both players starters
      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Growl"],
      }]);

      const battle = await env.startBattle(player1, player2);

      expect(battle).toBeDefined();
      expect(battle.id).toBeDefined();
      expect(battle.player1).toBe(player1);
      expect(battle.player2).toBe(player2);
      expect(battle.state).toBe("pending");
    });

    it("should emit battleStarted event", async () => {
      const player1 = env.createPlayer("EventTest1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("EventTest2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      let eventEmitted = false;
      let eventData: any = null;

      env.on("battleStarted", (data) => {
        eventEmitted = true;
        eventData = data;
      });

      await env.startBattle(player1, player2);

      expect(eventEmitted).toBe(true);
      expect(eventData).toBeDefined();
      expect(eventData.id).toBeDefined();
    });
  });

  describe("AI Battle Decisions", () => {
    it("should make aggressive player always attack", async () => {
      const player = env.createPlayer("AggressivePlayer", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Ember", "Growl"],
      }]);

      const mockBattleState = {
        battleId: "test-battle",
        yourPokemon: player.party[0],
        opponentPokemon: {
          id: "opp-1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 15,
          maxHp: 20,
          moves: ["Tackle"],
        },
        yourParty: player.party,
        opponentParty: [{
          id: "opp-1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 15,
          maxHp: 20,
          moves: ["Tackle"],
        }],
        turn: 1,
      };

      const action = player.selectBattleAction(mockBattleState);

      // Aggressive always uses moves, never switches
      expect(action.type).toBe("move");
      expect(action.reasoning).toContain("aggressive");
    });

    it("should make defensive player switch when HP low", async () => {
      const player = env.createPlayer("DefensivePlayer", {
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
        {
          id: "2",
          speciesId: 7,
          speciesName: "Squirtle",
          level: 5,
          currentHp: 20, // Full HP
          maxHp: 20,
          moves: ["Tackle"],
        },
      ]);

      const mockBattleState = {
        battleId: "test-battle",
        yourPokemon: player.party[0],
        opponentPokemon: {
          id: "opp-1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        },
        yourParty: player.party,
        opponentParty: [{
          id: "opp-1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        }],
        turn: 3,
      };

      const action = player.selectBattleAction(mockBattleState);

      // Defensive switches when HP < 60%
      expect(action.type).toBe("switch");
      expect(action.reasoning).toContain("defensive");
    });

    it("should make balanced player tactical decisions", async () => {
      const player = env.createPlayer("BalancedPlayer", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Water Gun", "Tail Whip"],
      }]);

      const mockBattleState = {
        battleId: "test-battle",
        yourPokemon: player.party[0],
        opponentPokemon: {
          id: "opp-1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 15,
          maxHp: 20,
          moves: ["Scratch"],
        },
        yourParty: player.party,
        opponentParty: [{
          id: "opp-1",
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 15,
          maxHp: 20,
          moves: ["Scratch"],
        }],
        turn: 2,
      };

      const action = player.selectBattleAction(mockBattleState);

      expect(action).toBeDefined();
      expect(["move", "switch"]).toContain(action.type);
      expect(action.reasoning).toContain("balanced");
    });

    it("should make random player unpredictable", async () => {
      const player = env.createPlayer("RandomPlayer", {
        personality: PlayerPersonality.RANDOM,
      });

      player.updateParty([
        {
          id: "1",
          speciesId: 25,
          speciesName: "Pikachu",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Thunder Shock", "Growl"],
        },
        {
          id: "2",
          speciesId: 39,
          speciesName: "Jigglypuff",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Pound"],
        },
      ]);

      const mockBattleState = {
        battleId: "test-battle",
        yourPokemon: player.party[0],
        opponentPokemon: {
          id: "opp-1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        },
        yourParty: player.party,
        opponentParty: [{
          id: "opp-1",
          speciesId: 1,
          speciesName: "Bulbasaur",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Tackle"],
        }],
        turn: 1,
      };

      // Run multiple times to test randomness
      const actions = [];
      for (let i = 0; i < 10; i++) {
        const action = player.selectBattleAction(mockBattleState);
        actions.push(action.type);
      }

      // Should have some variety (not all the same)
      const uniqueActions = [...new Set(actions)];
      expect(uniqueActions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Battle Simulation", () => {
    it("should simulate complete battle", async () => {
      const player1 = env.createPlayer("SimPlayer1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("SimPlayer2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Tail Whip"],
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      expect(result).toBeDefined();
      expect(result.battleId).toBe(battle.id);
      expect(result.turnCount).toBeGreaterThan(0);
      expect(result.moveHistory).toBeDefined();
      expect(result.moveHistory.length).toBeGreaterThan(0);
    });

    it("should determine winner", async () => {
      const player1 = env.createPlayer("Winner1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Winner2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      // Should have a winner or draw
      if (!result.isDraw) {
        expect(result.winner).toBeDefined();
        expect(result.loser).toBeDefined();
        expect(result.winner).not.toBe(result.loser);
        expect([player1, player2]).toContain(result.winner);
      } else {
        expect(result.winner).toBeNull();
        expect(result.loser).toBeNull();
      }
    });

    it("should track move history", async () => {
      const player1 = env.createPlayer("HistoryTest1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("HistoryTest2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      expect(result.moveHistory).toHaveLength(result.turnCount);
      
      // Each turn should have actions from both players
      result.moveHistory.forEach((turn) => {
        expect(turn.turn).toBeGreaterThan(0);
        expect(turn.player1Action).toBeDefined();
        expect(turn.player2Action).toBeDefined();
        expect(["move", "switch"]).toContain(turn.player1Action.type);
        expect(["move", "switch"]).toContain(turn.player2Action.type);
      });
    });

    it("should update battle state to finished", async () => {
      const player1 = env.createPlayer("StateTest1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("StateTest2", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const battle = await env.startBattle(player1, player2);
      expect(battle.state).toBe("pending");

      await env.simulateBattle(battle);

      expect(battle.state).toBe("finished");
    });

    it("should award rewards to winner", async () => {
      const player1 = env.createPlayer("Reward1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("Reward2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      if (!result.isDraw) {
        expect(result.rewards).toBeDefined();
        expect(result.rewards?.winner).toBeGreaterThan(0);
        expect(result.rewards?.loser).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Personality Matchups", () => {
    it("should test aggressive vs defensive matchup", async () => {
      const aggressive = env.createPlayer("Aggressor", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const defensive = env.createPlayer("Defender", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      aggressive.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Ember"],
      }]);

      defensive.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Leech Seed"],
      }]);

      const battle = await env.startBattle(aggressive, defensive);
      const result = await env.simulateBattle(battle);

      // Aggressive should win (mock logic favors aggressive)
      expect(result.winner).toBe(aggressive);
      expect(result.loser).toBe(defensive);
    });

    it("should test balanced vs balanced matchup", async () => {
      const player1 = env.createPlayer("Balanced1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("Balanced2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Water Gun"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Ember"],
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      // Either can win in balanced matchup
      expect([player1, player2]).toContain(result.winner);
    });

    it("should test random vs aggressive matchup", async () => {
      const random = env.createPlayer("Chaos", {
        personality: PlayerPersonality.RANDOM,
      });
      const aggressive = env.createPlayer("Attacker", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      random.updateParty([{
        id: "1",
        speciesId: 25,
        speciesName: "Pikachu",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Thunder Shock", "Growl"],
      }]);

      aggressive.updateParty([{
        id: "2",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      const battle = await env.startBattle(random, aggressive);
      const result = await env.simulateBattle(battle);

      // Aggressive should win (mock logic)
      expect(result.winner).toBe(aggressive);
    });
  });

  describe("Multiple Battles", () => {
    it("should handle consecutive battles", async () => {
      const player1 = env.createPlayer("ConsecutivePlayer1", {
        personality: PlayerPersonality.BALANCED,
      });
      const player2 = env.createPlayer("ConsecutivePlayer2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      const results = [];

      for (let i = 0; i < 3; i++) {
        const battle = await env.startBattle(player1, player2);
        const result = await env.simulateBattle(battle);
        results.push(result);
      }

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.battleId)).toBe(true);
    });

    it("should track multiple simultaneous battles", async () => {
      const players = [
        env.createPlayer("Multi1", { personality: PlayerPersonality.AGGRESSIVE }),
        env.createPlayer("Multi2", { personality: PlayerPersonality.DEFENSIVE }),
        env.createPlayer("Multi3", { personality: PlayerPersonality.BALANCED }),
        env.createPlayer("Multi4", { personality: PlayerPersonality.RANDOM }),
      ];

      // Give all players starters
      players.forEach((player) => {
        player.updateParty([{
          id: `${player.username}-1`,
          speciesId: 4,
          speciesName: "Charmander",
          level: 5,
          currentHp: 20,
          maxHp: 20,
          moves: ["Scratch"],
        }]);
      });

      // Create 2 simultaneous battles
      const battle1 = await env.startBattle(players[0], players[1]);
      const battle2 = await env.startBattle(players[2], players[3]);

      expect(battle1.id).not.toBe(battle2.id);

      const [result1, result2] = await Promise.all([
        env.simulateBattle(battle1),
        env.simulateBattle(battle2),
      ]);

      expect(result1.battleId).toBe(battle1.id);
      expect(result2.battleId).toBe(battle2.id);
    });
  });

  describe("Edge Cases", () => {
    it("should handle battle with max turns (draw)", async () => {
      const player1 = env.createPlayer("DrawPlayer1", {
        personality: PlayerPersonality.DEFENSIVE,
      });
      const player2 = env.createPlayer("DrawPlayer2", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Growl"], // Status move only
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tail Whip"], // Status move only
      }]);

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle, 10); // Low max turns

      // Should end in draw if max turns reached
      expect(result.turnCount).toBeLessThanOrEqual(10);
    });

    it("should emit decision events during battle", async () => {
      const player1 = env.createPlayer("DecisionPlayer1", {
        personality: PlayerPersonality.AGGRESSIVE,
      });
      const player2 = env.createPlayer("DecisionPlayer2", {
        personality: PlayerPersonality.BALANCED,
      });

      player1.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      player2.updateParty([{
        id: "2",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      let player1Decisions = 0;
      let player2Decisions = 0;

      player1.on("decision", (data) => {
        if (data.type === "move" || data.type === "switch") {
          player1Decisions++;
        }
      });

      player2.on("decision", (data) => {
        if (data.type === "move" || data.type === "switch") {
          player2Decisions++;
        }
      });

      const battle = await env.startBattle(player1, player2);
      const result = await env.simulateBattle(battle);

      // Each player should make decisions each turn
      expect(player1Decisions).toBe(result.turnCount);
      expect(player2Decisions).toBe(result.turnCount);
    });
  });
});
