/**
 * axint.suggest — Apple-native feature advisor.
 *
 * Takes an app description or domain and returns a ranked list of
 * Apple-native features the app should expose. Each suggestion includes
 * the recommended surfaces, complexity estimate, and a ready-to-use
 * prompt for axint.feature.
 */

export interface SuggestInput {
  appDescription: string;
  domain?: string;
  limit?: number;
}

export interface FeatureSuggestion {
  name: string;
  description: string;
  surfaces: Array<"intent" | "view" | "widget">;
  complexity: "low" | "medium" | "high";
  featurePrompt: string;
  domain: string;
}

interface DomainFeatureSet {
  domain: string;
  keywords: string[];
  features: Omit<FeatureSuggestion, "domain">[];
}

const FEATURE_CATALOG: DomainFeatureSet[] = [
  {
    domain: "health",
    keywords: [
      "health",
      "fitness",
      "workout",
      "step",
      "calorie",
      "sleep",
      "water",
      "weight",
      "medication",
      "vitamin",
      "heart",
      "hydration",
      "exercise",
      "running",
      "gym",
      "track",
    ],
    features: [
      {
        name: "Log Workout via Siri",
        description:
          "Let users log workouts with type, duration, and calories through Siri and Shortcuts.",
        surfaces: ["intent", "widget"],
        complexity: "low",
        featurePrompt:
          "Let users log workouts with type, duration, and calories via Siri",
      },
      {
        name: "Daily Step Count Widget",
        description:
          "Home screen widget showing today's step count with a progress ring.",
        surfaces: ["widget"],
        complexity: "low",
        featurePrompt: "Show daily step count with progress on a home screen widget",
      },
      {
        name: "Log Water Intake",
        description:
          "Quick Siri action to log glasses of water with a companion Lock Screen widget.",
        surfaces: ["intent", "widget"],
        complexity: "low",
        featurePrompt:
          "Let users log water intake via Siri with a hydration tracking widget",
      },
      {
        name: "Health Summary View",
        description: "SwiftUI view showing key health metrics in a dashboard layout.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt: "Create a health summary dashboard view with key metrics",
      },
      {
        name: "Log Medication Reminder",
        description:
          "Siri action to log that a medication was taken, with optional reminder scheduling.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users log medication intake via Siri with name and dosage",
      },
      {
        name: "Sleep Tracking Widget",
        description: "Widget displaying last night's sleep duration and quality score.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show last night's sleep duration and quality on a home screen widget",
      },
    ],
  },
  {
    domain: "productivity",
    keywords: [
      "task",
      "note",
      "todo",
      "reminder",
      "calendar",
      "event",
      "schedule",
      "project",
      "bookmark",
      "document",
      "organize",
    ],
    features: [
      {
        name: "Create Task via Siri",
        description:
          "Add tasks with title, due date, and priority through Siri and Shortcuts.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users create tasks with title, due date, and priority via Siri",
      },
      {
        name: "Quick Note from Siri",
        description:
          "Capture a note with title and body through voice, searchable in Spotlight.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users create quick notes via Siri searchable in Spotlight",
      },
      {
        name: "Upcoming Tasks Widget",
        description: "Home screen widget showing the next 3-5 tasks with due dates.",
        surfaces: ["widget"],
        complexity: "low",
        featurePrompt: "Show upcoming tasks with due dates on a home screen widget",
      },
      {
        name: "Create Calendar Event",
        description:
          "Schedule events with title, date, duration, and location through Siri.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt:
          "Let users create calendar events with title, date, and duration via Siri",
      },
      {
        name: "Task Dashboard View",
        description: "SwiftUI view organizing tasks by status with progress indicators.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt: "Create a task dashboard view organized by status with progress",
      },
      {
        name: "Daily Agenda Widget",
        description: "Medium widget combining today's tasks and calendar events.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show today's agenda combining tasks and events on a home screen widget",
      },
    ],
  },
  {
    domain: "finance",
    keywords: [
      "expense",
      "budget",
      "money",
      "payment",
      "transaction",
      "invoice",
      "bill",
      "finance",
      "bank",
      "savings",
      "investment",
      "portfolio",
      "stock",
      "crypto",
    ],
    features: [
      {
        name: "Log Expense via Siri",
        description:
          "Quickly log expenses with amount, category, and note through voice.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users log expenses with amount, category, and note via Siri",
      },
      {
        name: "Budget Overview Widget",
        description:
          "Widget showing remaining budget and spending breakdown for the month.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt: "Show monthly budget remaining and spending breakdown on a widget",
      },
      {
        name: "Quick Transfer",
        description:
          "Initiate a transfer between accounts with amount and description via Siri.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users initiate transfers between accounts via Siri",
      },
      {
        name: "Spending Summary View",
        description: "SwiftUI view with charts breaking down spending by category.",
        surfaces: ["view"],
        complexity: "high",
        featurePrompt: "Create a spending summary view with category breakdown charts",
      },
    ],
  },
  {
    domain: "commerce",
    keywords: [
      "shop",
      "order",
      "cart",
      "product",
      "buy",
      "purchase",
      "checkout",
      "store",
      "retail",
      "ecommerce",
      "delivery",
    ],
    features: [
      {
        name: "Reorder Last Purchase",
        description: "One-tap reorder of a previous purchase through Siri.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users reorder their last purchase via Siri",
      },
      {
        name: "Order Status Widget",
        description: "Widget showing current order status and estimated delivery.",
        surfaces: ["widget"],
        complexity: "low",
        featurePrompt: "Show current order status and delivery estimate on a widget",
      },
      {
        name: "Add to Cart via Siri",
        description: "Add products to cart by name or ID through voice commands.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users add products to their cart by name via Siri",
      },
      {
        name: "Product Search in Spotlight",
        description: "Make products searchable through Spotlight with indexed entities.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Make products searchable in Spotlight with name and price",
      },
    ],
  },
  {
    domain: "media",
    keywords: [
      "music",
      "song",
      "podcast",
      "video",
      "playlist",
      "stream",
      "play",
      "track",
      "album",
      "artist",
      "audio",
      "media",
    ],
    features: [
      {
        name: "Play Content via Siri",
        description: "Play music, podcasts, or videos by name through Siri.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users play content by name via Siri",
      },
      {
        name: "Now Playing Widget",
        description: "Widget showing currently playing track with controls.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt: "Show now-playing track info on a home screen widget",
      },
      {
        name: "Create Playlist via Siri",
        description: "Generate a playlist by mood or genre through voice.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users create a playlist by mood or genre via Siri",
      },
    ],
  },
  {
    domain: "messaging",
    keywords: [
      "message",
      "chat",
      "send",
      "text",
      "email",
      "sms",
      "contact",
      "conversation",
      "communication",
    ],
    features: [
      {
        name: "Send Message via Siri",
        description: "Send messages to contacts through Siri and Shortcuts.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users send messages to contacts via Siri",
      },
      {
        name: "Unread Messages Widget",
        description: "Widget showing unread message count and latest sender.",
        surfaces: ["widget"],
        complexity: "low",
        featurePrompt: "Show unread message count and latest messages on a widget",
      },
      {
        name: "Quick Reply from Siri",
        description: "Reply to the most recent message from a contact through voice.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users reply to recent messages via Siri",
      },
    ],
  },
  {
    domain: "smart-home",
    keywords: [
      "thermostat",
      "light",
      "lock",
      "garage",
      "home",
      "smart",
      "device",
      "temperature",
      "sensor",
      "automation",
      "room",
      "scene",
    ],
    features: [
      {
        name: "Control Device via Siri",
        description: "Turn devices on/off or adjust settings through Siri.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users control smart home devices via Siri",
      },
      {
        name: "Room Status Widget",
        description:
          "Widget showing temperature, humidity, and device states for a room.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt: "Show room temperature and device status on a home screen widget",
      },
      {
        name: "Set Scene via Siri",
        description:
          "Activate a smart home scene (movie night, bedtime, away) through voice.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users activate smart home scenes via Siri",
      },
    ],
  },
  {
    domain: "navigation",
    keywords: [
      "map",
      "direction",
      "navigate",
      "location",
      "route",
      "drive",
      "walk",
      "transit",
      "travel",
      "destination",
      "gps",
      "nearby",
    ],
    features: [
      {
        name: "Navigate to Location",
        description: "Start navigation to an address or saved place through Siri.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users start navigation to a destination via Siri",
      },
      {
        name: "Commute Widget",
        description: "Widget showing estimated commute time and current traffic.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt: "Show commute time and traffic conditions on a home screen widget",
      },
      {
        name: "Save Location via Siri",
        description: "Bookmark the current location or a named place for later.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users save locations for later via Siri",
      },
    ],
  },
];

/**
 * Suggest Apple-native features for an app based on description and domain.
 */
export function suggestFeatures(input: SuggestInput): FeatureSuggestion[] {
  const limit = input.limit || 5;
  const lower = input.appDescription.toLowerCase();
  const explicitDomain = input.domain?.toLowerCase();

  // score each domain by keyword matches
  const domainScores = FEATURE_CATALOG.map((ds) => {
    let score = 0;
    if (explicitDomain === ds.domain) score += 10;
    for (const kw of ds.keywords) {
      if (lower.includes(kw)) score += 1;
    }
    return { ...ds, score };
  })
    .filter((ds) => ds.score > 0)
    .sort((a, b) => b.score - a.score);

  if (domainScores.length === 0) {
    // fallback: return generic productivity suggestions
    const fallback = FEATURE_CATALOG.find((ds) => ds.domain === "productivity");
    if (!fallback) return [];
    return fallback.features.slice(0, limit).map((f) => ({
      ...f,
      domain: "productivity",
    }));
  }

  // collect features from matching domains, prioritizing higher-scored domains
  const suggestions: FeatureSuggestion[] = [];
  const seen = new Set<string>();

  for (const ds of domainScores) {
    for (const feature of ds.features) {
      if (seen.has(feature.name)) continue;
      seen.add(feature.name);
      suggestions.push({ ...feature, domain: ds.domain });
      if (suggestions.length >= limit) break;
    }
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
