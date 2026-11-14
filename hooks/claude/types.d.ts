// The state Freeflow's Claude Code mod keeps for its pane (SPEC-015), as `$.state` holds it: the contract
// `.claude-plugin/plugin.json` names under `types`. Only the mod writes these; a render reads them.

/** The tab the pane shows under Needs you and Now (layout B). */
export type FreeflowPaneTab = "projects" | "workers" | "sent" | "settings" | "about";

/** What the pane's last reads found: the scripts' JSON and the engine's figures, and what could not be read. */
export type FreeflowPaneData = {
  values: Record<string, unknown>;
  failed: string[];
  asOf: string | null;
};

/** What the user picked: the project (its name, or "@none" for no project), the task and the worker. */
export type FreeflowPaneSelected = { project?: string; task?: string; worker?: string };

/** The question the pane's field asks: a new task's title, then its goal, for the project picked (null: none). */
export type FreeflowPaneInput =
  | { kind: "title"; project: string | null }
  | { kind: "goal"; title: string; project: string | null }
  | null;

/** What the reading view shows in place of the tab: a brief, a return, a sent text, decisions, the guide. */
export type FreeflowPaneReading = { title: string; text: string; path?: string; markdown?: boolean } | null;

/** The settings row whose `⋯` menu is open, and the reach chosen for each row's next change. */
export type FreeflowPaneReach = { open: string | null; chosen: Record<string, "everywhere" | "folder" | "session"> };

declare module "claude-code" {
  interface PluginState {
    freeflow: {
      paneTab: FreeflowPaneTab;
      paneData: FreeflowPaneData;
      paneSelected: FreeflowPaneSelected;
      paneInput: FreeflowPaneInput;
      paneReading: FreeflowPaneReading;
      paneReach: FreeflowPaneReach;
      paneSentShown: number;
    };
  }
}
