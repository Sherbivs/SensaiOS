// Minimal shared status helpers for the battle core
export type MajorStatus = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' | null;

export function canApplyMajorStatus(target: { status?: MajorStatus }, status: MajorStatus) {
  if (!status) return false;
  if (target.status) return false; // don't overwrite major status
  return true;
}

export function applyMajorStatus(target: { status?: MajorStatus }, status: MajorStatus) {
  if (!canApplyMajorStatus(target, status)) return false;
  target.status = status;
  return true;
}
