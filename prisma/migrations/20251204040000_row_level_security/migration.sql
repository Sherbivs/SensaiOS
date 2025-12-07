-- Row-Level Security (RLS) Policies Migration
-- Task: P1-001 Row-Level Security Policies
-- Date: 2025-12-04
-- Specialist: Security (lead)
--
-- PURPOSE:
-- Implement PostgreSQL Row-Level Security to prevent users from accessing
-- other users' data, even via SQL injection or direct database access.
--
-- ARCHITECTURE:
-- - User context set via session variable: app.current_user_id (Discord ID)
-- - Admin bypass via: app.admin_bypass = 'true'
-- - All user-facing tables protected with RLS policies
--
-- TABLES PROTECTED:
-- - Trainer (user profile data)
-- - PokemonInstance (owned Pokemon)
-- - Party (party configuration)
-- - PartySlot (party Pokemon assignments)
-- - Inventory (owned items)
-- - Encounter (active encounters)
-- - Battle (battle participation)
-- - HomesteadChannel (user's private channel)
-- - TrainerSettings (user preferences)

-- ============================================================================
-- 1. CREATE ADMIN BYPASS FUNCTION
-- ============================================================================

-- Function to check if current session has admin bypass enabled
CREATE OR REPLACE FUNCTION is_admin_bypass()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    current_setting('app.admin_bypass', true)::boolean,
    false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_admin_bypass() IS 
  'Returns true if current session has admin bypass enabled via app.admin_bypass setting';

-- Function to get current user's Discord ID from session
CREATE OR REPLACE FUNCTION current_user_discord_id()
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION current_user_discord_id() IS 
  'Returns the current user Discord ID from app.current_user_id session setting';

-- Function to get current user's internal User ID from Discord ID
CREATE OR REPLACE FUNCTION current_internal_user_id()
RETURNS TEXT AS $$
DECLARE
  user_id TEXT;
BEGIN
  -- Admin bypass returns NULL (all rows visible)
  IF is_admin_bypass() THEN
    RETURN NULL;
  END IF;
  
  -- Get User.id from Discord ID
  SELECT id INTO user_id
  FROM "User"
  WHERE "discordId" = current_user_discord_id()
  LIMIT 1;
  
  RETURN user_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION current_internal_user_id() IS 
  'Returns the internal User.id for the current session user, or NULL for admin bypass';

-- ============================================================================
-- 2. TRAINER TABLE RLS
-- ============================================================================

-- Enable RLS on Trainer table
ALTER TABLE "Trainer" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own trainer profile
CREATE POLICY trainer_select_own ON "Trainer"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can update their own trainer profile
CREATE POLICY trainer_update_own ON "Trainer"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can insert their own trainer profile (on registration)
CREATE POLICY trainer_insert_own ON "Trainer"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can delete their own trainer profile
CREATE POLICY trainer_delete_own ON "Trainer"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

COMMENT ON POLICY trainer_select_own ON "Trainer" IS 'Users can only SELECT their own trainer data';
COMMENT ON POLICY trainer_update_own ON "Trainer" IS 'Users can only UPDATE their own trainer data';
COMMENT ON POLICY trainer_insert_own ON "Trainer" IS 'Users can only INSERT their own trainer data';
COMMENT ON POLICY trainer_delete_own ON "Trainer" IS 'Users can only DELETE their own trainer data';

-- ============================================================================
-- 3. POKEMON INSTANCE TABLE RLS
-- ============================================================================

-- Enable RLS on PokemonInstance table
ALTER TABLE "PokemonInstance" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own Pokemon
CREATE POLICY pokemon_select_own ON "PokemonInstance"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can update their own Pokemon (nicknames, etc.)
CREATE POLICY pokemon_update_own ON "PokemonInstance"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can insert Pokemon they catch
CREATE POLICY pokemon_insert_own ON "PokemonInstance"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can release their own Pokemon
CREATE POLICY pokemon_delete_own ON "PokemonInstance"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

COMMENT ON POLICY pokemon_select_own ON "PokemonInstance" IS 'Users can only SELECT their own Pokemon';
COMMENT ON POLICY pokemon_update_own ON "PokemonInstance" IS 'Users can only UPDATE their own Pokemon';
COMMENT ON POLICY pokemon_insert_own ON "PokemonInstance" IS 'Users can only INSERT their own Pokemon';
COMMENT ON POLICY pokemon_delete_own ON "PokemonInstance" IS 'Users can only DELETE their own Pokemon';

-- ============================================================================
-- 4. PARTY TABLE RLS
-- ============================================================================

-- Enable RLS on Party table
ALTER TABLE "Party" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own parties
CREATE POLICY party_select_own ON "Party"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can update their own parties
CREATE POLICY party_update_own ON "Party"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can create their own parties
CREATE POLICY party_insert_own ON "Party"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can delete their own parties
CREATE POLICY party_delete_own ON "Party"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

COMMENT ON POLICY party_select_own ON "Party" IS 'Users can only SELECT their own parties';
COMMENT ON POLICY party_update_own ON "Party" IS 'Users can only UPDATE their own parties';
COMMENT ON POLICY party_insert_own ON "Party" IS 'Users can only INSERT their own parties';
COMMENT ON POLICY party_delete_own ON "Party" IS 'Users can only DELETE their own parties';

-- ============================================================================
-- 5. PARTY SLOT TABLE RLS
-- ============================================================================

-- Enable RLS on PartySlot table
ALTER TABLE "PartySlot" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see slots in their own parties
CREATE POLICY partyslot_select_own ON "PartySlot"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "PartySlot"."partyId"
      AND p."ownerId" = current_internal_user_id()
    )
  );

-- Policy: Users can update slots in their own parties
CREATE POLICY partyslot_update_own ON "PartySlot"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "PartySlot"."partyId"
      AND p."ownerId" = current_internal_user_id()
    )
  );

-- Policy: Users can add slots to their own parties
CREATE POLICY partyslot_insert_own ON "PartySlot"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "PartySlot"."partyId"
      AND p."ownerId" = current_internal_user_id()
    )
  );

-- Policy: Users can remove slots from their own parties
CREATE POLICY partyslot_delete_own ON "PartySlot"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "PartySlot"."partyId"
      AND p."ownerId" = current_internal_user_id()
    )
  );

COMMENT ON POLICY partyslot_select_own ON "PartySlot" IS 'Users can only SELECT slots in their own parties';
COMMENT ON POLICY partyslot_update_own ON "PartySlot" IS 'Users can only UPDATE slots in their own parties';
COMMENT ON POLICY partyslot_insert_own ON "PartySlot" IS 'Users can only INSERT slots in their own parties';
COMMENT ON POLICY partyslot_delete_own ON "PartySlot" IS 'Users can only DELETE slots in their own parties';

-- ============================================================================
-- 6. INVENTORY TABLE RLS
-- ============================================================================

-- Enable RLS on Inventory table
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own inventory
CREATE POLICY inventory_select_own ON "Inventory"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "Inventory"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can update their own inventory (use items)
CREATE POLICY inventory_update_own ON "Inventory"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "Inventory"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can add items to their inventory
CREATE POLICY inventory_insert_own ON "Inventory"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "Inventory"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can remove items from their inventory
CREATE POLICY inventory_delete_own ON "Inventory"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "Inventory"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

COMMENT ON POLICY inventory_select_own ON "Inventory" IS 'Users can only SELECT their own inventory';
COMMENT ON POLICY inventory_update_own ON "Inventory" IS 'Users can only UPDATE their own inventory';
COMMENT ON POLICY inventory_insert_own ON "Inventory" IS 'Users can only INSERT in their own inventory';
COMMENT ON POLICY inventory_delete_own ON "Inventory" IS 'Users can only DELETE from their own inventory';

-- ============================================================================
-- 7. ENCOUNTER TABLE RLS
-- ============================================================================

-- Enable RLS on Encounter table
ALTER TABLE "Encounter" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own encounters
CREATE POLICY encounter_select_own ON "Encounter"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can update their own encounters
CREATE POLICY encounter_update_own ON "Encounter"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can create their own encounters
CREATE POLICY encounter_insert_own ON "Encounter"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

-- Policy: Users can delete their own encounters
CREATE POLICY encounter_delete_own ON "Encounter"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    "ownerId" = current_internal_user_id()
  );

COMMENT ON POLICY encounter_select_own ON "Encounter" IS 'Users can only SELECT their own encounters';
COMMENT ON POLICY encounter_update_own ON "Encounter" IS 'Users can only UPDATE their own encounters';
COMMENT ON POLICY encounter_insert_own ON "Encounter" IS 'Users can only INSERT their own encounters';
COMMENT ON POLICY encounter_delete_own ON "Encounter" IS 'Users can only DELETE their own encounters';

-- ============================================================================
-- 8. BATTLE TABLE RLS (Special: Both participants can see)
-- ============================================================================

-- Enable RLS on Battle table
ALTER TABLE "Battle" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see battles they participate in
-- Note: trainer1Id and trainer2Id are Trainer IDs, need to join to User
CREATE POLICY battle_select_participant ON "Battle"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE (t.id = "Battle"."trainer1Id" OR t.id = "Battle"."trainer2Id")
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can update battles they participate in (for forfeits, etc.)
CREATE POLICY battle_update_participant ON "Battle"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE (t.id = "Battle"."trainer1Id" OR t.id = "Battle"."trainer2Id")
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can create battles they initiate
CREATE POLICY battle_insert_participant ON "Battle"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "Battle"."trainer1Id"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Battles generally shouldn't be deleted, but allow admin
CREATE POLICY battle_delete_admin ON "Battle"
  FOR DELETE
  USING (is_admin_bypass());

COMMENT ON POLICY battle_select_participant ON "Battle" IS 'Users can only SELECT battles they participate in';
COMMENT ON POLICY battle_update_participant ON "Battle" IS 'Users can only UPDATE battles they participate in';
COMMENT ON POLICY battle_insert_participant ON "Battle" IS 'Users can only INSERT battles they initiate';
COMMENT ON POLICY battle_delete_admin ON "Battle" IS 'Only admins can DELETE battles';

-- ============================================================================
-- 9. HOMESTEAD CHANNEL TABLE RLS
-- ============================================================================

-- Enable RLS on homestead_channels table
ALTER TABLE "homestead_channels" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own homestead channel
CREATE POLICY homestead_select_own ON "homestead_channels"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can update their own homestead channel
CREATE POLICY homestead_update_own ON "homestead_channels"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can have their homestead channel created
CREATE POLICY homestead_insert_own ON "homestead_channels"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

-- Policy: Users can delete their own homestead channel
CREATE POLICY homestead_delete_own ON "homestead_channels"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    "userId" = current_internal_user_id()
  );

COMMENT ON POLICY homestead_select_own ON "homestead_channels" IS 'Users can only SELECT their own homestead';
COMMENT ON POLICY homestead_update_own ON "homestead_channels" IS 'Users can only UPDATE their own homestead';
COMMENT ON POLICY homestead_insert_own ON "homestead_channels" IS 'Users can only INSERT their own homestead';
COMMENT ON POLICY homestead_delete_own ON "homestead_channels" IS 'Users can only DELETE their own homestead';

-- ============================================================================
-- 10. TRAINER SETTINGS TABLE RLS
-- ============================================================================

-- Enable RLS on TrainerSettings table
ALTER TABLE "TrainerSettings" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own settings
CREATE POLICY settings_select_own ON "TrainerSettings"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "TrainerSettings"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can update their own settings
CREATE POLICY settings_update_own ON "TrainerSettings"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "TrainerSettings"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can create their own settings
CREATE POLICY settings_insert_own ON "TrainerSettings"
  FOR INSERT
  WITH CHECK (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "TrainerSettings"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

-- Policy: Users can delete their own settings
CREATE POLICY settings_delete_own ON "TrainerSettings"
  FOR DELETE
  USING (
    is_admin_bypass() OR
    EXISTS (
      SELECT 1 FROM "Trainer" t
      WHERE t.id = "TrainerSettings"."trainerId"
      AND t."userId" = current_internal_user_id()
    )
  );

COMMENT ON POLICY settings_select_own ON "TrainerSettings" IS 'Users can only SELECT their own settings';
COMMENT ON POLICY settings_update_own ON "TrainerSettings" IS 'Users can only UPDATE their own settings';
COMMENT ON POLICY settings_insert_own ON "TrainerSettings" IS 'Users can only INSERT their own settings';
COMMENT ON POLICY settings_delete_own ON "TrainerSettings" IS 'Users can only DELETE their own settings';

-- ============================================================================
-- 11. USER TABLE RLS
-- ============================================================================

-- Enable RLS on User table
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own user record
CREATE POLICY user_select_own ON "User"
  FOR SELECT
  USING (
    is_admin_bypass() OR
    id = current_internal_user_id()
  );

-- Policy: Users can update their own user record
CREATE POLICY user_update_own ON "User"
  FOR UPDATE
  USING (
    is_admin_bypass() OR
    id = current_internal_user_id()
  );

-- Policy: System can create user records (registration)
-- Note: INSERT typically done by system before user context set
CREATE POLICY user_insert_system ON "User"
  FOR INSERT
  WITH CHECK (is_admin_bypass());

-- Policy: Only admin can delete user records
CREATE POLICY user_delete_admin ON "User"
  FOR DELETE
  USING (is_admin_bypass());

COMMENT ON POLICY user_select_own ON "User" IS 'Users can only SELECT their own user record';
COMMENT ON POLICY user_update_own ON "User" IS 'Users can only UPDATE their own user record';
COMMENT ON POLICY user_insert_system ON "User" IS 'Only system/admin can INSERT user records';
COMMENT ON POLICY user_delete_admin ON "User" IS 'Only admins can DELETE user records';

-- ============================================================================
-- 12. VERIFICATION AND DOCUMENTATION
-- ============================================================================

-- Create view to list all RLS policies
CREATE OR REPLACE VIEW rls_policy_summary AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL AS has_using,
  with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

COMMENT ON VIEW rls_policy_summary IS 
  'Summary of all Row-Level Security policies in the public schema';

-- Create function to set user context for a request
CREATE OR REPLACE FUNCTION set_user_context(discord_id TEXT, is_admin BOOLEAN DEFAULT false)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', discord_id, true);
  PERFORM set_config('app.admin_bypass', is_admin::text, true);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_user_context(TEXT, BOOLEAN) IS 
  'Set the user context for the current transaction. Call at start of each request.';

-- Create function to clear user context
CREATE OR REPLACE FUNCTION clear_user_context()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('app.admin_bypass', 'false', true);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_user_context() IS 
  'Clear the user context at the end of a request';

-- ============================================================================
-- SUMMARY
-- ============================================================================

/*
Tables with RLS enabled (10 tables):
1. User - Own record only
2. Trainer - Own profile only
3. TrainerSettings - Own settings only
4. PokemonInstance - Own Pokemon only
5. Party - Own parties only
6. PartySlot - Slots in own parties only
7. Inventory - Own inventory only
8. Encounter - Own encounters only
9. Battle - Battles user participates in
10. HomesteadChannel - Own channel only

Tables WITHOUT RLS (reference/system data - intentionally public):
- Type, Ability, Item, Move, Species (reference data)
- SpeciesType, SpeciesAbility, SpeciesLearnset, EvolutionStep, TypeChart (junction tables)
- NameVariant (reference data)
- Tenant (system)
- DexPack (system)
- BusMessage, BusIdemToken (system)
- AuditLog (system - admin only)
- DbVersion, DbSyncState (system)
- ErrorLog, ErrorAlert (system - admin only)
- LogEntry, WorkerMetrics, ConsoleOutput (analytics - admin only)
- Cooldown (system)

Usage in Application:
1. At request start: SELECT set_user_context('discord_user_id_here');
2. Run queries normally - RLS filters automatically
3. At request end: SELECT clear_user_context();
4. For admin ops: SELECT set_user_context('admin_id', true);
*/
