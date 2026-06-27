import type { CommandParserMetadata, ExecutionStatus, ImportantLine } from "../config/types.js";
export interface CommandParseInput {
    command: string | readonly string[];
    executionStatus: ExecutionStatus;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    combined: string;
    goal?: string;
}
export interface ParsedCommandOutput {
    parser: CommandParserMetadata;
    importantLines: ImportantLine[];
    summary?: string;
}
export declare function parseCommandOutput(input: CommandParseInput): ParsedCommandOutput;
