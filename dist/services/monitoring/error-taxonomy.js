/**
 * Comprehensive Error Taxonomy
 * Purpose: OS-level, system-wide error classification for complete coverage
 *
 * DESIGN PRINCIPLE: "No Silent Errors" — Every possible error source is categorized,
 * detected, and routed to the error database and alerting system.
 *
 * This taxonomy covers:
 * - Node.js native errors (ERR_*, ErrnoException)
 * - OS-level errors (ENOENT, EACCES, ECONNREFUSED, ETIMEDOUT, ENOMEM)
 * - Network/Protocol errors (DNS, SSL/TLS, HTTP, WebSocket)
 * - Database errors (PostgreSQL, Prisma, connection pool)
 * - Discord API errors (REST, Gateway, rate limits)
 * - Application errors (validation, business logic, engine)
 * - Worker/Process errors (child process, worker threads)
 *
 * @module services/monitoring/error-taxonomy
 */
// ============================================================================
// OS ERROR CODES — Node.js/POSIX errno mappings
// ============================================================================
/**
 * Common OS error codes with categories and severities
 */
export const OS_ERROR_CODES = {
    // File System Errors
    'ENOENT': { category: 'OS_FILESYSTEM', severity: 'MEDIUM', description: 'No such file or directory' },
    'EACCES': { category: 'OS_PERMISSION', severity: 'HIGH', description: 'Permission denied' },
    'EEXIST': { category: 'OS_FILESYSTEM', severity: 'LOW', description: 'File already exists' },
    'ENOTDIR': { category: 'OS_FILESYSTEM', severity: 'MEDIUM', description: 'Not a directory' },
    'EISDIR': { category: 'OS_FILESYSTEM', severity: 'MEDIUM', description: 'Is a directory' },
    'EMFILE': { category: 'OS_RESOURCE', severity: 'CRITICAL', description: 'Too many open files (process limit)' },
    'ENFILE': { category: 'OS_RESOURCE', severity: 'CRITICAL', description: 'Too many open files (system limit)' },
    'ENOSPC': { category: 'OS_FILESYSTEM', severity: 'CRITICAL', description: 'No space left on device' },
    'EROFS': { category: 'OS_FILESYSTEM', severity: 'HIGH', description: 'Read-only file system' },
    'ENOTEMPTY': { category: 'OS_FILESYSTEM', severity: 'LOW', description: 'Directory not empty' },
    'EBUSY': { category: 'OS_FILESYSTEM', severity: 'MEDIUM', description: 'Device or resource busy' },
    // Network Errors
    'ECONNREFUSED': { category: 'NETWORK_TCP', severity: 'HIGH', description: 'Connection refused' },
    'ECONNRESET': { category: 'NETWORK_TCP', severity: 'MEDIUM', description: 'Connection reset by peer' },
    'EPIPE': { category: 'NETWORK_TCP', severity: 'MEDIUM', description: 'Broken pipe' },
    'ETIMEDOUT': { category: 'NETWORK_TIMEOUT', severity: 'MEDIUM', description: 'Connection timed out' },
    'ENOTFOUND': { category: 'NETWORK_DNS', severity: 'HIGH', description: 'DNS lookup failed' },
    'EHOSTUNREACH': { category: 'NETWORK_TCP', severity: 'HIGH', description: 'Host unreachable' },
    'ENETUNREACH': { category: 'NETWORK_TCP', severity: 'HIGH', description: 'Network unreachable' },
    'EADDRINUSE': { category: 'OS_RESOURCE', severity: 'HIGH', description: 'Address already in use' },
    'EADDRNOTAVAIL': { category: 'NETWORK_TCP', severity: 'HIGH', description: 'Address not available' },
    // DNS Errors (EAI_ prefix)
    'EAI_AGAIN': { category: 'NETWORK_DNS', severity: 'MEDIUM', description: 'DNS temporary failure' },
    'EAI_NODATA': { category: 'NETWORK_DNS', severity: 'MEDIUM', description: 'DNS no data' },
    'EAI_NONAME': { category: 'NETWORK_DNS', severity: 'HIGH', description: 'DNS hostname not found' },
    // Memory Errors
    'ENOMEM': { category: 'OS_MEMORY', severity: 'CRITICAL', description: 'Out of memory' },
    // Process Errors
    'ECHILD': { category: 'WORKER_CHILD', severity: 'MEDIUM', description: 'No child process' },
    'ESRCH': { category: 'OS_PROCESS', severity: 'MEDIUM', description: 'No such process' },
    'EPERM': { category: 'OS_PERMISSION', severity: 'HIGH', description: 'Operation not permitted' },
};
// ============================================================================
// PRISMA ERROR CODES — Database-specific mappings
// ============================================================================
/**
 * Prisma error codes with categories and severities
 * Reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR_CODES = {
    // P1xxx: Common errors (connection, authentication)
    'P1000': { category: 'DATABASE_CONNECTION', severity: 'CRITICAL', description: 'Authentication failed' },
    'P1001': { category: 'DATABASE_CONNECTION', severity: 'CRITICAL', description: 'Cannot reach database server' },
    'P1002': { category: 'DATABASE_CONNECTION', severity: 'CRITICAL', description: 'Connection timed out' },
    'P1003': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Database does not exist' },
    'P1008': { category: 'DATABASE_QUERY', severity: 'HIGH', description: 'Operations timed out' },
    'P1009': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Database already exists' },
    'P1010': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'User was denied access' },
    'P1011': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Error opening TLS connection' },
    'P1012': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Schema parsing failed' },
    'P1013': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Invalid database string' },
    'P1014': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Model does not exist' },
    'P1015': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Schema version mismatch' },
    'P1016': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Raw query parameters incorrect' },
    'P1017': { category: 'DATABASE_CONNECTION', severity: 'CRITICAL', description: 'Server closed connection' },
    // P2xxx: Query errors
    'P2000': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Value too long for column' },
    'P2001': { category: 'DATABASE_QUERY', severity: 'LOW', description: 'Record not found' },
    'P2002': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Unique constraint violation' },
    'P2003': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Foreign key constraint violation' },
    'P2004': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Constraint failed' },
    'P2005': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Invalid value for field type' },
    'P2006': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Invalid value' },
    'P2007': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Data validation error' },
    'P2008': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Query parsing failed' },
    'P2009': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Query validation failed' },
    'P2010': { category: 'DATABASE_QUERY', severity: 'HIGH', description: 'Raw query failed' },
    'P2011': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Null constraint violation' },
    'P2012': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Missing required value' },
    'P2013': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Missing required argument' },
    'P2014': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Relation violation' },
    'P2015': { category: 'DATABASE_QUERY', severity: 'LOW', description: 'Related record not found' },
    'P2016': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Query interpretation error' },
    'P2017': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Records not connected' },
    'P2018': { category: 'DATABASE_QUERY', severity: 'LOW', description: 'Required records not found' },
    'P2019': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Input error' },
    'P2020': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Value out of range' },
    'P2021': { category: 'DATABASE_QUERY', severity: 'HIGH', description: 'Table does not exist' },
    'P2022': { category: 'DATABASE_QUERY', severity: 'HIGH', description: 'Column does not exist' },
    'P2023': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Inconsistent column data' },
    'P2024': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Connection pool timeout' },
    'P2025': { category: 'DATABASE_QUERY', severity: 'LOW', description: 'Record not found for operation' },
    'P2026': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Unsupported feature' },
    'P2027': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Multiple errors' },
    'P2028': { category: 'DATABASE_TRANSACTION', severity: 'HIGH', description: 'Transaction API error' },
    'P2030': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Fulltext index not found' },
    'P2031': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'MongoDB replica set required' },
    'P2033': { category: 'DATABASE_QUERY', severity: 'MEDIUM', description: 'Number out of BigInt range' },
    'P2034': { category: 'DATABASE_TRANSACTION', severity: 'HIGH', description: 'Transaction conflict, write conflict' },
    // P3xxx: Migration errors
    'P3000': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Failed to create database' },
    'P3001': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration destructive change' },
    'P3002': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Migration rolled back' },
    'P3003': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration format changed' },
    'P3004': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'System database altered' },
    'P3005': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Schema not empty' },
    'P3006': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration failed to apply' },
    'P3007': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Preview feature not allowed' },
    'P3008': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration already applied' },
    'P3009': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration not found in directory' },
    'P3010': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration name too long' },
    'P3011': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration cannot be rolled back' },
    'P3012': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration not in failed state' },
    'P3013': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Datasource providers mismatch' },
    'P3014': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Shadow database creation failed' },
    'P3015': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration file not found' },
    'P3016': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Fallback method not found' },
    'P3017': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration not found' },
    'P3018': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Migration failed to apply cleanly' },
    'P3019': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Datasource provider mismatch' },
    'P3020': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Shadow database detection failed' },
    'P3021': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Foreign keys not supported' },
    'P3022': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Direct DDL not allowed' },
    // P4xxx: Introspection errors
    'P4000': { category: 'DATABASE_MIGRATION', severity: 'HIGH', description: 'Introspection failed' },
    'P4001': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Introspected database empty' },
    'P4002': { category: 'DATABASE_MIGRATION', severity: 'MEDIUM', description: 'Inconsistent schema' },
    // P5xxx: Client errors (Data Proxy)
    'P5000': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Server error' },
    'P5001': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Request timed out' },
    'P5002': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Invalid response' },
    'P5003': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Requested resource not found' },
    'P5004': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Feature not implemented' },
    'P5005': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Schema mismatch' },
    'P5006': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Unsupported engine version' },
    'P5007': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Unauthorized' },
    'P5008': { category: 'DATABASE_CONNECTION', severity: 'MEDIUM', description: 'Usage exceeded' },
    'P5009': { category: 'DATABASE_CONNECTION', severity: 'MEDIUM', description: 'Request timed out in queue' },
    'P5010': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Fetch failed' },
    'P5011': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Request body too large' },
    'P5012': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Engine version not supported' },
    'P5013': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Engine not started' },
    'P5014': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Unknown engine startup error' },
    'P5015': { category: 'DATABASE_CONNECTION', severity: 'HIGH', description: 'Interactive transaction error' },
};
// ============================================================================
// DISCORD ERROR CODES — API error mappings
// ============================================================================
/**
 * Discord API error codes with categories and severities
 * Reference: https://discord.com/developers/docs/topics/opcodes-and-status-codes
 */
export const DISCORD_ERROR_CODES = {
    // HTTP Status Codes
    400: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Bad Request' },
    401: { category: 'DISCORD_REST', severity: 'CRITICAL', description: 'Unauthorized' },
    403: { category: 'DISCORD_PERMISSION', severity: 'HIGH', description: 'Forbidden' },
    404: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Not Found' },
    405: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Method Not Allowed' },
    429: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Rate Limited' },
    500: { category: 'DISCORD_REST', severity: 'HIGH', description: 'Internal Server Error' },
    502: { category: 'DISCORD_REST', severity: 'HIGH', description: 'Bad Gateway' },
    503: { category: 'DISCORD_REST', severity: 'HIGH', description: 'Service Unavailable' },
    504: { category: 'DISCORD_REST', severity: 'HIGH', description: 'Gateway Timeout' },
    // Discord API Error Codes
    10001: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown account' },
    10002: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown application' },
    10003: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown channel' },
    10004: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown guild' },
    10005: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown integration' },
    10006: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown invite' },
    10007: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown member' },
    10008: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown message' },
    10009: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown permission overwrite' },
    10010: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown provider' },
    10011: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown role' },
    10012: { category: 'DISCORD_REST', severity: 'CRITICAL', description: 'Unknown token' },
    10013: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown user' },
    10014: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown emoji' },
    10015: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown webhook' },
    10057: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Unknown interaction' },
    20001: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Bots cannot use this endpoint' },
    20002: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Only bots can use this endpoint' },
    30001: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum guilds reached' },
    30002: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum friends reached' },
    30003: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum pins reached' },
    30005: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum roles reached' },
    30007: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum webhooks reached' },
    30010: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum reactions reached' },
    30013: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum channels reached' },
    30016: { category: 'DISCORD_RATELIMIT', severity: 'MEDIUM', description: 'Maximum invites reached' },
    40001: { category: 'DISCORD_REST', severity: 'HIGH', description: 'Unauthorized' },
    40002: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'You need to verify your account' },
    40005: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Request entity too large' },
    40006: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Feature temporarily disabled' },
    40007: { category: 'DISCORD_REST', severity: 'HIGH', description: 'User banned from guild' },
    40060: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Interaction already acknowledged' },
    50001: { category: 'DISCORD_PERMISSION', severity: 'HIGH', description: 'Missing access' },
    50002: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid account type' },
    50003: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot execute on DM channel' },
    50004: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Guild widget disabled' },
    50005: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot edit message by another user' },
    50006: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot send empty message' },
    50007: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot send messages to user' },
    50008: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot send messages in voice channel' },
    50009: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Channel verification level too high' },
    50010: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'OAuth2 app does not have bot' },
    50011: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'OAuth2 app limit reached' },
    50012: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid OAuth2 state' },
    50013: { category: 'DISCORD_PERMISSION', severity: 'HIGH', description: 'Missing permissions' },
    50014: { category: 'DISCORD_REST', severity: 'CRITICAL', description: 'Invalid authentication token' },
    50015: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Note was too long' },
    50016: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid number of messages to delete' },
    50019: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot pin message in other channel' },
    50020: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invite code invalid or taken' },
    50021: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Cannot execute on system message' },
    50025: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid OAuth2 access token' },
    50027: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid webhook token' },
    50033: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid recipients' },
    50034: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Message too old to bulk delete' },
    50035: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid form body' },
    50036: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invite accepted but not found' },
    50055: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid guild' },
    50068: { category: 'DISCORD_REST', severity: 'MEDIUM', description: 'Invalid message type' },
    // Gateway Close Codes
    4000: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Unknown error' },
    4001: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Unknown opcode' },
    4002: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Decode error' },
    4003: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Not authenticated' },
    4004: { category: 'DISCORD_GATEWAY', severity: 'CRITICAL', description: 'Authentication failed' },
    4005: { category: 'DISCORD_GATEWAY', severity: 'MEDIUM', description: 'Already authenticated' },
    4007: { category: 'DISCORD_GATEWAY', severity: 'MEDIUM', description: 'Invalid sequence' },
    4008: { category: 'DISCORD_RATELIMIT', severity: 'HIGH', description: 'Rate limited' },
    4009: { category: 'DISCORD_GATEWAY', severity: 'MEDIUM', description: 'Session timed out' },
    4010: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Invalid shard' },
    4011: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Sharding required' },
    4012: { category: 'DISCORD_GATEWAY', severity: 'HIGH', description: 'Invalid API version' },
    4013: { category: 'DISCORD_INTENT', severity: 'HIGH', description: 'Invalid intent(s)' },
    4014: { category: 'DISCORD_INTENT', severity: 'CRITICAL', description: 'Disallowed intent(s)' },
};
// ============================================================================
// NODE.JS ERROR CODES — Native Node.js error mappings
// ============================================================================
/**
 * Node.js ERR_* error codes with categories and severities
 */
export const NODEJS_ERROR_CODES = {
    // HTTP Errors
    'ERR_HTTP_HEADERS_SENT': { category: 'NETWORK_HTTP', severity: 'MEDIUM', description: 'Headers already sent' },
    'ERR_HTTP_INVALID_HEADER_VALUE': { category: 'NETWORK_HTTP', severity: 'LOW', description: 'Invalid header value' },
    'ERR_HTTP_INVALID_STATUS_CODE': { category: 'NETWORK_HTTP', severity: 'LOW', description: 'Invalid status code' },
    'ERR_HTTP_TRAILER_INVALID': { category: 'NETWORK_HTTP', severity: 'LOW', description: 'Invalid trailer' },
    // Network Errors
    'ERR_SOCKET_BAD_PORT': { category: 'NETWORK_TCP', severity: 'MEDIUM', description: 'Invalid port' },
    'ERR_SOCKET_CLOSED': { category: 'NETWORK_TCP', severity: 'MEDIUM', description: 'Socket closed' },
    // TLS/SSL Errors
    'ERR_TLS_CERT_ALTNAME_INVALID': { category: 'NETWORK_SSL', severity: 'HIGH', description: 'Certificate altname invalid' },
    'ERR_TLS_DH_PARAM_SIZE': { category: 'NETWORK_SSL', severity: 'HIGH', description: 'DH param size error' },
    'ERR_TLS_HANDSHAKE_TIMEOUT': { category: 'NETWORK_SSL', severity: 'MEDIUM', description: 'TLS handshake timeout' },
    'ERR_TLS_INVALID_PROTOCOL_VERSION': { category: 'NETWORK_SSL', severity: 'HIGH', description: 'Invalid TLS protocol' },
    'ERR_TLS_PROTOCOL_VERSION_CONFLICT': { category: 'NETWORK_SSL', severity: 'HIGH', description: 'TLS version conflict' },
    'ERR_TLS_RENEGOTIATION_DISABLED': { category: 'NETWORK_SSL', severity: 'MEDIUM', description: 'TLS renegotiation disabled' },
    'ERR_TLS_REQUIRED_SERVER_NAME': { category: 'NETWORK_SSL', severity: 'MEDIUM', description: 'TLS server name required' },
    'ERR_TLS_SESSION_ATTACK': { category: 'NETWORK_SSL', severity: 'CRITICAL', description: 'TLS session attack' },
    // Stream Errors
    'ERR_STREAM_DESTROYED': { category: 'STREAM_READ', severity: 'MEDIUM', description: 'Stream destroyed' },
    'ERR_STREAM_NULL_VALUES': { category: 'STREAM_WRITE', severity: 'LOW', description: 'Null values in stream' },
    'ERR_STREAM_PREMATURE_CLOSE': { category: 'STREAM_READ', severity: 'MEDIUM', description: 'Stream premature close' },
    'ERR_STREAM_PUSH_AFTER_EOF': { category: 'STREAM_READ', severity: 'MEDIUM', description: 'Push after EOF' },
    'ERR_STREAM_UNSHIFT_AFTER_END_EVENT': { category: 'STREAM_READ', severity: 'MEDIUM', description: 'Unshift after end' },
    'ERR_STREAM_WRITE_AFTER_END': { category: 'STREAM_WRITE', severity: 'MEDIUM', description: 'Write after end' },
    // Module/Import Errors
    'ERR_MODULE_NOT_FOUND': { category: 'APP_CONFIG', severity: 'HIGH', description: 'Module not found' },
    'ERR_PACKAGE_PATH_NOT_EXPORTED': { category: 'APP_CONFIG', severity: 'HIGH', description: 'Package path not exported' },
    'ERR_REQUIRE_ESM': { category: 'APP_CONFIG', severity: 'HIGH', description: 'Cannot require ESM module' },
    // Assertion Errors
    'ERR_ASSERTION': { category: 'APP_VALIDATION', severity: 'HIGH', description: 'Assertion failed' },
    // Async Errors
    'ERR_ASYNC_CALLBACK': { category: 'APP_STATE', severity: 'HIGH', description: 'Async callback error' },
    'ERR_ASYNC_TYPE': { category: 'APP_VALIDATION', severity: 'MEDIUM', description: 'Invalid async type' },
    // Buffer Errors
    'ERR_BUFFER_OUT_OF_BOUNDS': { category: 'OS_MEMORY', severity: 'HIGH', description: 'Buffer out of bounds' },
    'ERR_BUFFER_TOO_LARGE': { category: 'OS_MEMORY', severity: 'HIGH', description: 'Buffer too large' },
    // Child Process Errors
    'ERR_CHILD_PROCESS_STDIO_MAXBUFFER': { category: 'WORKER_CHILD', severity: 'MEDIUM', description: 'Stdio maxBuffer exceeded' },
    'ERR_CHILD_PROCESS_IPC_REQUIRED': { category: 'WORKER_CHILD', severity: 'MEDIUM', description: 'IPC required' },
    // DNS Errors
    'ERR_DNS_SET_SERVERS_FAILED': { category: 'NETWORK_DNS', severity: 'HIGH', description: 'DNS set servers failed' },
    // FS Errors
    'ERR_FS_FILE_TOO_LARGE': { category: 'OS_FILESYSTEM', severity: 'HIGH', description: 'File too large' },
    'ERR_FS_INVALID_SYMLINK_TYPE': { category: 'OS_FILESYSTEM', severity: 'MEDIUM', description: 'Invalid symlink type' },
    // Unhandled Error Types
    'ERR_UNHANDLED_ERROR': { category: 'EMITTER_LISTENER', severity: 'HIGH', description: 'Unhandled error event' },
    'ERR_UNESCAPED_CHARACTERS': { category: 'APP_VALIDATION', severity: 'LOW', description: 'Unescaped characters' },
};
// ============================================================================
// ERROR CLASSIFICATION HELPERS
// ============================================================================
/**
 * Classify an error code to get category and severity
 */
export function classifyErrorCode(code) {
    if (code === undefined || code === null)
        return null;
    const codeStr = String(code);
    // Check OS error codes
    if (OS_ERROR_CODES[codeStr]) {
        return OS_ERROR_CODES[codeStr];
    }
    // Check Prisma error codes (P followed by 4 digits)
    if (/^P\d{4}$/.test(codeStr) && PRISMA_ERROR_CODES[codeStr]) {
        return PRISMA_ERROR_CODES[codeStr];
    }
    // Check Node.js ERR_* codes
    if (codeStr.startsWith('ERR_') && NODEJS_ERROR_CODES[codeStr]) {
        return NODEJS_ERROR_CODES[codeStr];
    }
    // Check Discord error codes (numeric)
    const numCode = Number(code);
    if (!isNaN(numCode) && DISCORD_ERROR_CODES[numCode]) {
        return DISCORD_ERROR_CODES[numCode];
    }
    return null;
}
/**
 * Get category from error object with intelligent detection
 */
export function detectErrorCategory(error) {
    // Check for error code first
    const errWithCode = error;
    if (errWithCode.code) {
        const classified = classifyErrorCode(errWithCode.code);
        if (classified)
            return classified.category;
    }
    // Check for Prisma errors
    if (errWithCode.code && /^P\d{4}$/.test(errWithCode.code)) {
        const classified = classifyErrorCode(errWithCode.code);
        if (classified)
            return classified.category;
    }
    // Check error name
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    // Prisma detection
    if (name.includes('prisma')) {
        if (message.includes('connect') || message.includes('pool'))
            return 'DATABASE_CONNECTION';
        if (message.includes('transaction'))
            return 'DATABASE_TRANSACTION';
        if (message.includes('migration'))
            return 'DATABASE_MIGRATION';
        return 'DATABASE_QUERY';
    }
    // Discord detection
    if (name.includes('discord') || name.includes('discordapi')) {
        if (message.includes('rate') || message.includes('429'))
            return 'DISCORD_RATELIMIT';
        if (message.includes('permission') || message.includes('missing'))
            return 'DISCORD_PERMISSION';
        if (message.includes('gateway') || message.includes('websocket'))
            return 'DISCORD_GATEWAY';
        if (message.includes('intent'))
            return 'DISCORD_INTENT';
        return 'DISCORD_REST';
    }
    // Network detection
    if (message.includes('econnrefused') || message.includes('econnreset'))
        return 'NETWORK_TCP';
    if (message.includes('timeout'))
        return 'NETWORK_TIMEOUT';
    if (message.includes('dns') || message.includes('enotfound'))
        return 'NETWORK_DNS';
    if (message.includes('ssl') || message.includes('tls') || message.includes('certificate'))
        return 'NETWORK_SSL';
    if (message.includes('http'))
        return 'NETWORK_HTTP';
    if (message.includes('websocket'))
        return 'NETWORK_WEBSOCKET';
    // File system detection
    if (message.includes('enoent') || message.includes('eacces') || message.includes('no such file'))
        return 'OS_FILESYSTEM';
    if (message.includes('permission denied'))
        return 'OS_PERMISSION';
    if (message.includes('no space'))
        return 'OS_FILESYSTEM';
    // Memory detection
    if (message.includes('out of memory') || message.includes('heap') || message.includes('enomem'))
        return 'OS_MEMORY';
    // Worker detection
    if (message.includes('worker') || message.includes('child process'))
        return 'WORKER_EXECUTION';
    // Stream detection
    if (message.includes('stream'))
        return 'STREAM_READ';
    // Validation detection
    if (message.includes('validation') || message.includes('invalid'))
        return 'APP_VALIDATION';
    // Config detection
    if (message.includes('config') || message.includes('environment'))
        return 'APP_CONFIG';
    return 'UNKNOWN';
}
/**
 * Get severity from error object with intelligent detection
 */
export function detectErrorSeverity(error, category) {
    // Check for error code first
    const errWithCode = error;
    if (errWithCode.code) {
        const classified = classifyErrorCode(errWithCode.code);
        if (classified)
            return classified.severity;
    }
    // Category-based defaults
    if (category) {
        // CRITICAL categories
        if ([
            'OS_MEMORY', 'DATABASE_CONNECTION', 'DISCORD_INTENT',
        ].includes(category)) {
            return 'CRITICAL';
        }
        // HIGH categories
        if ([
            'OS_FILESYSTEM', 'OS_PERMISSION', 'OS_RESOURCE',
            'NETWORK_DNS', 'NETWORK_SSL', 'DATABASE_MIGRATION',
            'DATABASE_TRANSACTION', 'DISCORD_PERMISSION', 'DISCORD_GATEWAY',
            'WORKER_LIFECYCLE', 'APP_AUTH',
        ].includes(category)) {
            return 'HIGH';
        }
        // MEDIUM categories
        if ([
            'NETWORK_TCP', 'NETWORK_TIMEOUT', 'NETWORK_HTTP',
            'DATABASE_QUERY', 'DISCORD_REST', 'DISCORD_RATELIMIT',
            'WORKER_EXECUTION', 'WORKER_TIMEOUT', 'APP_STATE',
            'STREAM_READ', 'STREAM_WRITE', 'EMITTER_LISTENER',
        ].includes(category)) {
            return 'MEDIUM';
        }
        // LOW categories
        if ([
            'APP_VALIDATION', 'APP_BUSINESS',
        ].includes(category)) {
            return 'LOW';
        }
    }
    // Message-based detection
    const message = error.message.toLowerCase();
    if (message.includes('critical') || message.includes('fatal'))
        return 'CRITICAL';
    if (message.includes('crash') || message.includes('out of memory'))
        return 'CRITICAL';
    if (message.includes('authentication failed') || message.includes('token invalid'))
        return 'CRITICAL';
    return 'MEDIUM'; // Default to MEDIUM for unknown
}
/**
 * Full metadata for all error categories
 */
const ERROR_CATEGORY_METADATA = {
    // OS Layer
    'OS_PROCESS': { layer: 'OS', description: 'Process signals, exit codes, crashes', defaultSeverity: 'CRITICAL', examples: ['SIGTERM', 'SIGKILL', 'exit code 1'] },
    'OS_MEMORY': { layer: 'OS', description: 'Memory errors (OOM, heap exceeded, GC pressure)', defaultSeverity: 'CRITICAL', examples: ['ENOMEM', 'heap out of memory'] },
    'OS_FILESYSTEM': { layer: 'OS', description: 'File I/O errors', defaultSeverity: 'HIGH', examples: ['ENOENT', 'EACCES', 'ENOSPC'] },
    'OS_PERMISSION': { layer: 'OS', description: 'Permission denied errors', defaultSeverity: 'HIGH', examples: ['EPERM', 'EACCES'] },
    'OS_RESOURCE': { layer: 'OS', description: 'Resource exhaustion errors', defaultSeverity: 'CRITICAL', examples: ['EMFILE', 'ENFILE', 'EADDRINUSE'] },
    // Network Layer
    'NETWORK_DNS': { layer: 'NETWORK', description: 'DNS resolution errors', defaultSeverity: 'HIGH', examples: ['ENOTFOUND', 'EAI_AGAIN'] },
    'NETWORK_TCP': { layer: 'NETWORK', description: 'TCP connection errors', defaultSeverity: 'MEDIUM', examples: ['ECONNREFUSED', 'ECONNRESET'] },
    'NETWORK_TIMEOUT': { layer: 'NETWORK', description: 'Timeout errors', defaultSeverity: 'MEDIUM', examples: ['ETIMEDOUT', 'connect timeout'] },
    'NETWORK_SSL': { layer: 'NETWORK', description: 'SSL/TLS errors', defaultSeverity: 'HIGH', examples: ['certificate error', 'handshake failed'] },
    'NETWORK_HTTP': { layer: 'NETWORK', description: 'HTTP protocol errors', defaultSeverity: 'MEDIUM', examples: ['4xx', '5xx', 'invalid response'] },
    'NETWORK_WEBSOCKET': { layer: 'NETWORK', description: 'WebSocket errors', defaultSeverity: 'MEDIUM', examples: ['close', 'error', 'timeout'] },
    // Database Layer
    'DATABASE_CONNECTION': { layer: 'DATABASE', description: 'Database connection errors', defaultSeverity: 'CRITICAL', examples: ['P1001', 'P1017', 'pool exhausted'] },
    'DATABASE_QUERY': { layer: 'DATABASE', description: 'Query execution errors', defaultSeverity: 'MEDIUM', examples: ['P2002', 'P2025', 'syntax error'] },
    'DATABASE_TRANSACTION': { layer: 'DATABASE', description: 'Transaction errors', defaultSeverity: 'HIGH', examples: ['P2028', 'P2034', 'deadlock'] },
    'DATABASE_MIGRATION': { layer: 'DATABASE', description: 'Schema migration errors', defaultSeverity: 'HIGH', examples: ['P3000', 'P3006', 'schema drift'] },
    'DATABASE_PRISMA': { layer: 'DATABASE', description: 'Prisma-specific errors', defaultSeverity: 'MEDIUM', examples: ['P5000', 'client error'] },
    // Discord Layer
    'DISCORD_REST': { layer: 'DISCORD', description: 'Discord REST API errors', defaultSeverity: 'MEDIUM', examples: ['400', '500', '10008'] },
    'DISCORD_GATEWAY': { layer: 'DISCORD', description: 'Discord Gateway errors', defaultSeverity: 'HIGH', examples: ['4000', '4009', 'disconnect'] },
    'DISCORD_RATELIMIT': { layer: 'DISCORD', description: 'Discord rate limit errors', defaultSeverity: 'MEDIUM', examples: ['429', 'bucket exhausted'] },
    'DISCORD_PERMISSION': { layer: 'DISCORD', description: 'Discord permission errors', defaultSeverity: 'HIGH', examples: ['50001', '50013', 'Missing Permissions'] },
    'DISCORD_INTENT': { layer: 'DISCORD', description: 'Discord intent errors', defaultSeverity: 'CRITICAL', examples: ['4013', '4014', 'Disallowed intents'] },
    'DISCORD_CACHE': { layer: 'DISCORD', description: 'Discord cache errors', defaultSeverity: 'LOW', examples: ['cache miss', 'stale data'] },
    // App Layer
    'APP_VALIDATION': { layer: 'APP', description: 'Input validation errors', defaultSeverity: 'LOW', examples: ['invalid input', 'schema validation'] },
    'APP_AUTH': { layer: 'APP', description: 'Authentication/authorization errors', defaultSeverity: 'HIGH', examples: ['unauthorized', 'forbidden'] },
    'APP_BUSINESS': { layer: 'APP', description: 'Business logic errors', defaultSeverity: 'LOW', examples: ['rule violation', 'invalid state'] },
    'APP_CONFIG': { layer: 'APP', description: 'Configuration errors', defaultSeverity: 'HIGH', examples: ['missing env var', 'invalid config'] },
    'APP_STATE': { layer: 'APP', description: 'Application state errors', defaultSeverity: 'MEDIUM', examples: ['invalid state', 'transition error'] },
    // Engine Layer
    'ENGINE_BATTLE': { layer: 'ENGINE', description: 'Battle engine errors', defaultSeverity: 'HIGH', examples: ['invalid move', 'state corruption'] },
    'ENGINE_ENCOUNTER': { layer: 'ENGINE', description: 'Encounter generation errors', defaultSeverity: 'MEDIUM', examples: ['spawn failed', 'invalid zone'] },
    'ENGINE_PBSL': { layer: 'ENGINE', description: 'PBSL parsing/execution errors', defaultSeverity: 'MEDIUM', examples: ['parse error', 'invalid snapshot'] },
    'ENGINE_CACHE': { layer: 'ENGINE', description: 'Engine cache errors', defaultSeverity: 'LOW', examples: ['cache miss', 'stale data'] },
    // Worker Layer
    'WORKER_LIFECYCLE': { layer: 'WORKER', description: 'Worker lifecycle errors', defaultSeverity: 'HIGH', examples: ['start failed', 'shutdown error'] },
    'WORKER_EXECUTION': { layer: 'WORKER', description: 'Worker execution errors', defaultSeverity: 'MEDIUM', examples: ['job failed', 'handler error'] },
    'WORKER_TIMEOUT': { layer: 'WORKER', description: 'Worker timeout errors', defaultSeverity: 'MEDIUM', examples: ['job timeout', 'heartbeat timeout'] },
    'WORKER_CHILD': { layer: 'WORKER', description: 'Child process errors', defaultSeverity: 'HIGH', examples: ['spawn failed', 'exit code non-zero'] },
    'WORKER_QUEUE': { layer: 'WORKER', description: 'Job queue errors', defaultSeverity: 'MEDIUM', examples: ['queue full', 'backpressure'] },
    // Stream Layer
    'STREAM_READ': { layer: 'STREAM', description: 'Readable stream errors', defaultSeverity: 'MEDIUM', examples: ['stream destroyed', 'premature close'] },
    'STREAM_WRITE': { layer: 'STREAM', description: 'Writable stream errors', defaultSeverity: 'MEDIUM', examples: ['write after end', 'backpressure'] },
    'STREAM_PIPE': { layer: 'STREAM', description: 'Stream pipe errors', defaultSeverity: 'MEDIUM', examples: ['pipe error', 'transform error'] },
    'EMITTER_LISTENER': { layer: 'STREAM', description: 'EventEmitter errors', defaultSeverity: 'MEDIUM', examples: ['unhandled error', 'max listeners'] },
    // Unknown
    'UNKNOWN': { layer: 'UNKNOWN', description: 'Unclassified errors', defaultSeverity: 'MEDIUM', examples: ['uncategorized error'] },
};
/**
 * Get metadata for a specific error category
 */
export function getErrorCategoryInfo(category) {
    const metadata = ERROR_CATEGORY_METADATA[category] || ERROR_CATEGORY_METADATA['UNKNOWN'];
    return {
        category,
        ...metadata,
    };
}
/**
 * Get all error categories grouped by layer
 */
export function getAllErrorCategories() {
    const grouped = new Map();
    for (const [category, metadata] of Object.entries(ERROR_CATEGORY_METADATA)) {
        const layer = metadata.layer;
        if (!grouped.has(layer)) {
            grouped.set(layer, []);
        }
        grouped.get(layer).push({
            category: category,
            ...metadata,
        });
    }
    return grouped;
}
