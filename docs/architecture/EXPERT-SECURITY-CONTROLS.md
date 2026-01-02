# Security / Controls Engineer — Expert Review
**Focus:** Guardrails, Least Privilege  
**Date:** December 30, 2025

---

## Core Recommendations

### 1. Capabilities Enforcement at OS Layer
"If user-space loads after OS, that's where capabilities enforcement belongs: manifest declares what a component can do; OS enforces it at runtime."

**Component Manifest:**
```typescript
interface ComponentManifest {
  name: string;
  version: string;
  
  // REQUIRED: Explicit capability declarations
  capabilities: {
    db?: Array<'read' | 'write' | 'migrate'>;
    discord?: Array<'read' | 'send' | 'moderate'>;
    network?: Array<'http-egress' | 'webhook'>;
    storage?: Array<'read' | 'write' | 'delete'>;
  };
  
  // REQUIRED: Data ownership
  owns?: {
    canonical?: string[];    // Tables this component WRITES
    projections?: string[];  // Read models it maintains
  };
}
```

**Runtime Enforcement:**
```typescript
class ComponentSupervisor {
  async checkCapability(component: string, capability: Capability): Promise<void> {
    const manifest = this.registry.getManifest(component);
    
    if (!this.hasCapability(manifest, capability)) {
      throw new SecurityError({
        code: 4001,
        message: `Component '${component}' lacks capability '${capability.type}:${capability.action}'`,
        context: { component, capability, manifest: manifest.capabilities }
      });
    }
  }
  
  private hasCapability(manifest: ComponentManifest, capability: Capability): boolean {
    const domain = capability.type; // e.g., 'db', 'discord'
    const action = capability.action; // e.g., 'write', 'send'
    
    return manifest.capabilities[domain]?.includes(action) ?? false;
  }
}
```

### 2. Audit All Privileged Actions
"Make privileged actions auditable by default (RBAC + audit export). Don't let components write directly to other components' canonical tables."

**Audit Event Schema:**
```typescript
interface AuditEvent {
  // WHO
  actor: {
    type: 'user' | 'component' | 'system';
    id: string;
    name: string;
  };
  
  // WHAT
  action: string;              // e.g., "db.write", "discord.ban"
  target: {
    type: string;              // e.g., "table", "user", "guild"
    id: string;
    name?: string;
  };
  
  // WHEN
  timestamp: Date;
  
  // WHERE
  scope: TenantScope;
  correlationId: string;
  
  // OUTCOME
  status: 'allowed' | 'denied' | 'error';
  reason?: string;
  
  // CONTEXT
  metadata?: Record<string, unknown>;
}
```

**Privileged Actions (must be audited):**
- Database writes to canonical tables
- Discord moderation actions (ban, kick, mute)
- Configuration changes (feature flags, RBAC rules)
- Component enable/disable operations
- Tenant/guild-level operations

### 3. Data Ownership Enforcement
"Don't let components write directly to other components' canonical tables."

**Ownership Rules:**
```typescript
// ✅ ALLOWED: Component writes to its own canonical table
// game.battles component
await tx.battle.update({
  where: { id: battleId },
  data: { status: 'complete' }
});

// ❌ FORBIDDEN: Component writes to another component's canonical table
// game.battles component trying to write to game.inventory's table
await tx.inventory.update({ // ← VIOLATION
  where: { userId },
  data: { money: 1000 }
});

// ✅ CORRECT: Request via export/job
await ctx.exports.append({
  source: 'game.battles',
  type: 'inventory.money.grant',
  scope: ctx.scope,
  idempotencyKey: `battle-reward-${battleId}`,
  payload: { userId, amount: 1000, reason: 'battle-win' }
});
// game.inventory component handles the export and does the write
```

**Runtime Check:**
```typescript
async function enforceOwnership(component: string, table: string, operation: 'read' | 'write') {
  const manifest = this.registry.getManifest(component);
  
  if (operation === 'write') {
    const ownedTables = manifest.owns?.canonical ?? [];
    if (!ownedTables.includes(table)) {
      throw new SecurityError({
        code: 4002,
        message: `Component '${component}' cannot write to table '${table}' (not owned)`,
        context: { component, table, ownedTables }
      });
    }
  }
}
```

### 4. Correlation IDs as Security Boundary
"Treat correlation IDs and tenant scope as part of the security boundary too—logs without scope are an incident waiting to happen."

**Scope Requirements:**
```typescript
// ❌ FORBIDDEN: Log without tenant scope
log.info('Battle completed', { battleId });

// ✅ REQUIRED: All logs include tenant scope
log.info('Battle completed', {
  battleId,
  scope: { tenantId: ctx.tenantId, guildId: ctx.guildId },
  correlationId: ctx.correlationId
});
```

**Why This Matters:**
- **Data Isolation:** Prevents cross-tenant data leaks in logs
- **Incident Response:** Can filter logs by affected tenant/guild
- **Compliance:** Audit trails show exactly which tenant was affected
- **Debugging:** Correlation ID traces full request path across services

**Validation Rule:**
```typescript
function validateEnvelope(envelope: any): asserts envelope is ValidEnvelope {
  if (!envelope.scope?.tenantId) {
    throw new ValidationError('Missing tenantId in scope');
  }
  if (!envelope.scope?.guildId) {
    throw new ValidationError('Missing guildId in scope');
  }
  if (!envelope.correlationId) {
    throw new ValidationError('Missing correlationId');
  }
}
```

---

## Validation Checklist

- [ ] All component manifests declare capabilities explicitly
- [ ] SensaiOS supervisor enforces capabilities at runtime
- [ ] Privileged actions emit audit events
- [ ] Audit events stored in append-only table
- [ ] Data ownership rules enforced (components cannot write to others' canonical tables)
- [ ] All envelopes include tenant scope (tenantId + guildId)
- [ ] All envelopes include correlation ID
- [ ] Scope validation enforced at envelope creation
- [ ] Cross-tenant data leaks prevented via scope filtering

---

## Security Threat Model

**Threats:**
1. **Privilege Escalation:** Component exceeds manifest capabilities
2. **Data Corruption:** Component writes to another's canonical table
3. **Cross-Tenant Leak:** Logs/data exposed to wrong tenant
4. **Audit Bypass:** Privileged action not recorded
5. **Replay Attack:** Old event re-processed without idempotency check

**Mitigations:**
1. Runtime capability checks in supervisor
2. Data ownership enforcement in DB layer
3. Mandatory scope in all envelopes
4. Audit events for all privileged actions
5. Idempotency keys + dedupe table

---

## Required Security Tests

1. **Capability Violation:** Component tries action not in manifest → rejected
2. **Data Ownership Violation:** Component tries writing to other's table → rejected
3. **Missing Scope:** Envelope without tenantId/guildId → rejected
4. **Missing Correlation:** Envelope without correlationId → rejected
5. **Audit Bypass:** Privileged action → audit event emitted
6. **Cross-Tenant:** Request with scope A cannot access scope B's data

---

**Reference:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
