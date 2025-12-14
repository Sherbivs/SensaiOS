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
import { setUserContext, clearUserContext, } from "./rls-context.js";
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
export class BaseRepository {
    prisma;
    userContext;
    constructor(prisma, userContext) {
        this.prisma = prisma;
        this.userContext = userContext;
    }
    // -------------------------------------------------------------------------
    // Context Management
    // -------------------------------------------------------------------------
    /**
     * Set RLS user context before operations
     */
    async setContext() {
        if (this.userContext) {
            await setUserContext(this.prisma, this.userContext);
        }
    }
    /**
     * Clear RLS user context after operations
     */
    async clearContext() {
        if (this.userContext) {
            await clearUserContext(this.prisma);
        }
    }
    /**
     * Execute operation with context management
     */
    async withContext(operation) {
        await this.setContext();
        try {
            return await operation();
        }
        finally {
            await this.clearContext();
        }
    }
    // -------------------------------------------------------------------------
    // Query Building Helpers
    // -------------------------------------------------------------------------
    /**
     * Convert filter conditions to Prisma where clause
     */
    buildWhereClause(filters, baseWhere) {
        const where = { ...(baseWhere || {}) };
        if (filters) {
            for (const filter of filters) {
                const key = filter.field;
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
        return where;
    }
    /**
     * Convert sort options to Prisma orderBy clause
     */
    buildOrderByClause(sort) {
        if (!sort)
            return undefined;
        if (Array.isArray(sort)) {
            return sort.map((s) => ({
                [s.field]: s.direction,
            }));
        }
        return { [sort.field]: sort.direction };
    }
    // -------------------------------------------------------------------------
    // CRUD Operations
    // -------------------------------------------------------------------------
    async findById(id) {
        return this.withContext(async () => {
            return await this.model.findUnique({ where: { id } });
        });
    }
    async findMany(options) {
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
    async findFirst(where) {
        return this.withContext(async () => {
            return await this.model.findFirst({
                where: where,
            });
        });
    }
    async create(data) {
        return this.withContext(async () => {
            return await this.model.create({ data });
        });
    }
    async update(id, data) {
        return this.withContext(async () => {
            return await this.model.update({
                where: { id },
                data,
            });
        });
    }
    async delete(id) {
        return this.withContext(async () => {
            await this.model.delete({ where: { id } });
        });
    }
    // -------------------------------------------------------------------------
    // Bulk Operations
    // -------------------------------------------------------------------------
    async createMany(data) {
        return this.withContext(async () => {
            const result = await this.model.createMany({ data });
            return result.count;
        });
    }
    async updateMany(where, data) {
        return this.withContext(async () => {
            const result = await this.model.updateMany({
                where: where,
                data,
            });
            return result.count;
        });
    }
    async deleteMany(where) {
        return this.withContext(async () => {
            const result = await this.model.deleteMany({
                where: where,
            });
            return result.count;
        });
    }
    // -------------------------------------------------------------------------
    // Pagination
    // -------------------------------------------------------------------------
    async findPaginated(options) {
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
    async count(where) {
        return this.withContext(async () => {
            return await this.model.count({
                where: where,
            });
        });
    }
    async exists(id) {
        return this.withContext(async () => {
            const result = await this.model.findUnique({ where: { id } });
            return result !== null;
        });
    }
    // -------------------------------------------------------------------------
    // Statistics
    // -------------------------------------------------------------------------
    async getStats() {
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
export class SoftDeleteRepository extends BaseRepository {
    /**
     * Override findMany to exclude soft-deleted by default
     */
    async findMany(options) {
        const filters = options?.filters || [];
        // Add soft delete filter unless explicitly including deleted
        if (!options?.includeSoftDeleted) {
            filters.push({
                field: "deletedAt",
                operator: "equals",
                value: null,
            });
        }
        return super.findMany({ ...options, filters });
    }
    /**
     * Find including soft-deleted records
     */
    async findIncludingDeleted(options) {
        return super.findMany(options);
    }
    /**
     * Soft delete - sets deletedAt timestamp
     */
    async softDelete(id) {
        return this.withContext(async () => {
            return await this.model.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        });
    }
    /**
     * Restore - clears deletedAt timestamp
     */
    async restore(id) {
        return this.withContext(async () => {
            return await this.model.update({
                where: { id },
                data: { deletedAt: null },
            });
        });
    }
    /**
     * Permanent delete - actually removes from database
     */
    async permanentDelete(id) {
        return super.delete(id);
    }
    /**
     * Override delete to use soft delete by default
     */
    async delete(id) {
        await this.softDelete(id);
    }
    /**
     * Override stats to include soft deleted count
     */
    async getStats() {
        return this.withContext(async () => {
            const [totalRecords, softDeletedRecords] = await Promise.all([
                this.model.count(),
                this.model.count({
                    where: {
                        deletedAt: { not: null },
                    },
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
    prisma;
    userContext;
    constructor(prisma, userContext) {
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
    async execute(work) {
        return await this.prisma.$transaction(async (tx) => {
            const txClient = tx;
            // Set user context if provided
            if (this.userContext) {
                await txClient.$queryRawUnsafe(`SELECT set_user_context($1, $2)`, this.userContext.discordId, this.userContext.isAdmin ?? false);
            }
            const context = {
                prisma: txClient,
                userContext: this.userContext,
            };
            return await work(context);
        });
    }
}
/**
 * Repository factory for creating repository instances with shared context
 */
export class RepositoryFactory {
    prisma;
    userContext;
    instances = new Map();
    constructor(prisma, userContext) {
        this.prisma = prisma;
        this.userContext = userContext;
    }
    /**
     * Get or create a repository instance
     */
    getRepository(Constructor, name = Constructor.name) {
        if (!this.instances.has(name)) {
            this.instances.set(name, new Constructor(this.prisma, this.userContext));
        }
        return this.instances.get(name);
    }
    /**
     * Create a new factory with user context
     */
    withUserContext(userContext) {
        return new RepositoryFactory(this.prisma, userContext);
    }
    /**
     * Create unit of work for transactions
     */
    createUnitOfWork() {
        return new UnitOfWork(this.prisma, this.userContext);
    }
}
