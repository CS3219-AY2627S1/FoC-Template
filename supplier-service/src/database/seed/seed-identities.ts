/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: recorded explicit durable IDs and source guards for the 21 approved Supplier seed rows.
 * Author review: Reviewed and approved by @ron.
 */
import { BuildingCode } from "../../domain/buildings";

export interface SeedSourceIdentity {
  sourceCategoryValue: string;
  buildingCode: BuildingCode;
  floor: string | null;
  latitude: string | null;
  longitude: string | null;
  opensAt: string;
  closesAt: string;
  imagePath: string | null;
}

interface SeedIdentityManifestEntry {
  id: string;
  expectedSourceIdentity: SeedSourceIdentity;
}

/**
 * Entries intentionally follow CSV row order. IDs are literal and remain unchanged
 * when editable Supplier text changes. The source guard makes a reordered or
 * unexpectedly changed CSV fail instead of assigning an ID to the wrong origin.
 */
export const SUPPLIER_SEED_IDENTITIES = [
  {
    id: "bdee8954-e570-58cf-a813-0ab36a084296",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "CENTRAL_LIBRARY",
      floor: "1",
      latitude: "1.296444",
      longitude: "103.773032",
      opensAt: "09:00",
      closesAt: "18:00",
      imagePath: "/assets/suppliers/ANNA.jpeg",
    },
  },
  {
    id: "5061f9ec-5fba-5119-888e-dfeeaefdb727",
    expectedSourceIdentity: {
      sourceCategoryValue: "Shopping",
      buildingCode: "CENTRAL_LIBRARY",
      floor: "1",
      latitude: "1.2967866",
      longitude: "103.7732677",
      opensAt: "09:00",
      closesAt: "16:00",
      imagePath: "/assets/suppliers/NUS_COOP.jpeg",
    },
  },
  {
    id: "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
    expectedSourceIdentity: {
      sourceCategoryValue: "Printing",
      buildingCode: "COM2",
      floor: "1",
      latitude: "1.2938347",
      longitude: "103.7744572",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
    },
  },
  {
    id: "026f5e8d-f3b2-5219-9243-1005fc58a15f",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "COM2",
      floor: "1",
      latitude: "1.2940156",
      longitude: "103.7738478",
      opensAt: "09:00",
      closesAt: "21:30",
      imagePath: "/assets/suppliers/COOL_SPOT.jpeg",
    },
  },
  {
    id: "9a414611-efb5-58ce-834a-d073268f6320",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "TERRACE",
      floor: "1",
      latitude: "1.2938898",
      longitude: "103.7736305",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/INSTACHEF.jpeg",
    },
  },
  {
    id: "109e03a6-5712-5106-8ef3-7281c4ec4411",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food/Coffee",
      buildingCode: "CENTRAL_LIBRARY",
      floor: "1",
      latitude: "1.296444",
      longitude: "103.773032",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/ROBOT_CAFE.jpeg",
    },
  },
  {
    id: "80e13319-4cc1-519c-b65a-ed507c4ce52a",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "PGP",
      floor: "2",
      latitude: "1.2908445",
      longitude: "103.7770891",
      opensAt: "11:00",
      closesAt: "21:30",
      imagePath: null,
    },
  },
  {
    id: "88285a19-410c-5c01-8d0a-d11303c96f05",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "ENG_E4",
      floor: "4",
      latitude: "1.2991517",
      longitude: "103.769064",
      opensAt: "08:00",
      closesAt: "18:00",
      imagePath: null,
    },
  },
  {
    id: "5ac9edfb-c7a1-59f1-95af-618cb781779a",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "THE_RIDGE",
      floor: "1",
      latitude: "1.2946778",
      longitude: "103.7707872",
      opensAt: "08:00",
      closesAt: "21:00",
      imagePath: null,
    },
  },
  {
    id: "a80b6a33-26d3-59e3-88fd-66d5ad3ff5db",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "YIH",
      floor: "1",
      latitude: "1.2984401",
      longitude: "103.7726256",
      opensAt: "08:00",
      closesAt: "20:00",
      imagePath: null,
    },
  },
  {
    id: "3f69f58a-3aa2-5aa2-aff3-1cafbb7fd511",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "FRONTIER",
      floor: "1",
      latitude: "1.2947819",
      longitude: "103.7704435",
      opensAt: "09:30",
      closesAt: "19:30",
      imagePath: null,
    },
  },
  {
    id: "d0fa8779-cf39-5de7-8e6d-19c5d19aa41d",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food/Coffee",
      buildingCode: "HSSML",
      floor: "2",
      latitude: "1.2931259",
      longitude: "103.7719943",
      opensAt: "08:15",
      closesAt: "18:00",
      imagePath: null,
    },
  },
  {
    id: "fc22c02d-8258-57fb-b024-d2faa3f69077",
    expectedSourceIdentity: {
      sourceCategoryValue: "Shopping",
      buildingCode: "PGP",
      floor: "2",
      latitude: "1.2904347",
      longitude: "103.7787588",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: null,
    },
  },
  {
    id: "9b2e05a2-f051-557f-baba-f7c1d0b9b085",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "COM3",
      floor: "1",
      latitude: "1.2948308",
      longitude: "103.7716305",
      opensAt: "11:00",
      closesAt: "21:00",
      imagePath: null,
    },
  },
  {
    id: "dc838b44-4b7b-5b42-8433-d3c547e5fe2e",
    expectedSourceIdentity: {
      sourceCategoryValue: "Printing",
      buildingCode: "YIH",
      floor: "5",
      latitude: "1.2984905",
      longitude: "103.7720544",
      opensAt: "09:00",
      closesAt: "18:00",
      imagePath: null,
    },
  },
  {
    id: "cb1573db-6f16-5d6c-aaa5-e94ce3e1a48e",
    expectedSourceIdentity: {
      sourceCategoryValue: "Shopping",
      buildingCode: "ENG_E3",
      floor: "4",
      latitude: "1.2994341",
      longitude: "103.7526298",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: null,
    },
  },
  {
    id: "39a484ac-cf33-57b1-b9a4-83f219bda953",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "INNOVATION_4_0",
      floor: "1",
      latitude: "1.2942982",
      longitude: "103.7708813",
      opensAt: "08:00",
      closesAt: "17:30",
      imagePath: null,
    },
  },
  {
    id: "b4742471-feaf-5444-bf12-af909a9ae8d8",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food",
      buildingCode: "PGP",
      floor: "1",
      latitude: "1.2913847",
      longitude: "103.7776367",
      opensAt: "11:00",
      closesAt: "02:00",
      imagePath: null,
    },
  },
  {
    id: "0b665545-94f2-5000-a20a-abbe3730cbcd",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food/Coffee",
      buildingCode: "MED_SCI_LIBRARY",
      floor: "1",
      latitude: "1.2967989",
      longitude: "103.7794336",
      opensAt: "07:30",
      closesAt: "18:30",
      imagePath: null,
    },
  },
  {
    id: "06561ef4-9989-5d4b-bc41-2f4ae8ece8e3",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food/Coffee",
      buildingCode: "AS8",
      floor: "1",
      latitude: "1.296252229",
      longitude: "103.7720926",
      opensAt: "08:00",
      closesAt: "17:30",
      imagePath: null,
    },
  },
  {
    id: "7807a5fa-2e87-5d25-9d68-01ed78223660",
    expectedSourceIdentity: {
      sourceCategoryValue: "Food/Coffee",
      buildingCode: "ENG_EA",
      floor: "1",
      latitude: "1.300566804",
      longitude: "103.7707577",
      opensAt: "08:00",
      closesAt: "17:00",
      imagePath: null,
    },
  },
] as const satisfies readonly SeedIdentityManifestEntry[];
