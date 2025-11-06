# ROUTER
Title: Dex Pack Registry Signature
Purpose: Add unique signatures to dex pack registry rows.
Owned Globs: prisma/migrations/202511050900_pack_registry_signature/**
Last Updated (UTC): 2025-11-05T08:00:00Z

Notes:
- Introduces the `signature` column on `DexPack` with a unique index so each pack hash carries a paired signature string.
- Initializes existing rows (if any) so the column is non-null before enforcing the constraint.
- Pairs with Task DB.V0.PACK_REGISTRY to ensure builder writes and verifies registry entries alongside the binary artifacts.
