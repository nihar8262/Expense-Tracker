import type { CategoryIconId, CategoryOption } from "../types";

export const defaultCategoryOptions: CategoryOption[] = [
  { id: "groceries", label: "Groceries", icon: "cart-shopping" },
  { id: "food", label: "Food", icon: "utensils" },
  { id: "travel", label: "Travel", icon: "plane" },
  { id: "shopping", label: "Shopping", icon: "bag-shopping" },
  { id: "bills", label: "Bills", icon: "file-invoice-dollar" },
  { id: "health", label: "Health", icon: "heart-pulse" },
  { id: "entertainment", label: "Entertainment", icon: "film" },
  { id: "work", label: "Work", icon: "briefcase" },
  { id: "others", label: "Others", icon: "tag" }
];

const ICON_KEYWORD_MAP: Array<{ keywords: RegExp; icon: string }> = [
  { keywords: /grocer|supermarket|market|produce|vegetable|fruit/i, icon: "cart-shopping" },
  { keywords: /food|eat|restaur|dining|lunch|dinner|breakfast|cafe|snack|pizza|burger|meal|cook|kitchen/i, icon: "utensils" },
  { keywords: /coffee|cafe|latte|espresso|cappuccino/i, icon: "coffee" },
  { keywords: /drink|wine|beer|alcohol|bar|pub|cocktail/i, icon: "wine-glass" },
  { keywords: /travel|trip|vacation|holiday|tour|abroad/i, icon: "suitcase" },
  { keywords: /flight|airline|airfare|airport|fly/i, icon: "plane" },
  { keywords: /hotel|motel|hostel|accommodation|lodg/i, icon: "hotel" },
  { keywords: /train|rail|metro|subway/i, icon: "train" },
  { keywords: /bus|coach|transit/i, icon: "bus" },
  { keywords: /car|auto|vehicle|taxi|uber|lyft|ride/i, icon: "car" },
  { keywords: /fuel|petrol|gas pump|gasoline/i, icon: "gas-pump" },
  { keywords: /motorcycle|bike scoot/i, icon: "motorcycle" },
  { keywords: /bicycle|cycling/i, icon: "bicycle" },
  { keywords: /shop|cloth|fashion|apparel|boutique|wear|outfit/i, icon: "bag-shopping" },
  { keywords: /shirt|tshirt|dress|pants|shoes/i, icon: "shirt" },
  { keywords: /bill|utilit|electric|water|gas|internet|phone|subscription|rent|mortgage|insurance|emi/i, icon: "file-invoice-dollar" },
  { keywords: /wifi|broadband|data plan/i, icon: "wifi" },
  { keywords: /health|medical|doctor|hospital|clinic|pharmac|medicine|dental|prescription/i, icon: "heart-pulse" },
  { keywords: /gym|fitness|workout|exercise/i, icon: "dumbbell" },
  { keywords: /spa|salon|massage|beauty|cosmetic|hair|nail/i, icon: "spa" },
  { keywords: /surgery|syringe|inject|vaccine/i, icon: "syringe" },
  { keywords: /pills?|tablet|vitamin|supplement/i, icon: "pills" },
  { keywords: /stethoscope|checkup|physio/i, icon: "stethoscope" },
  { keywords: /entertain|movie|cinema|film|stream|netflix|hulu|disney|spotify/i, icon: "film" },
  { keywords: /music|concert|gig|band/i, icon: "music" },
  { keywords: /game|gaming|esport|playstation|xbox/i, icon: "gamepad" },
  { keywords: /sport|football|soccer|basketball|tennis|cricket|rugby|swim/i, icon: "basketball" },
  { keywords: /work|office|business|professional|career|salary|freelance/i, icon: "briefcase" },
  { keywords: /laptop|computer|pc|mac|desktop/i, icon: "laptop" },
  { keywords: /phone|mobile|iphone|android|smartphone/i, icon: "mobile-screen" },
  { keywords: /tv|television|monitor/i, icon: "tv" },
  { keywords: /headphone|earphone|airpod|audio/i, icon: "headphones" },
  { keywords: /camera|photo|photography/i, icon: "camera" },
  { keywords: /education|school|college|university|course|tuition|class|learn/i, icon: "graduation-cap" },
  { keywords: /book|reading|library|novel/i, icon: "book" },
  { keywords: /gift|present|birthday|anniversary|celebration/i, icon: "gift" },
  { keywords: /charity|donation|donate|ngo|volunteer/i, icon: "hand-holding-heart" },
  { keywords: /home|house|furniture|decor|appliance|interior|flat/i, icon: "house" },
  { keywords: /repair|fix|tool|hardware|maintenance/i, icon: "tools" },
  { keywords: /tax|government|fine|penalty|fee|legal/i, icon: "landmark" },
  { keywords: /invest|stock|mutual|crypto|finance|saving|portfolio/i, icon: "chart-line" },
  { keywords: /cash|money|wallet|withdrawal/i, icon: "money-bill" },
  { keywords: /store|shop|market|mall/i, icon: "store" }
];

export function suggestFaIcon(label: string): string {
  for (const entry of ICON_KEYWORD_MAP) {
    if (entry.keywords.test(label)) {
      return entry.icon;
    }
  }
  return "tag";
}

export function slugifyCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-category";
}

export function resolveCategoryIcon(categoryLabel: string, categoryOptions: CategoryOption[]): CategoryIconId {
  return categoryOptions.find((option) => option.label.toLowerCase() === categoryLabel.trim().toLowerCase())?.icon ?? "other";
}
