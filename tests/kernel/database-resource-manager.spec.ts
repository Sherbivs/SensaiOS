import { describe, expect, it } from 'vitest';

import { resolveBytesExpression } from '../../src/kernel/database-resource-manager.js';

describe('database-resource-manager schema expression resolver', () => {
  it('selects the first available preferred column', () => {
    const expression = resolveBytesExpression(
      new Set(['namespace', 'metadata', 'created_at']),
      ['value', 'metadata', 'payload']
    );

    expect(expression).toBe('COALESCE(SUM(LENGTH(metadata::text)::bigint), 0) as total_bytes');
  });

  it('falls back to zero expression when no preferred columns exist', () => {
    const expression = resolveBytesExpression(
      new Set(['id', 'created_at']),
      ['value', 'metadata', 'payload']
    );

    expect(expression).toBe('0::bigint as total_bytes');
  });
});
