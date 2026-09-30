import type { OperationDescriptor } from "../contracts.js";
import type { CatalogSnapshot } from "../registry.js";
import { canonicalJson } from "../schema.js";

const MAX_QUERY_TERMS = 32;
const K1 = 1.2;
const B = 0.75;

type Document = Readonly<{
  descriptor: OperationDescriptor;
  length: number;
  terms: ReadonlyMap<string, number>;
}>;

type Index = Readonly<{
  generation: string;
  documents: readonly Document[];
  frequencies: ReadonlyMap<string, number>;
  averageLength: number;
  metadataBytes: number;
}>;

function keyOf(descriptor: OperationDescriptor): string {
  return `${descriptor.key.id}@${descriptor.key.revision}`;
}

export function discoveryTerms(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}._-]+/gu) ?? []).slice(0, MAX_QUERY_TERMS);
}

function weightedTerms(descriptor: OperationDescriptor): string[] {
  return [
    ...Array(4).fill(descriptor.key.id),
    ...Array(2).fill(descriptor.key.revision),
    ...descriptor.keywords.flatMap((keyword) => [keyword, keyword]),
    ...descriptor.effects,
    descriptor.description,
  ].flatMap((value) => discoveryTerms(String(value)));
}

function build(snapshot: CatalogSnapshot): Index {
  const frequencies = new Map<string, number>();
  const documents = snapshot.descriptors
    .filter((descriptor) => descriptor.exposure.discoverable)
    .map((descriptor) => {
      const values = weightedTerms(descriptor);
      const terms = new Map<string, number>();
      for (const term of values) terms.set(term, (terms.get(term) ?? 0) + 1);
      for (const term of terms.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      return Object.freeze({ descriptor, length: Math.max(1, values.length), terms });
    });
  const averageLength = documents.length
    ? documents.reduce((total, document) => total + document.length, 0) / documents.length
    : 1;
  const metadataBytes = Buffer.byteLength(
    canonicalJson(
      documents.map(({ descriptor }) => ({
        key: { ...descriptor.key },
        description: descriptor.description,
        keywords: [...descriptor.keywords],
        effects: [...descriptor.effects],
        exposure: { ...descriptor.exposure },
      })),
    ),
    "utf8",
  );
  return Object.freeze({
    generation: snapshot.generation,
    documents: Object.freeze(documents),
    frequencies,
    averageLength,
    metadataBytes,
  });
}

export class DiscoveryIndex {
  private current: Index | undefined;

  private index(snapshot: CatalogSnapshot): Index {
    if (!this.current || this.current.generation !== snapshot.generation) this.current = build(snapshot);
    return this.current;
  }

  search(snapshot: CatalogSnapshot, query: string, limit: number): OperationDescriptor[] {
    const index = this.index(snapshot);
    const normalized = query.trim().toLowerCase();
    const exact = index.documents.find(
      ({ descriptor }) =>
        descriptor.key.id.toLowerCase() === normalized || keyOf(descriptor).toLowerCase() === normalized,
    );
    if (exact) return [exact.descriptor];
    const terms = [...new Set(discoveryTerms(query))];
    if (!terms.length) return [];
    const count = index.documents.length;
    return index.documents
      .map((document) => {
        let score = 0;
        for (const term of terms) {
          const frequency = document.terms.get(term) ?? 0;
          if (!frequency) continue;
          const documentsWithTerm = index.frequencies.get(term) ?? 0;
          const inverse = Math.log(1 + (count - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5));
          const denominator = frequency + K1 * (1 - B + B * (document.length / index.averageLength));
          score += inverse * ((frequency * (K1 + 1)) / denominator);
        }
        return { descriptor: document.descriptor, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || keyOf(left.descriptor).localeCompare(keyOf(right.descriptor)))
      .slice(0, limit)
      .map((candidate) => candidate.descriptor);
  }

  status(snapshot: CatalogSnapshot): { generation: string; operations: number; metadataBytes: number } {
    const index = this.index(snapshot);
    return {
      generation: index.generation,
      operations: index.documents.length,
      metadataBytes: index.metadataBytes,
    };
  }
}
