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
    maxEvents;
    events = [];
    constructor(provenance, maxEvents = 10000) {
        this.provenance = provenance;
        this.maxEvents = maxEvents;
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
        if (this.maxEvents > 0 && this.events.length >= this.maxEvents) {
            this.events.shift();
        }
        this.events.push(Object.freeze(entry));
    }
    flush() {
        const snapshot = this.events.slice();
        this.events.length = 0;
        return snapshot;
    }
    getMetrics() {
        return {
            current: this.events.length,
            max: this.maxEvents,
            utilization: this.maxEvents > 0 ? (this.events.length / this.maxEvents) * 100 : 0,
        };
    }
}
