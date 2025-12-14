/**
 * Database Model Types
 *
 * Auto-generated from prisma/schema.prisma
 * DO NOT EDIT MANUALLY
 *
 * Run: npm run generate:types
 */
// ============================================================================
// Enums
// ============================================================================
export var BusKind;
(function (BusKind) {
    BusKind["event"] = "event";
    BusKind["command"] = "command";
})(BusKind || (BusKind = {}));
export var BusStatus;
(function (BusStatus) {
    BusStatus["pending"] = "pending";
    BusStatus["processing"] = "processing";
    BusStatus["done"] = "done";
    BusStatus["error"] = "error";
})(BusStatus || (BusStatus = {}));
export var BusPriority;
(function (BusPriority) {
    BusPriority["high"] = "high";
    BusPriority["normal"] = "normal";
    BusPriority["low"] = "low";
})(BusPriority || (BusPriority = {}));
// ============================================================================
// Common Pick Types (Partial Selects)
// ============================================================================
