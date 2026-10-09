import type { BankAccountType } from "../types";

export interface BankDefinition {
  id: string;
  name: string;
  shortName: string;
  shortcut: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  logoPath: string;
  supportedTypes: BankAccountType[];
}

const RAW_BANKS: Omit<BankDefinition, "shortcut">[] = [
  {
    id: "hdfc",
    name: "HDFC Bank",
    shortName: "HDFC",
    primaryColor: "#004c8f",
    secondaryColor: "#002e5b",
    textColor: "#ffffff",
    logoPath: "/Banks/HDFC.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "sbi",
    name: "State Bank of India",
    shortName: "SBI",
    primaryColor: "#280071",
    secondaryColor: "#1d71b8",
    textColor: "#ffffff",
    logoPath: "/Banks/SBI.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "icici",
    name: "ICICI Bank",
    shortName: "ICICI",
    primaryColor: "#b02a30",
    secondaryColor: "#f37021",
    textColor: "#ffffff",
    logoPath: "/Banks/ICICI.webp",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "axis",
    name: "Axis Bank",
    shortName: "AXIS",
    primaryColor: "#97144d",
    secondaryColor: "#700f38",
    textColor: "#ffffff",
    logoPath: "/Banks/AXIS.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "kotak",
    name: "Kotak Mahindra Bank",
    shortName: "KOTAK",
    primaryColor: "#ed1c24",
    secondaryColor: "#003366",
    textColor: "#ffffff",
    logoPath: "/Banks/KOTAK.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "pnb",
    name: "Punjab National Bank",
    shortName: "PNB",
    primaryColor: "#a20032",
    secondaryColor: "#e3a826",
    textColor: "#ffffff",
    logoPath: "/Banks/PNB.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "bob",
    name: "Bank of Baroda",
    shortName: "BOB",
    primaryColor: "#f26522",
    secondaryColor: "#d94d0c",
    textColor: "#ffffff",
    logoPath: "/Banks/BOB.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "canara",
    name: "Canara Bank",
    shortName: "CANARA",
    primaryColor: "#0091da",
    secondaryColor: "#ffc20e",
    textColor: "#ffffff",
    logoPath: "/Banks/CANARA.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "union",
    name: "Union Bank of India",
    shortName: "UNION",
    primaryColor: "#e31e24",
    secondaryColor: "#005baa",
    textColor: "#ffffff",
    logoPath: "/Banks/UNION.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "indusind",
    name: "IndusInd Bank",
    shortName: "INDUSIND",
    primaryColor: "#8b1d24",
    secondaryColor: "#661318",
    textColor: "#ffffff",
    logoPath: "/Banks/INDUSIND.jpg",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "idfc",
    name: "IDFC FIRST Bank",
    shortName: "IDFC",
    primaryColor: "#9d1d27",
    secondaryColor: "#6e121a",
    textColor: "#ffffff",
    logoPath: "/Banks/IDFC.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "yes",
    name: "YES Bank",
    shortName: "YES",
    primaryColor: "#005696",
    secondaryColor: "#d9232a",
    textColor: "#ffffff",
    logoPath: "/Banks/YES.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "federal",
    name: "Federal Bank",
    shortName: "FEDERAL",
    primaryColor: "#004b87",
    secondaryColor: "#f58220",
    textColor: "#ffffff",
    logoPath: "/Banks/FEDERAL.png",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "rbl",
    name: "RBL Bank",
    shortName: "RBL",
    primaryColor: "#1d2b53",
    secondaryColor: "#ec1c24",
    textColor: "#ffffff",
    logoPath: "/Banks/OTHER.webp",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  },
  {
    id: "standard_chartered",
    name: "Standard Chartered",
    shortName: "SCB",
    primaryColor: "#009944",
    secondaryColor: "#006b32",
    textColor: "#ffffff",
    logoPath: "/Banks/SCB.png",
    supportedTypes: ["debit", "credit"]
  },
  {
    id: "hsbc",
    name: "HSBC India",
    shortName: "HSBC",
    primaryColor: "#db0011",
    secondaryColor: "#333333",
    textColor: "#ffffff",
    logoPath: "/Banks/HSBC.png",
    supportedTypes: ["debit", "credit"]
  },
  {
    id: "cash",
    name: "Cash in Hand",
    shortName: "CASH",
    primaryColor: "#10b981",
    secondaryColor: "#047857",
    textColor: "#ffffff",
    logoPath: "/Banks/CASH.avif",
    supportedTypes: ["cash"]
  },
  {
    id: "other",
    name: "Other Bank",
    shortName: "OTHER",
    primaryColor: "#64748b",
    secondaryColor: "#334155",
    textColor: "#ffffff",
    logoPath: "/Banks/OTHER.webp",
    supportedTypes: ["debit", "credit", "rupay_credit"]
  }
];

export const SUPPORTED_BANKS: BankDefinition[] = RAW_BANKS.map((b) => ({
  ...b,
  shortcut: b.shortName
}));

export const BANK_MAP = new Map<string, BankDefinition>(
  SUPPORTED_BANKS.map((b) => [b.id, b])
);

export function getBankDefinition(identifier?: string | null): BankDefinition {
  if (!identifier) return BANK_MAP.get("other")!;
  const normalized = identifier.trim().toLowerCase();
  
  if (BANK_MAP.has(normalized)) {
    return BANK_MAP.get(normalized)!;
  }
  
  const exact = SUPPORTED_BANKS.find(
    (b) =>
      b.id === normalized ||
      b.shortName.toLowerCase() === normalized ||
      b.name.toLowerCase() === normalized
  );
  if (exact) return exact;

  const partial = SUPPORTED_BANKS.find(
    (b) =>
      normalized.includes(b.shortName.toLowerCase()) ||
      normalized.includes(b.id) ||
      b.name.toLowerCase().includes(normalized)
  );

  return partial || BANK_MAP.get("other")!;
}

export function getAccountTypeLabel(type: BankAccountType): string {
  switch (type) {
    case "debit":
      return "Debit Card";
    case "credit":
      return "Credit Card";
    case "rupay_credit":
      return "RuPay Credit";
    case "cash":
      return "Cash";
    default:
      return type;
  }
}

export function getAccountTypeBadgeColor(type: BankAccountType): { bg: string; text: string; border: string } {
  switch (type) {
    case "debit":
      return { bg: "rgba(59, 130, 246, 0.12)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.25)" };
    case "credit":
      return { bg: "rgba(168, 85, 247, 0.12)", text: "#a855f7", border: "rgba(168, 85, 247, 0.25)" };
    case "rupay_credit":
      return { bg: "rgba(249, 115, 22, 0.12)", text: "#f97316", border: "rgba(249, 115, 22, 0.25)" };
    case "cash":
      return { bg: "rgba(16, 185, 129, 0.12)", text: "#10b981", border: "rgba(16, 185, 129, 0.25)" };
    default:
      return { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8", border: "rgba(148, 163, 184, 0.25)" };
  }
}
