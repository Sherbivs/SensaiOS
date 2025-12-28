/**
 * Sensai Kernel - Exports Primitive Implementation
 * 
 * Provides the Export Log (Layer 2) - append-only event ingestion.
 * 
 * The Golden Invariant:
 * - Clients append exports
 * - Workers transform exports
 * - Postgres is the truth
 * - Everything else is a view
 * 
 * @module kernel/primitives/exports
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../shared/prisma.js';
import type { 
  ExportsPrimitive, 
  ExportEnvelope, 
  AppendResult, 
  ExportFilter 
} from '../types.js';
import { scopedLogger } from '../../observability/envelope/console.js';

const log = scopedLogger('kernel:exports');

/**
 * Implementation of the Exports primitive using PostgreSQL.
 * 
 * Features:
 * - Idempotent ingestion via (source, type, idempotencyKey) unique constraint
 * - Monotonic seq (BIGSERIAL) for stable ordering
 * - Worker checkpoint tracking via projection_offsets
 * - Efficient range queries for projection workers
 */
export class PostgresExportsPrimitive implements ExportsPrimitive {
  /**
   * Append a new export to the log.
   * Idempotent - returns existing export if duplicate detected.
   * 
   * @param envelope - Export data
   * @returns Promise<AppendResult> - ID and seq of the export
   */
  async append(envelope: ExportEnvelope): Promise<AppendResult> {
    const id = envelope.id ?? randomUUID();
    const schemaVersion = envelope.schemaVersion ?? 1;
    const occurredAt = envelope.occurredAt ?? new Date();

    log.debug('exports:append', 'Appending export', {
      id,
      source: envelope.source,
      type: envelope.type,
      correlationId: envelope.correlationId
    });

    try {
      // Attempt to insert the export
      const result = await prisma.export.create({
        data: {
          id,
          source: envelope.source,
          type: envelope.type,
          schemaVersion,
          idempotencyKey: envelope.idempotencyKey,
          payload: envelope.payload,
          occurredAt,
          correlationId: envelope.correlationId,
          parentCorrelationId: envelope.parentCorrelationId,
          signature: envelope.signature
        },
        select: {
          id: true,
          seq: true
        }
      });

      log.info('exports:append', 'Export appended', {
        id: result.id,
        seq: result.seq,
        source: envelope.source,
        type: envelope.type
      });

      return {
        id: result.id,
        seq: Number(result.seq)
      };
    } catch (error: any) {
      // Check for unique constraint violation (duplicate export)
      if (error.code === 'P2002' && error.meta?.target?.includes('source')) {
        log.info('exports:append', 'Duplicate export detected (idempotent)', {
          source: envelope.source,
          type: envelope.type,
          idempotencyKey: envelope.idempotencyKey
        });

        // Find the existing export
        const existing = await prisma.export.findUnique({
          where: {
            source_type_idempotencyKey: {
              source: envelope.source,
              type: envelope.type,
              idempotencyKey: envelope.idempotencyKey
            }
          },
          select: {
            id: true,
            seq: true
          }
        });

        if (!existing) {
          // Race condition - retry once
          log.warn('exports:append', 'Race condition detected, retrying', {
            source: envelope.source,
            type: envelope.type
          });
          return this.append(envelope);
        }

        return {
          id: existing.id,
          seq: Number(existing.seq)
        };
      }

      // Other error - propagate
      log.error('exports:append', 'Failed to append export', {
        error: error.message,
        source: envelope.source,
        type: envelope.type
      });
      throw error;
    }
  }

  /**
   * Query exports by filter.
   * Supports range queries via fromSeq/toSeq for efficient pagination.
   * 
   * @param filter - Query filter
   * @returns Promise<ExportEnvelope[]> - Matching exports
   */
  async query(filter: ExportFilter): Promise<ExportEnvelope[]> {
    const limit = filter.limit ?? 100;

    log.debug('exports:query', 'Querying exports', {
      types: filter.types,
      source: filter.source,
      fromSeq: filter.fromSeq,
      toSeq: filter.toSeq,
      limit
    });

    const where: any = {};

    if (filter.types && filter.types.length > 0) {
      where.type = { in: filter.types };
    }

    if (filter.source) {
      where.source = filter.source;
    }

    if (filter.fromSeq !== undefined || filter.toSeq !== undefined) {
      where.seq = {};
      if (filter.fromSeq !== undefined) {
        where.seq.gte = BigInt(filter.fromSeq);
      }
      if (filter.toSeq !== undefined) {
        where.seq.lte = BigInt(filter.toSeq);
      }
    }

    const results = await prisma.export.findMany({
      where,
      orderBy: { seq: 'asc' },
      take: limit,
      select: {
        id: true,
        seq: true,
        source: true,
        type: true,
        schemaVersion: true,
        idempotencyKey: true,
        payload: true,
        occurredAt: true,
        createdAt: true,
        correlationId: true,
        parentCorrelationId: true,
        signature: true
      }
    });

    log.info('exports:query', 'Query complete', {
      resultCount: results.length,
      fromSeq: filter.fromSeq,
      toSeq: filter.toSeq
    });

    return results.map(r => ({
      id: r.id,
      seq: Number(r.seq),
      source: r.source,
      type: r.type,
      schemaVersion: r.schemaVersion,
      idempotencyKey: r.idempotencyKey,
      payload: r.payload as Record<string, unknown>,
      occurredAt: r.occurredAt,
      correlationId: r.correlationId,
      parentCorrelationId: r.parentCorrelationId ?? undefined,
      signature: r.signature ?? undefined
    }));
  }

  /**
   * Get last processed seq for a projection.
   * Returns 0 if projection never ran.
   * 
   * @param projection - Projection name
   * @returns Promise<number> - Last processed seq
   */
  async getOffset(projection: string): Promise<number> {
    log.debug('exports:getOffset', 'Getting projection offset', { projection });

    const offset = await prisma.projectionOffset.findUnique({
      where: { projectionName: projection },
      select: { lastSeq: true }
    });

    const seq = offset ? Number(offset.lastSeq) : 0;

    log.debug('exports:getOffset', 'Offset retrieved', { projection, seq });

    return seq;
  }

  /**
   * Set last processed seq for a projection.
   * Creates or updates the projection offset.
   * 
   * @param projection - Projection name
   * @param seq - Last processed seq
   */
  async setOffset(projection: string, seq: number): Promise<void> {
    log.debug('exports:setOffset', 'Setting projection offset', { projection, seq });

    await prisma.projectionOffset.upsert({
      where: { projectionName: projection },
      create: {
        projectionName: projection,
        lastSeq: BigInt(seq),
        lastProcessed: new Date()
      },
      update: {
        lastSeq: BigInt(seq),
        lastProcessed: new Date()
      }
    });

    log.info('exports:setOffset', 'Offset updated', { projection, seq });
  }

  /**
   * Consume exports from a seq onwards.
   * Efficient single-query API for projection workers.
   * 
   * @param seq - Start from this sequence (inclusive)
   * @param types - Filter by export types
   * @param limit - Max results (default: 100)
   * @returns Promise<ExportEnvelope[]> - Exports to process
   */
  async consumeFrom(seq: number, types: string[], limit = 100): Promise<ExportEnvelope[]> {
    log.debug('exports:consumeFrom', 'Consuming exports', { seq, types, limit });

    return this.query({
      types,
      fromSeq: seq,
      limit
    });
  }
}

/**
 * Factory function to create the Exports primitive.
 * Allows for easy testing/mocking and future adapters (e.g., TimescaleDB, Kafka).
 */
export function createExportsPrimitive(): ExportsPrimitive {
  return new PostgresExportsPrimitive();
}
