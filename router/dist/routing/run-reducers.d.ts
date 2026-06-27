import { type ProcessingReducerResult } from "../processing/reducers.js";
import type { CommandParserMetadata, ExecutionStatus, ImportantLine, PreserveMode, RouterThresholds } from "../config/types.js";
export type RunReducerRoute = {
    status: "selected";
    result: ProcessingReducerResult;
    sourceStream: ImportantLine["stream"];
    reason: string;
} | {
    status: "not_selected";
    reason: string;
};
export interface SelectRunReducerRouteOptions {
    command: string | readonly string[];
    goal?: string;
    executionStatus: ExecutionStatus;
    stdout: string;
    stderr: string;
    combined: string;
    preserve: PreserveMode;
    thresholds: RouterThresholds;
    hasFilters: boolean;
    hasScriptFilter: boolean;
}
export declare function selectRunReducerRoute(options: SelectRunReducerRouteOptions): RunReducerRoute;
export declare function reducerImportantLines(route: Extract<RunReducerRoute, {
    status: "selected";
}>): ImportantLine[];
export declare function parserWithReducer(parser: CommandParserMetadata, route: Extract<RunReducerRoute, {
    status: "selected";
}>): CommandParserMetadata;
