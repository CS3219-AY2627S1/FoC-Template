/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: consolidated approved Supplier building codes, labels, and seed aliases.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; derived the
 * public issue #33 code/label options from the existing backend registry.
 * Contract decision and implementation reviewed and approved by @ron.
 */
export const BUILDINGS = [
  { code: "COM2", label: "COM2", seedAliases: ["Com 2", "Com2"] },
  { code: "COM3", label: "COM3", seedAliases: ["COM3"] },
  {
    code: "CENTRAL_LIBRARY",
    label: "Central Library",
    seedAliases: ["Central Library"],
  },
  {
    code: "ENG_E3",
    label: "Engineering Block E3",
    seedAliases: ["Engineering Block E3"],
  },
  {
    code: "ENG_E4",
    label: "Engineering Block E4",
    seedAliases: ["Engineering Block E4"],
  },
  {
    code: "ENG_EA",
    label: "Engineering Block EA",
    seedAliases: ["Engineering Block EA"],
  },
  { code: "FRONTIER", label: "Frontier", seedAliases: ["Frontier"] },
  { code: "TERRACE", label: "Terrace", seedAliases: ["Terrace"] },
  { code: "THE_RIDGE", label: "The Ridge", seedAliases: ["The Ridge"] },
  {
    code: "YIH",
    label: "Yusof Ishak House",
    seedAliases: ["Yusof Ishak House"],
  },
  {
    code: "PGP",
    label: "Prince George's Park",
    seedAliases: ["Prince George's Park", "Prince George’s Park"],
  },
  {
    code: "HSSML",
    label: "Hon Sui Sen Memorial Library",
    seedAliases: ["Hon Sui Sen Memorial Library"],
  },
  {
    code: "MED_SCI_LIBRARY",
    label: "Medicine + Science Library",
    seedAliases: ["Medicine+Science Library"],
  },
  { code: "AS8", label: "Block AS8", seedAliases: ["Blk AS8"] },
  {
    code: "INNOVATION_4_0",
    label: "innovation4.0",
    seedAliases: ["innovation4.0"],
  },
] as const;

export type BuildingCode = (typeof BUILDINGS)[number]["code"];

export interface BuildingOption {
  readonly code: BuildingCode;
  readonly label: string;
}

export const BUILDING_OPTIONS: readonly BuildingOption[] = BUILDINGS.map(
  ({ code, label }) => ({ code, label }),
);

export const BUILDING_CODES: readonly BuildingCode[] = BUILDINGS.map(
  ({ code }) => code,
);

export const BUILDING_CODE_BY_SEED_ALIAS: Readonly<
  Partial<Record<string, BuildingCode>>
> = Object.fromEntries(
  BUILDINGS.flatMap(({ code, seedAliases }) =>
    seedAliases.map((alias) => [alias, code]),
  ),
) as Readonly<Partial<Record<string, BuildingCode>>>;

export const BUILDING_LABEL_BY_CODE: Readonly<Record<BuildingCode, string>> =
  Object.fromEntries(BUILDINGS.map(({ code, label }) => [code, label])) as Record<
    BuildingCode,
    string
  >;
