import { describe, it, expect } from 'vitest';
import { buildBattleActionPrompt, __testing as actionsTesting } from '../src/bot/battle/actions';
import { buildArenaTurnSummary, buildDMDetailedLog } from '../src/bot/arena/summary';

describe('battle UI actions', () => {
  it('builds a DM action prompt with three buttons', () => {
    const { embed, components } = buildBattleActionPrompt('battle-xyz');
    expect(embed.data.title).toContain('Your Move');
    expect(components).toHaveLength(1);
    const buttons = components[0].toJSON().components;
    expect(buttons).toHaveLength(3);
    const ids = buttons.map((b: any) => b.custom_id);
    expect(ids[0]).toContain('battle-xyz');
    expect(ids.join(',')).toMatch(/BATTLE_MOVE_|BATTLE_SWITCH_|BATTLE_FORFEIT_/);
  });

  it('parses button custom IDs', () => {
    const p1 = actionsTesting.parse('BATTLE_MOVE_abc');
    const p2 = actionsTesting.parse('BATTLE_SWITCH_def');
    const p3 = actionsTesting.parse('BATTLE_FORFEIT_ghi');
    expect(p1?.kind).toBe('move');
    expect(p2?.kind).toBe('switch');
    expect(p3?.kind).toBe('forfeit');
  });
});

describe('arena summary', () => {
  it('compacts a turn log into a concise summary', () => {
    const log = [
      'Charizard uses Flamethrower -> Venusaur takes 60 (180→120)',
      'Venusaur flinched!'
    ];
    const summary = buildArenaTurnSummary(log);
    expect(summary.toLowerCase()).toContain('uses flamethrower');
    expect(summary.toLowerCase()).toContain('flinched');
  });
  it('keeps detailed DM log intact', () => {
    const log = [ 'A', 'B', 'C' ];
    const dm = buildDMDetailedLog(log);
    expect(dm).toBe('A\nB\nC');
  });
});
