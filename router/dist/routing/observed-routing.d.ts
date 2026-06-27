import type { ObservedHostDescriptor, ObservedProducerRisk, ObservedRoutedResult, ObservedRoutingPersistenceMode, PreserveMode, ProducerDescriptor, RouterThresholds, VaultRetentionPolicy } from "../config/types.js";
export interface RouteObservedToolOutputOptions {
    sessionId: string;
    host: ObservedHostDescriptor;
    producer: ProducerDescriptor;
    rawResult: unknown;
    persistence: ObservedRoutingPersistenceMode;
    preserve?: PreserveMode;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    mediaType?: string;
    toolInputHash?: string;
    risk?: ObservedProducerRisk;
    createdAt?: string;
}
export declare function routeObservedToolOutput(options: RouteObservedToolOutputOptions): Promise<ObservedRoutedResult>;
