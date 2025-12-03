/**
 * AI Log Integrations - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module services/ai/ai-log-integrations
 */

import { aiIntegrationsStubs } from '../../shared/legacy-stubs.js';

export const integrateAll = aiIntegrationsStubs.integrateAll;
export const integrateErrorTracker = aiIntegrationsStubs.integrateErrorTracker;
export const integrateEventBus = aiIntegrationsStubs.integrateEventBus;

export default aiIntegrationsStubs;
