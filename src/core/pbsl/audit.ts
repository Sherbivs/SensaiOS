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

export type AuditTrailMetrics = {
  current: number;
  max: number;
  utilization: number;
};

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

  constructor(
    private readonly provenance?: ProvenanceRecord,
    private readonly maxEvents: number = 10000
  ) {}

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
    if (this.maxEvents > 0 && this.events.length >= this.maxEvents) {
      this.events.shift();
    }

    this.events.push(Object.freeze(entry));
  }

  flush(): readonly AuditEvent[] {
    const snapshot = this.events.slice();
    this.events.length = 0;
    return snapshot;
  }

  getMetrics(): AuditTrailMetrics {
    return {
      current: this.events.length,
      max: this.maxEvents,
      utilization: this.maxEvents > 0 ? (this.events.length / this.maxEvents) * 100 : 0,
    };
  }
}
