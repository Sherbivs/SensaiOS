// router/metaRouter.ts
import { EventEmitter } from "node:events";

type Task = {
  id: string;
  goal: string;
  context?: Record<string, unknown>;
  constraints?: { timeMs?: number; tokens?: number; tools?: string[] };
};

type AgentName = "planner" | "researcher" | "implementer" | "reviewer";

type RouteDecision = {
  agent: AgentName;
  rationale: string;
  budget: { timeMs: number; tokens: number };
};

type StepResult = {
  ok: boolean;
  changes?: string[];       // paths or artifact IDs
  message?: string;
  error?: { code: string; detail: string };
  citations?: string[];
};

type RouterEvents =
  | { type: "start"; taskId: string }
  | { type: "route"; taskId: string; decision: RouteDecision }
  | { type: "step"; taskId: string; agent: AgentName; summary: string }
  | { type: "error"; taskId: string; agent: AgentName; error: string }
  | { type: "recovered"; taskId: string; strategy: string }
  | { type: "done"; taskId: string; ok: boolean };

export class MetaRouter extends EventEmitter {
  private noProgress = 0;
  private lastChangeHash = "";

  constructor(
    private registry: Record<AgentName, (t: Task) => Promise<StepResult>>,
    private opts = { timeMs: 15 * 60_000, tokens: 80_000 }
  ) { super(); }

  private decide(task: Task): RouteDecision {
    // Primitive policy: route by goal keywords; your production version
    // should use a model-based classifier + learned success priors.
    const g = task.goal.toLowerCase();
    const budget = {
      timeMs: task.constraints?.timeMs ?? this.opts.timeMs,
      tokens: task.constraints?.tokens ?? this.opts.tokens,
    };

    if (g.includes("plan") || g.includes("break down")) {
      return { agent: "planner", rationale: "Planning keywords", budget };
    }
    if (g.includes("research") || g.includes("investigate") || g.includes("compare")) {
      return { agent: "researcher", rationale: "Research keywords", budget };
    }
    if (g.includes("implement") || g.includes("fix") || g.includes("refactor") || g.includes("write code")) {
      return { agent: "implementer", rationale: "Implementation keywords", budget };
    }
    return { agent: "reviewer", rationale: "Default to verification", budget };
  }

  private changed(changes?: string[]) {
    const h = JSON.stringify(changes ?? []);
    const changed = h !== this.lastChangeHash;
    this.lastChangeHash = h;
    return changed;
  }

  private async recover(task: Task, lastError: string): Promise<boolean> {
    // 1) Shrink step: cut tokens/time by 50%
    this.opts.tokens = Math.floor(this.opts.tokens * 0.5);
    this.opts.timeMs = Math.floor(this.opts.timeMs * 0.5);
    this.emitEvent({ type: "recovered", taskId: task.id, strategy: "shrink_step" });

    // 2) Swap strategy: switch agent if we looped
    if (this.noProgress >= 2) {
      const alt: AgentName = "reviewer";
      const res = await this.registry[alt](task);
      this.emitEvent({ type: "step", taskId: task.id, agent: alt, summary: res.message ?? "fallback review" });
      return res.ok;
    }
    return true; // let next loop try again with reduced scope
  }

  private emitEvent(e: RouterEvents) {
    this.emit("event", e);
    // Append to JSONL for auditability
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n");
  }

  async run(task: Task): Promise<boolean> {
    this.emitEvent({ type: "start", taskId: task.id });

    const deadline = Date.now() + (task.constraints?.timeMs ?? this.opts.timeMs);
    while (Date.now() < deadline) {
      const decision = this.decide(task);
      this.emitEvent({ type: "route", taskId: task.id, decision });

      const exec = this.registry[decision.agent];
      const res = await exec(task);

      if (res.ok && this.changed(res.changes)) {
        this.noProgress = 0;
        this.emitEvent({ type: "step", taskId: task.id, agent: decision.agent, summary: res.message ?? "progress" });
        // Stop when a reviewer declares success or Done criteria are hit.
        if (decision.agent === "reviewer") {
          this.emitEvent({ type: "done", taskId: task.id, ok: true });
          return true;
        }
      } else {
        this.noProgress += 1;
        const detail = res.error?.detail ?? res.message ?? "no_progress";
        this.emitEvent({ type: "error", taskId: task.id, agent: decision.agent, error: detail });

        const keepGoing = await this.recover(task, detail);
        if (!keepGoing || this.noProgress >= 3) {
          this.emitEvent({ type: "done", taskId: task.id, ok: false });
          return false;
        }
      }
    }

    this.emitEvent({ type: "done", taskId: task.id, ok: false });
    return false;
  }
}
