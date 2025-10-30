export type SectionMetrics = Array<[string, unknown]> | Record<string, unknown> | undefined;

export interface SectionData {
  title?: string;
  status?: string;
  metrics?: SectionMetrics;
}

export function startStatusDisplay(): void;
export function stopStatusDisplay(): void;
export function setPhase(phase: string): void;
export function setGuildCount(count: number): void;
export function setSection(sectionId: string, data: SectionData | null): void;
export function interruptConsoleOutput(writer: () => void): void;

declare const cliStatus: {
  startStatusDisplay: typeof startStatusDisplay;
  stopStatusDisplay: typeof stopStatusDisplay;
  setPhase: typeof setPhase;
  setGuildCount: typeof setGuildCount;
  setSection: typeof setSection;
  interruptConsoleOutput: typeof interruptConsoleOutput;
};

export default cliStatus;
