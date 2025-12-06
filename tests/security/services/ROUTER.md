# ROUTER
Title: Security Services Unit Tests
Purpose: Comprehensive test coverage for security database services
Owned Globs: tests/security/services/**
Last Updated (UTC): 2025-06-15T02:45:00Z

## Notes

- Tests use Vitest with mocked PrismaClient
- All services test bigint ID handling (not string)
- Pattern: Create mock fixtures → Test CRUD → Test specialized queries → Test edge cases
- Tests validate correct Prisma method calls and return value mapping

## Recent Changes (2025-06-15)

- **T9 (Security Regression Suite):** Created comprehensive unit tests for all 4 security services
- security-event-service.test.ts: ~450 lines covering event CRUD, integrity verification, hash chain
- role-audit-service.test.ts: ~595 lines covering audit CRUD, history queries, anomaly detection
- threat-detection-service.test.ts: ~650 lines covering threat CRUD, resolution, MITRE mapping
- baseline-service.test.ts: ~520 lines covering baseline CRUD, health checks, bulk operations

## Test Files

### security-event-service.test.ts (~450 lines)
Covers SecurityEventService:
- **CRUD:** recordEvent, recordEventsBatch, getEvent, queryEvents, countEvents
- **Integrity:** verifyEventIntegrity (boolean), verifyHashChain, batchVerifyIntegrity
- **Statistics:** getStats with parallel count/groupBy queries
- **Type Mapping:** Prisma result → SecurityEvent conversion

### role-audit-service.test.ts (~595 lines)
Covers RoleAuditService:
- **CRUD:** recordRoleChange, recordRoleChangesBatch, getAudit, queryAudits
- **History Queries:** getMemberRoleHistory, getRoleChangeHistory, getExecutorHistory
- **Anomaly Detection:** detectAnomaly with rapid change detection
- **Integrity:** verifyAuditIntegrity (boolean)
- **Statistics:** getStats

### threat-detection-service.test.ts (~650 lines)
Covers ThreatDetectionService:
- **CRUD:** recordThreat, recordThreatsBatch, getThreat, queryThreats, countThreats
- **Resolution:** resolveThreat, markAutoMitigated, markFalsePositive
- **Specialized Queries:** getUnresolvedThreats, getCriticalThreats, getThreatsByMitreTechnique, getRecentThreats
- **MITRE Mapping:** MITRE_ATTACK_MAPPING validation for all ThreatType values
- **Statistics:** getStats with parallel queries

### baseline-service.test.ts (~520 lines)
Covers BaselineService:
- **CRUD:** getBaseline, upsertBaseline, deleteBaseline, getAllBaselines, countBaselines
- **Health:** checkBaselineHealth, needsRefresh, getUsableBaseline
- **Stale/Low Confidence:** getStaleBaselines, getLowConfidenceBaselines
- **Bulk Operations:** bulkHealthCheck, getGuildsNeedingRefresh
- **Custom Config:** Tests with custom BaselineFreshnessConfig

## Test Patterns

### Mock Setup
```typescript
const mockPrismaClient = {
  modelName: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../../../src/generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(() => mockPrismaClient),
}));
```

### Fixture Creation
```typescript
function createMockPrismaResult(overrides = {}): Record<string, unknown> {
  return {
    id: 1n,  // bigint, not string
    // ... default values
    ...overrides,
  };
}
```

### Bigint ID Testing
All services use bigint IDs. Tests verify:
- findUnique called with `{ where: { id: 42n } }`
- Create returns correct bigint ID
- Query filters work with bigint values

## Dependencies

- vitest: Test framework
- @prisma/client: Type definitions (mocked)
- Services under test: src/bot/security/services/
- Type definitions: src/bot/security/types/database-models.ts

## Running Tests

```bash
# Run all security service tests
npm test -- tests/security/services/

# Run specific test file
npm test -- tests/security/services/security-event-service.test.ts

# Run with coverage
npm test -- --coverage tests/security/services/
```

## Cross-References

- **Services:** src/bot/security/services/ROUTER.md
- **Types:** src/bot/security/types/database-models.ts
- **Parent Tests:** tests/security/ROUTER.md
- **Project:** docs/projects/security-db-transformation/SPRINT-TRACKER.md
