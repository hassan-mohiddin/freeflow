import { handleNativeToolSafetyNet } from "./native-safety-net.js";
import { handleObservedToolRouting } from "./observed-tool-routing.js";
import { registerRouterTools } from "./router-tools.js";
import { CONTRIBUTOR_COMMANDS, WORKFLOW_COMMANDS, getRuntimeContext, handleWorkflowCommand, readModeState, readOutputRouterConfig, refreshRuntimeContext, restoreModeOverride, runtimeContext, setModeStatus, skillPrompt, notifyRouterConfigWarnings, } from "./runtime-context.js";
export default function freeflow(pi) {
    registerRouterTools(pi);
    pi.on("session_start", async (_event, ctx) => {
        restoreModeOverride(ctx);
        const [modeState, routerConfigResult] = await Promise.all([
            readModeState(ctx.cwd),
            readOutputRouterConfig(ctx.cwd),
            refreshRuntimeContext(),
        ]);
        setModeStatus(ctx, modeState);
        notifyRouterConfigWarnings(ctx, routerConfigResult);
    });
    pi.on("session_compact", async (_event, ctx) => {
        const [modeState, routerConfigResult] = await Promise.all([
            readModeState(ctx.cwd),
            readOutputRouterConfig(ctx.cwd),
            refreshRuntimeContext(),
        ]);
        setModeStatus(ctx, modeState);
        notifyRouterConfigWarnings(ctx, routerConfigResult);
    });
    pi.on("before_agent_start", async (event, ctx) => {
        const [modeState, freeflowContext, routerConfigResult] = await Promise.all([
            readModeState(ctx.cwd),
            getRuntimeContext(),
            readOutputRouterConfig(ctx.cwd),
        ]);
        setModeStatus(ctx, modeState);
        notifyRouterConfigWarnings(ctx, routerConfigResult);
        return {
            systemPrompt: event.systemPrompt +
                "\n\n" +
                runtimeContext(modeState, freeflowContext, routerConfigResult),
        };
    });
    pi.on("tool_result", async (event, ctx) => {
        const observed = await handleObservedToolRouting(event, ctx);
        if (observed) {
            return observed;
        }
        return handleNativeToolSafetyNet(event, ctx);
    });
    for (const { command, skill } of WORKFLOW_COMMANDS) {
        pi.registerCommand(command, {
            description: command === skill ? `Run Freeflow ${skill}` : `Run Freeflow ${skill} via ${command}`,
            handler: async (args) => {
                await pi.sendUserMessage(skillPrompt(skill, args));
            },
        });
    }
    for (const skill of CONTRIBUTOR_COMMANDS) {
        pi.registerCommand(skill, {
            description: `Run Freeflow ${skill}`,
            handler: async (args) => {
                await pi.sendUserMessage(skillPrompt(skill, args));
            },
        });
    }
    pi.registerCommand("workflow", {
        description: "Set or inspect the current Freeflow session mode",
        getArgumentCompletions: (prefix) => {
            const query = prefix ?? "";
            const values = ["conversation", "workflow", "strict-workflow", "reset"];
            const filtered = values.filter((value) => value.startsWith(query));
            return filtered.map((value) => ({ value, label: value }));
        },
        handler: async (args, ctx) => {
            await handleWorkflowCommand(args, ctx, pi);
        },
    });
}
