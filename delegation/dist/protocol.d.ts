import type { ParseProtocolOptions, ProtocolParseResult, ProtocolRow } from "./types.js";
export declare function collapseFieldNewlines(value: string): string;
export declare function escapeProtocolField(value: string): string;
export declare function unescapeProtocolField(value: string): string;
export declare function formatProtocolRow(tag: string, fields: readonly string[]): string;
export declare function parseProtocolRow(line: string, lineNumber?: number): ProtocolRow;
export declare function parseProtocolText(rawText: string, options?: ParseProtocolOptions): ProtocolParseResult;
export declare const parseModelText: typeof parseProtocolText;
