/**
 * Base Repository Pattern - Foundation Classes
 *
 * Provides a type-safe, generic repository pattern for database operations
 * with built-in transaction support, soft delete, and query composition.
 *
 * @module repositories/base
 * @task P1-003 Base Repository Pattern
 * @created 2025-12-04
 */

import type { PrismaClient } from "@prisma/client";
import {
  setUserContext,
  clearUserContext,
  type RlsUserContext,
} from "./rls-context.js";

// Re-export RlsUserContext for convenience
export type { RlsUserContext };

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Base entity interface that all repository entities must implement
 */
export interface BaseEntity {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Soft-deletable entity interface
 */
export interface SoftDeletable extends BaseEntity {
  deletedAt?: Date | null;
}

/**
 * Result of a paginated query
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/**
 * Sort direction
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort options for queries
 */
export interface SortOptions<T> {
  field: keyof T;
  direction: SortDirection;
}

/**
 * Filter operators for type-safe queries
 */
export type FilterOperator =
  | "equals"
  | "not"
  | "in"
  | "notIn"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "startsWith"
  | "endsWith";

/**
 * Single filter condition
 */
export interface FilterCondition<T> {
  field: keyof T;
  operator: FilterOperator;
  value: unknown;
}

/**
 * Query options combining pagination, sorting, and filtering
 */
export interface QueryOptions<T> {
  pagination?: PaginationOptions;
  sort?: SortOptions<T> | SortOptions<T>[];
  filters?: FilterCondition<T>[];
  includeSoftDeleted?: boolean;
}

/**
 * Repository statistics
 */
export interface RepositoryStats {
  totalRecords: number;
  softDeletedRecords?: number;
  lastUpdated?: Date;
}

/**
 * Transaction context for multi-repository operations
 */
export interface TransactionContext {
  prisma: PrismaClient;
  userContext?: RlsUserContext;
}

// ============================================================================
// Base Repository Interface
// ============================================================================

/**
 * Base repository interface defining common operations
 */
export interface IRepository<T extends BaseEntity, CreateDTO, UpdateDTO> {
  // Basic CRUD
  findById(id: string): Promise<T | null>;
  findMany(options?: QueryOptions<T>): Promise<T[]>;
  findFirst(where: Partial<T>): Promise<T | null>;
  create(data: CreateDTO): Promise<T>;
  update(id: string, data: UpdateDTO): Promise<T>;
  delete(id: string): Promise<void>;

  // Bulk operations
  createMany(data: CreateDTO[]): Promise<number>;
  updateMany(where: Partial<T>, data: UpdateDTO): Promise<number>;
  deleteMany(where: Partial<T>): Promise<number>;

  // Pagination
  findPaginated(options?: QueryOptions<T>): Promise<PaginatedResult<T>>;

  // Counting
  count(where?: Partial<T>): Promise<number>;

  // Existence check
  exists(id: string): Promise<boolean>;

  // Statistics
  getStats(): Promise<RepositoryStats>;
}

/**
 * Interface for repositories supporting soft delete
 */
export interface ISoftDeleteRepository<
  T extends SoftDeletable,
  CreateDTO,
  UpdateDTO
> extends IRepository<T, CreateDTO, UpdateDTO> {
  softDelete(id: string): Promise<T>;
  restore(id: string): Promise<T>;
  findIncludingDeleted(options?: QueryOptions<T>): Promise<T[]>;
  permanentDelete(id: string): Promise<void>;
}

// ============================================================================
// Abstract Base Repository
// ============================================================================

/**
 * Abstract base repository providing common implementation
 *
 * @template T - Entity type
 * @template CreateDTO - Data transfer object for creation
 * @template UpdateDTO - Data transfer object for updates
 * @template WhereInput - Prisma where input type
 * @template OrderByInput - Prisma order by input type
 */
export abstract class BaseRepository<
  T extends BaseEntity,
  CreateDTO,
  UpdateDTO,
  WhereInput = Record<string, unknown>,
  OrderByInput = Record<string, unknown>
> implements IRepository<T, CreateDTO, UpdateDTO>
{
  protected prisma: PrismaClient;
  protected userContext?: RlsUserContext;

  /**
   * The Prisma model delegate (e.g., prisma.trainer)
   */
  protected abstract get model(): {
    findUnique: (args: { where: { id: string } }) => Promise<T | null>;
    findFirst: (args: { where: WhereInput }) => Promise<T | null>;
    findMany: (args: {
      where?: WhereInput;
      orderBy?: OrderByInput | OrderByInput[];
      skip?: number;
      take?: number;
    }) => Promise<T[]>;
    create: (args: { data: CreateDTO }) => Promise<T>;
    update: (args: { where: { id: string }; data: UpdateDTO }) => Promise<T>;
    delete: (args: { where: { id: string } }) => Promise<T>;
    createMany: (args: { data: CreateDTO[] }) => Promise<{ count: number }>;
    updateMany: (args: {
      where: WhereInput;
      data: UpdateDTO;
    }) => Promise<{ count: number }>;
    deleteMany: (args: { where: WhereInput }) => Promise<{ count: number }>;
    count: (args?: { where?: WhereInput }) => Promise<number>;
  };

  /**
   * Entity name for logging
   */
  protected abstract readonly entityName: string;

  constructor(prisma: PrismaClient, userContext?: RlsUserContext) {
    this.prisma = prisma;
    this.userContext = userContext;
  }

  // -------------------------------------------------------------------------
  // Context Management
  // -------------------------------------------------------------------------

  /**
   * Set RLS user context before operations
   */
  protected async setContext(): Promise<void> {
    if (this.userContext) {
      await setUserContext(this.prisma, this.userContext);
    }
  }

  /**
   * Clear RLS user context after operations
   */
  protected async clearContext(): Promise<void> {
    if (this.userContext) {
      await clearUserContext(this.prisma);
    }
  }

  /**
   * Execute operation with context management
   */
  protected async withContext<R>(operation: () => Promise<R>): Promise<R> {
    await this.setContext();
    try {
      return await operation();
    } finally {
      await this.clearContext();
    }
  }

  // -------------------------------------------------------------------------
  // Query Building Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert filter conditions to Prisma where clause
   */
  protected buildWhereClause(
    filters?: FilterCondition<T>[],
    baseWhere?: Partial<T>
  ): WhereInput {
    const where: Record<string, unknown> = { ...(baseWhere || {}) };

    if (filters) {
      for (const filter of filters) {
        const key = filter.field as string;
        switch (filter.operator) {
          case "equals":
            where[key] = filter.value;
            break;
          case "not":
            where[key] = { not: filter.value };
            break;
          case "in":
            where[key] = { in: filter.value };
            break;
          case "notIn":
            where[key] = { notIn: filter.value };
            break;
          case "lt":
            where[key] = { lt: filter.value };
            break;
          case "lte":
            where[key] = { lte: filter.value };
            break;
          case "gt":
            where[key] = { gt: filter.value };
            break;
          case "gte":
            where[key] = { gte: filter.value };
            break;
          case "contains":
            where[key] = { contains: filter.value, mode: "insensitive" };
            break;
          case "startsWith":
            where[key] = { startsWith: filter.value, mode: "insensitive" };
            break;
          case "endsWith":
            where[key] = { endsWith: filter.value, mode: "insensitive" };
            break;
        }
      }
    }

    return where as WhereInput;
  }

  /**
   * Convert sort options to Prisma orderBy clause
   */
  protected buildOrderByClause(
    sort?: SortOptions<T> | SortOptions<T>[]
  ): OrderByInput | OrderByInput[] | undefined {
    if (!sort) return undefined;

    if (Array.isArray(sort)) {
      return sort.map((s) => ({
        [s.field as string]: s.direction,
      })) as OrderByInput[];
    }

    return { [sort.field as string]: sort.direction } as OrderByInput;
  }

  // -------------------------------------------------------------------------
  // CRUD Operations
  // -------------------------------------------------------------------------

  async findById(id: string): Promise<T | null> {
    return this.withContext(async () => {
      return await this.model.findUnique({ where: { id } });
    });
  }

  async findMany(options?: QueryOptions<T>): Promise<T[]> {
    return this.withContext(async () => {
      const where = this.buildWhereClause(options?.filters);
      const orderBy = this.buildOrderByClause(options?.sort);

      const skip = options?.pagination
        ? ((options.pagination.page || 1) - 1) *
          (options.pagination.pageSize || 20)
        : undefined;

      const take = options?.pagination?.pageSize;

      return await this.model.findMany({
        where,
        orderBy,
        skip,
        take,
      });
    });
  }

  async findFirst(where: Partial<T>): Promise<T | null> {
    return this.withContext(async () => {
      return await this.model.findFirst({
        where: where as WhereInput,
      });
    });
  }

  async create(data: CreateDTO): Promise<T> {
    return this.withContext(async () => {
      return await this.model.create({ data });
    });
  }

  async update(id: string, data: UpdateDTO): Promise<T> {
    return this.withContext(async () => {
      return await this.model.update({
        where: { id },
        data,
      });
    });
  }

  async delete(id: string): Promise<void> {
    return this.withContext(async () => {
      await this.model.delete({ where: { id } });
    });
  }

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  async createMany(data: CreateDTO[]): Promise<number> {
    return this.withContext(async () => {
      const result = await this.model.createMany({ data });
      return result.count;
    });
  }

  async updateMany(where: Partial<T>, data: UpdateDTO): Promise<number> {
    return this.withContext(async () => {
      const result = await this.model.updateMany({
        where: where as WhereInput,
        data,
      });
      return result.count;
    });
  }

  async deleteMany(where: Partial<T>): Promise<number> {
    return this.withContext(async () => {
      const result = await this.model.deleteMany({
        where: where as WhereInput,
      });
      return result.count;
    });
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  async findPaginated(options?: QueryOptions<T>): Promise<PaginatedResult<T>> {
    return this.withContext(async () => {
      const page = options?.pagination?.page || 1;
      const pageSize = options?.pagination?.pageSize || 20;

      const where = this.buildWhereClause(options?.filters);
      const orderBy = this.buildOrderByClause(options?.sort);

      const [data, total] = await Promise.all([
        this.model.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.model.count({ where }),
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Counting & Existence
  // -------------------------------------------------------------------------

  async count(where?: Partial<T>): Promise<number> {
    return this.withContext(async () => {
      return await this.model.count({
        where: where as WhereInput,
      });
    });
  }

  async exists(id: string): Promise<boolean> {
    return this.withContext(async () => {
      const result = await this.model.findUnique({ where: { id } });
      return result !== null;
    });
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async getStats(): Promise<RepositoryStats> {
    return this.withContext(async () => {
      const totalRecords = await this.model.count();
      return {
        totalRecords,
      };
    });
  }
}

// ============================================================================
// Soft Delete Repository
// ============================================================================

/**
 * Base repository with soft delete support
 *
 * Entities must have a `deletedAt` field for soft delete functionality
 */
export abstract class SoftDeleteRepository<
    T extends SoftDeletable,
    CreateDTO,
    UpdateDTO,
    WhereInput = Record<string, unknown>,
    OrderByInput = Record<string, unknown>
  >
  extends BaseRepository<T, CreateDTO, UpdateDTO, WhereInput, OrderByInput>
  implements ISoftDeleteRepository<T, CreateDTO, UpdateDTO>
{
  /**
   * Override findMany to exclude soft-deleted by default
   */
  async findMany(options?: QueryOptions<T>): Promise<T[]> {
    const filters = options?.filters || [];

    // Add soft delete filter unless explicitly including deleted
    if (!options?.includeSoftDeleted) {
      filters.push({
        field: "deletedAt" as keyof T,
        operator: "equals",
        value: null,
      });
    }

    return super.findMany({ ...options, filters });
  }

  /**
   * Find including soft-deleted records
   */
  async findIncludingDeleted(options?: QueryOptions<T>): Promise<T[]> {
    return super.findMany(options);
  }

  /**
   * Soft delete - sets deletedAt timestamp
   */
  async softDelete(id: string): Promise<T> {
    return this.withContext(async () => {
      return await this.model.update({
        where: { id },
        data: { deletedAt: new Date() } as unknown as UpdateDTO,
      });
    });
  }

  /**
   * Restore - clears deletedAt timestamp
   */
  async restore(id: string): Promise<T> {
    return this.withContext(async () => {
      return await this.model.update({
        where: { id },
        data: { deletedAt: null } as unknown as UpdateDTO,
      });
    });
  }

  /**
   * Permanent delete - actually removes from database
   */
  async permanentDelete(id: string): Promise<void> {
    return super.delete(id);
  }

  /**
   * Override delete to use soft delete by default
   */
  async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  /**
   * Override stats to include soft deleted count
   */
  async getStats(): Promise<RepositoryStats> {
    return this.withContext(async () => {
      const [totalRecords, softDeletedRecords] = await Promise.all([
        this.model.count(),
        this.model.count({
          where: {
            deletedAt: { not: null },
          } as unknown as WhereInput,
        }),
      ]);

      return {
        totalRecords,
        softDeletedRecords,
      };
    });
  }
}

// ============================================================================
// Unit of Work
// ============================================================================

/**
 * Unit of Work pattern for coordinating multi-repository transactions
 */
export class UnitOfWork {
  private prisma: PrismaClient;
  private userContext?: RlsUserContext;

  constructor(prisma: PrismaClient, userContext?: RlsUserContext) {
    this.prisma = prisma;
    this.userContext = userContext;
  }

  /**
   * Execute multiple repository operations in a single transaction
   *
   * @param work - Function containing repository operations
   * @returns The result of the work function
   *
   * @example
   * ```typescript
   * const result = await unitOfWork.execute(async (repos) => {
   *   const trainer = await repos.trainers.create({ ... });
   *   const pokemon = await repos.pokemon.create({ ... });
   *   return { trainer, pokemon };
   * });
   * ```
   */
  async execute<T>(
    work: (context: TransactionContext) => Promise<T>
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;

      // Set user context if provided
      if (this.userContext) {
        await txClient.$queryRawUnsafe(
          `SELECT set_user_context($1, $2)`,
          this.userContext.discordId,
          this.userContext.isAdmin ?? false
        );
      }

      const context: TransactionContext = {
        prisma: txClient,
        userContext: this.userContext,
      };

      return await work(context);
    });
  }
}

// ============================================================================
// Repository Factory
// ============================================================================

/**
 * Type for repository constructor
 */
export type RepositoryConstructor<R> = new (
  prisma: PrismaClient,
  userContext?: RlsUserContext
) => R;

/**
 * Repository factory for creating repository instances with shared context
 */
export class RepositoryFactory {
  private prisma: PrismaClient;
  private userContext?: RlsUserContext;
  private instances: Map<string, unknown> = new Map();

  constructor(prisma: PrismaClient, userContext?: RlsUserContext) {
    this.prisma = prisma;
    this.userContext = userContext;
  }

  /**
   * Get or create a repository instance
   */
  getRepository<R>(
    Constructor: RepositoryConstructor<R>,
    name: string = Constructor.name
  ): R {
    if (!this.instances.has(name)) {
      this.instances.set(
        name,
        new Constructor(this.prisma, this.userContext)
      );
    }
    return this.instances.get(name) as R;
  }

  /**
   * Create a new factory with user context
   */
  withUserContext(userContext: RlsUserContext): RepositoryFactory {
    return new RepositoryFactory(this.prisma, userContext);
  }

  /**
   * Create unit of work for transactions
   */
  createUnitOfWork(): UnitOfWork {
    return new UnitOfWork(this.prisma, this.userContext);
  }
}
