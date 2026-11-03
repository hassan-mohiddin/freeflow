// The state Freeflow's Claude Code mod keeps for its pane (SPEC-015), as `$.state` holds it: the contract
// `.claude-plugin/plugin.json` names under `types`. Only the mod writes these; a render reads them.

/** The view the pane shows. */
export type FreeflowPaneView = "tasks" | "agents" | "cost" | "decisions";

/** What the pane's last reads found: the scripts' JSON and the engine's figures, and what could not be read. */
export type FreeflowPaneData = {
  values: Record<string, unknown>;
  failed: string[];
  asOf: string | null;
};

/** The row selected in each view, by view. */
export type FreeflowPaneSelected = Partial<Record<FreeflowPaneView, string>>;

/** The question the pane's field asks: a new task's title or goal, a project to move a task to, a line to send. */
export type FreeflowPaneInput =
  | { kind: "title" }
  | { kind: "goal"; title: string }
  | { kind: "move"; id: string }
  | { kind: "send"; agentId: string; label: string }
  | null;

declare module "claude-code" {
  interface PluginState {
    freeflow: {
      paneView: FreeflowPaneView;
      paneData: FreeflowPaneData;
      paneSelected: FreeflowPaneSelected;
      paneInput: FreeflowPaneInput;
    };
  }
}
