import { makeProvenanceRecord, type ProvenanceRecord } from "./data/provenance.js";

export type AuditEventContext = Record<string, unknown> & {
  provenance?: ProvenanceRecord | null;
};

export type AuditEvent = {
  readonly phase: string;
  readonly action: string;
  readonly timestamp: string;
  readonly context?: AuditEventContext;
};

export interface AuditTrail {
  record(event: Omit<AuditEvent, "timestamp"> & { timestamp?: string }): void;
  flush(): readonly AuditEvent[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

export function assertAuditEvent(event: AuditEvent): asserts event is AuditEvent {
  if (!event || typeof event.phase !== "string" || typeof event.action !== "string") {
    throw new Error("Invalid audit event payload");
  }
  if (typeof event.timestamp !== "string") {
    throw new Error("Audit event is missing a timestamp");
  }
}

export class MemoryAuditTrail implements AuditTrail {
  private events: AuditEvent[] = [];

  constructor(private readonly provenance?: ProvenanceRecord) {}

  record(event: Omit<AuditEvent, "timestamp"> & { timestamp?: string }): void {
    if (!event || typeof event.phase !== "string" || typeof event.action !== "string") {
      throw new Error("Cannot record audit event without phase/action");
    }

    let context = event.context ? { ...event.context } : undefined;
    if (context && "provenance" in context && context.provenance) {
      context.provenance = makeProvenanceRecord(context.provenance);
    } else if (this.provenance) {
      context = context ? { ...context, provenance: this.provenance } : { provenance: this.provenance };
    }

    const entry: AuditEvent = {
      phase: event.phase,
      action: event.action,
      timestamp: event.timestamp ?? nowUtc(),
      context,
    };
    assertAuditEvent(entry);
    this.events.push(Object.freeze(entry));
  }

  flush(): readonly AuditEvent[] {
    return this.events.slice();
  }
}
