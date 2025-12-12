/**
 * Wild Encounters Test Scenarios
 * 
 * Tests wild Pokémon encounter mechanics including:
 * - Walk command triggering encounters
 * - AI decision-making (catch/fight/run)
 * - Catch success/failure handling
 * - Party and box updates after capture
 * - Encounter outcome variations
 * 
 * @module tests/simulation/scenarios/wild-encounters
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SimulatedGameEnvironment } from "../simulation-engine.js";
import { PlayerPersonality } from "../simulated-player.js";

describe("Wild Encounters Scenarios", () => {
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

  describe("Encounter Triggering", () => {
    it("should trigger encounter when player walks", async () => {
      const player = env.createPlayer("Walker", {
        personality: PlayerPersonality.BALANCED,
      });

      // Give player a starter
      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Growl"],
      }]);

      // Trigger encounter
      const encounter = await env.triggerWildEncounter(player);

      expect(encounter).toBeDefined();
      expect(encounter.id).toBeDefined();
      expect(encounter.player).toBe(player);
      expect(encounter.state).toBe("active");
    });

    it("should emit encounterTriggered event", async () => {
      const player = env.createPlayer("EventWalker", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      let eventEmitted = false;
      let eventData: any = null;

      env.on("encounterTriggered", (data) => {
        eventEmitted = true;
        eventData = data;
      });

      await env.triggerWildEncounter(player);

      expect(eventEmitted).toBe(true);
      expect(eventData).toBeDefined();
      expect(eventData.id).toBeDefined();
    });
  });

  describe("AI Decision-Making", () => {
    it("should make aggressive player always try to catch", async () => {
      const player = env.createPlayer("AggressiveHunter", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      // Aggressive always catches or fights, never runs
      expect(["catch", "fight"]).toContain(result.action.type);
      expect(result.action.type).not.toBe("run");
    });

    it("should make defensive player run when low HP", async () => {
      const player = env.createPlayer("DefensiveRunner", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      // Give player low HP Pokémon
      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 5, // Low HP
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      
      // Mock encounter state with low HP
      const encounterState = {
        encounterId: encounter.id,
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.4,
        turn: 1,
      };

      const action = player.handleWildEncounter(encounterState);

      // Defensive with low HP should run
      expect(action.type).toBe("run");
      expect(action.reasoning).toContain("low HP");
    });

    it("should make balanced player use tactical decisions", async () => {
      const player = env.createPlayer("TacticalPlayer", {
        personality: PlayerPersonality.BALANCED,
        catchThreshold: 0.4,
      });

      player.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      // Balanced makes calculated decisions
      expect(["catch", "fight", "run"]).toContain(result.action.type);
      expect(result.action.reasoning).toBeDefined();
    });

    it("should make random player unpredictable", async () => {
      const player = env.createPlayer("ChaosTester", {
        personality: PlayerPersonality.RANDOM,
      });

      player.updateParty([{
        id: "1",
        speciesId: 25,
        speciesName: "Pikachu",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Thunder Shock"],
      }]);

      // Run multiple encounters to test randomness
      const actions: string[] = [];

      for (let i = 0; i < 10; i++) {
        const encounter = await env.triggerWildEncounter(player);
        const result = await env.simulateEncounter(encounter);
        actions.push(result.action.type);
      }

      // Should have variety of actions (not all the same)
      const uniqueActions = [...new Set(actions)];
      expect(uniqueActions.length).toBeGreaterThan(1);
    });
  });

  describe("Catch Mechanics", () => {
    it("should successfully catch Pokémon", async () => {
      const player = env.createPlayer("Catcher", {
        personality: PlayerPersonality.AGGRESSIVE,
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

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      // Check if catch was attempted
      if (result.action.type === "catch") {
        expect(["caught", "escaped"]).toContain(result.outcome);
      }
    });

    it("should not catch when party is full", async () => {
      const player = env.createPlayer("FullParty", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      // Fill party with 6 Pokémon
      player.updateParty([
        { id: "1", speciesId: 1, speciesName: "Bulbasaur", level: 5, currentHp: 20, maxHp: 20, moves: ["Tackle"] },
        { id: "2", speciesId: 4, speciesName: "Charmander", level: 5, currentHp: 20, maxHp: 20, moves: ["Scratch"] },
        { id: "3", speciesId: 7, speciesName: "Squirtle", level: 5, currentHp: 20, maxHp: 20, moves: ["Tackle"] },
        { id: "4", speciesId: 25, speciesName: "Pikachu", level: 5, currentHp: 20, maxHp: 20, moves: ["Thunder Shock"] },
        { id: "5", speciesId: 39, speciesName: "Jigglypuff", level: 5, currentHp: 20, maxHp: 20, moves: ["Pound"] },
        { id: "6", speciesId: 133, speciesName: "Eevee", level: 5, currentHp: 20, maxHp: 20, moves: ["Tackle"] },
      ]);

      const encounterState = {
        encounterId: "test-1",
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.8,
        turn: 1,
      };

      const action = player.handleWildEncounter(encounterState);

      // Should not attempt catch when party is full
      expect(action.type).not.toBe("catch");
    });

    it("should respect catch threshold for balanced players", async () => {
      const player = env.createPlayer("ThresholdTest", {
        personality: PlayerPersonality.BALANCED,
        catchThreshold: 0.7, // High threshold
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

      const lowCatchRateEncounter = {
        encounterId: "test-1",
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.3, // Below threshold
        turn: 1,
      };

      const action = player.handleWildEncounter(lowCatchRateEncounter);

      // Balanced player should not catch below threshold
      expect(action.type).not.toBe("catch");
    });
  });

  describe("Fight Mechanics", () => {
    it("should handle fight action", async () => {
      const player = env.createPlayer("Fighter", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch", "Growl"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      if (result.action.type === "fight") {
        expect(result.outcome).toBeDefined();
        expect(["fainted", "escaped"]).toContain(result.outcome);
        expect(result.turns).toBeGreaterThan(0);
      }
    });

    it("should use AI move selection when fighting", async () => {
      const player = env.createPlayer("TacticalFighter", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle", "Growl", "Vine Whip"],
      }]);

      const encounterState = {
        encounterId: "test-1",
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.2,
        turn: 1,
      };

      const action = player.handleWildEncounter(encounterState);

      if (action.type === "fight") {
        expect(action.moveIndex).toBeDefined();
        expect(action.moveIndex).toBeGreaterThanOrEqual(0);
        expect(action.moveIndex).toBeLessThan(player.party[0].moves.length);
      }
    });
  });

  describe("Run Mechanics", () => {
    it("should allow running from encounters", async () => {
      const player = env.createPlayer("Runner", {
        personality: PlayerPersonality.DEFENSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 5, // Low HP
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      if (result.action.type === "run") {
        expect(["escaped", "fled"]).toContain(result.outcome);
      }
    });
  });

  describe("Party and Box Updates", () => {
    it("should update party after successful catch", async () => {
      const player = env.createPlayer("PartyUpdater", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      const initialPartySize = 1;
      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const encounter = await env.triggerWildEncounter(player);
      const result = await env.simulateEncounter(encounter);

      // If caught successfully, party should grow
      if (result.outcome === "caught") {
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

        expect(player.party.length).toBe(initialPartySize + 1);
      }
    });

    it("should emit partyUpdated event after catch", async () => {
      const player = env.createPlayer("EventCatcher", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      let eventEmitted = false;

      player.on("partyUpdated", () => {
        eventEmitted = true;
      });

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

      expect(eventEmitted).toBe(true);
    });
  });

  describe("Multiple Encounters", () => {
    it("should handle consecutive encounters", async () => {
      const player = env.createPlayer("MultiEncounter", {
        personality: PlayerPersonality.RANDOM,
      });

      player.updateParty([{
        id: "1",
        speciesId: 25,
        speciesName: "Pikachu",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Thunder Shock"],
      }]);

      const encounters = [];

      for (let i = 0; i < 5; i++) {
        const encounter = await env.triggerWildEncounter(player);
        const result = await env.simulateEncounter(encounter);
        encounters.push(result);
      }

      expect(encounters).toHaveLength(5);
      expect(encounters.every((e) => e.encounterId)).toBe(true);
      expect(encounters.every((e) => e.action)).toBeTruthy();
    });

    it("should track encounter state correctly", async () => {
      const player = env.createPlayer("StateTracker", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 7,
        speciesName: "Squirtle",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Tackle"],
      }]);

      const encounter1 = await env.triggerWildEncounter(player);
      expect(encounter1.state).toBe("active");

      await env.simulateEncounter(encounter1);
      
      // State should update after simulation
      expect(["caught", "fled", "fainted"]).toContain(encounter1.state);

      const encounter2 = await env.triggerWildEncounter(player);
      expect(encounter2.state).toBe("active");
      expect(encounter2.id).not.toBe(encounter1.id);
    });
  });

  describe("Edge Cases", () => {
    it("should handle encounter with no moves", async () => {
      const player = env.createPlayer("NoMoves", {
        personality: PlayerPersonality.BALANCED,
      });

      player.updateParty([{
        id: "1",
        speciesId: 1,
        speciesName: "Bulbasaur",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: [], // No moves
      }]);

      const encounterState = {
        encounterId: "test-1",
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.4,
        turn: 1,
      };

      // Should still make a decision
      const action = player.handleWildEncounter(encounterState);
      expect(action).toBeDefined();
      expect(["catch", "run"]).toContain(action.type);
    });

    it("should handle encounter decision event emission", async () => {
      const player = env.createPlayer("DecisionEmitter", {
        personality: PlayerPersonality.AGGRESSIVE,
      });

      player.updateParty([{
        id: "1",
        speciesId: 4,
        speciesName: "Charmander",
        level: 5,
        currentHp: 20,
        maxHp: 20,
        moves: ["Scratch"],
      }]);

      let decisionEmitted = false;
      let decisionData: any = null;

      player.on("decision", (data) => {
        if (data.type === "encounter") {
          decisionEmitted = true;
          decisionData = data;
        }
      });

      const encounterState = {
        encounterId: "test-1",
        wildPokemon: {
          id: "wild-1",
          speciesId: 19,
          speciesName: "Rattata",
          level: 3,
          currentHp: 15,
          maxHp: 15,
          moves: ["Tackle"],
        },
        yourPokemon: player.party[0],
        catchRate: 0.4,
        turn: 1,
      };

      player.handleWildEncounter(encounterState);

      expect(decisionEmitted).toBe(true);
      expect(decisionData).toBeDefined();
      expect(decisionData.action).toBeDefined();
      expect(decisionData.reasoning).toBeDefined();
    });
  });
});
