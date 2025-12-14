import { makeProvenanceRecord } from "./data/provenance.js";
function nowUtc() {
    return new Date().toISOString();
}
export function assertAuditEvent(event) {
    if (!event || typeof event.phase !== "string" || typeof event.action !== "string") {
        throw new Error("Invalid audit event payload");
    }
    if (typeof event.timestamp !== "string") {
        throw new Error("Audit event is missing a timestamp");
    }
}
export class MemoryAuditTrail {
    provenance;
    events = [];
    constructor(provenance) {
        this.provenance = provenance;
    }
    record(event) {
        if (!event || typeof event.phase !== "string" || typeof event.action !== "string") {
            throw new Error("Cannot record audit event without phase/action");
        }
        let context = event.context ? { ...event.context } : undefined;
        if (context && "provenance" in context && context.provenance) {
            context.provenance = makeProvenanceRecord(context.provenance);
        }
        else if (this.provenance) {
            context = context ? { ...context, provenance: this.provenance } : { provenance: this.provenance };
        }
        const entry = {
            phase: event.phase,
            action: event.action,
            timestamp: event.timestamp ?? nowUtc(),
            context,
        };
        assertAuditEvent(entry);
        this.events.push(Object.freeze(entry));
    }
    flush() {
        return this.events.slice();
    }
}
