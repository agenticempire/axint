/**
 * axint.suggest — Apple-native feature advisor.
 *
 * Takes an app description or domain and returns a ranked list of
 * Apple-native features the app should expose. Each suggestion includes
 * the recommended surfaces, complexity estimate, and a ready-to-use
 * prompt for axint.feature.
 */

import { requestProSuggestions } from "./pro-intelligence.js";

export interface SuggestInput {
  appDescription: string;
  domain?: string;
  limit?: number;
  mode?: "local" | "auto" | "ai" | "pro";
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "multi";
  audience?: string;
  exclude?: string[];
  goals?: string[];
  stage?: "idea" | "prototype" | "mvp" | "growth" | "enterprise" | "unknown";
  constraints?: string[];
}

export interface FeatureSuggestion {
  name: string;
  description: string;
  surfaces: Array<"intent" | "view" | "widget" | "component" | "app" | "store">;
  complexity: "low" | "medium" | "high";
  featurePrompt: string;
  domain: string;
  rationale?: string;
  confidence?: "low" | "medium" | "high";
  source?: "local" | "pro";
  impact?: string;
  loop?: string;
  nextStep?: string;
}

interface DomainFeatureSet {
  domain: string;
  keywords: string[];
  blockers?: string[];
  features: Omit<FeatureSuggestion, "domain" | "rationale" | "confidence">[];
}

const FEATURE_CATALOG: DomainFeatureSet[] = [
  {
    domain: "collaboration",
    keywords: [
      "swarm",
      "agent",
      "agents",
      "mission",
      "missions",
      "workspace",
      "team",
      "collaboration",
      "coordinate",
      "coordination",
      "project",
      "projects",
      "channel",
      "channels",
      "handoff",
      "handoffs",
      "review",
      "approval",
      "approvals",
      "artifact",
      "artifacts",
      "status",
      "queue",
      "inbox",
      "execution",
      "operator",
      "operators",
      "orchestration",
    ],
    features: [
      {
        name: "Create Mission via Siri",
        description:
          "Let users capture a mission with owner, priority, and due window without leaving their current workflow.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users create a team mission with title, owner, priority, and due window via Siri",
      },
      {
        name: "Mission Status Widget",
        description:
          "Desktop widget showing active missions, blocked work, and the next handoff to review.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show active missions, blocked work, and next handoff in a desktop widget",
      },
      {
        name: "Open Mission Shortcut",
        description:
          "Shortcut that jumps directly into a mission, channel, or artifact by name.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users open a mission, channel, or artifact by name via Siri and Shortcuts",
      },
      {
        name: "Agent Handoff Review",
        description:
          "SwiftUI review surface for agent outputs, decisions, risk flags, and approval state.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt:
          "Create an agent handoff review view with output summary, risk flags, and approval controls",
      },
      {
        name: "Focus Queue View",
        description:
          "A prioritized work queue that separates waiting, ready, blocked, and shipped items.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt:
          "Create a focus queue view for ready, waiting, blocked, and shipped work items",
      },
      {
        name: "Workspace Component Kit",
        description:
          "Reusable SwiftUI components for agent rows, mission cards, approval cards, and context panels.",
        surfaces: ["component"],
        complexity: "medium",
        featurePrompt:
          "Create reusable workspace components for agent rows, mission cards, approval cards, and context panels",
      },
      {
        name: "Shared Mission Store",
        description:
          "Observable store shared by mission views, shortcuts, widgets, and handoff review surfaces.",
        surfaces: ["store", "view", "intent"],
        complexity: "medium",
        featurePrompt:
          "Create a shared mission store with mission items, selected mission state, status updates, and an agent handoff view",
      },
      {
        name: "Daily Operator Brief",
        description:
          "Shortcut that summarizes what changed, what is blocked, and what needs a human decision.",
        surfaces: ["intent", "widget"],
        complexity: "high",
        featurePrompt:
          "Generate a daily operator brief with changes, blockers, and decisions needed",
      },
    ],
  },
  {
    domain: "developer-tools",
    keywords: [
      "developer",
      "developers",
      "code",
      "coding",
      "compiler",
      "repo",
      "repository",
      "github",
      "pull request",
      "pr",
      "xcode",
      "build",
      "test",
      "tests",
      "ci",
      "deploy",
      "deployment",
      "debug",
      "diagnostic",
      "diagnostics",
      "mcp",
      "fix packet",
      "agentic coding",
    ],
    features: [
      {
        name: "Run Project Check",
        description:
          "Shortcut that runs a project validation pass and returns a concise result for the next agent turn.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt:
          "Let users run a project validation check and return a concise pass/fail summary",
      },
      {
        name: "Build Health Widget",
        description:
          "Widget showing latest build, tests, diagnostics, and release readiness.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show latest build, tests, diagnostics, and release readiness in a widget",
      },
      {
        name: "Open Failing Diagnostic",
        description:
          "Shortcut that opens the highest-priority diagnostic, log, or fix packet by name.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users open the highest-priority diagnostic, log, or fix packet by name",
      },
      {
        name: "Release Readiness View",
        description:
          "SwiftUI dashboard for checks, version state, package status, and deployment blockers.",
        surfaces: ["view"],
        complexity: "high",
        featurePrompt:
          "Create a release readiness dashboard with checks, version state, package status, and blockers",
      },
    ],
  },
  {
    domain: "social",
    keywords: [
      "dating",
      "dating match",
      "dating matches",
      "matchmaking",
      "romantic",
      "romance",
      "swipe",
      "dating profile",
      "swolemate",
      "swolemates",
      "tinder",
      "bumble",
      "gym people",
      "fitness dating",
    ],
    blockers: [
      "not dating",
      "not a dating app",
      "nothing to do with dating",
      "not matchmaking",
      "not a matching app",
      "not swolemates",
      "unrelated to swolemates",
      "not romantic",
    ],
    features: [
      {
        name: "Check Matches via Siri",
        description: "Let users ask Siri how many new matches are waiting.",
        surfaces: ["intent", "widget"],
        complexity: "low",
        featurePrompt: "Let users check how many dating matches they have via Siri",
      },
      {
        name: "New Match Widget",
        description: "Home screen widget showing new matches and profile highlights.",
        surfaces: ["widget"],
        complexity: "low",
        featurePrompt: "Show new dating matches on a home screen widget",
      },
      {
        name: "Open Profile Shortcut",
        description: "Shortcut that jumps directly to a matched profile by name.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt: "Let users open a matched dating profile by name via Siri",
      },
      {
        name: "Profile Queue View",
        description: "SwiftUI view for reviewing suggested profiles and match status.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt: "Create a profile queue view for suggested dating matches",
      },
    ],
  },
  {
    domain: "community",
    keywords: [
      "community",
      "members",
      "member",
      "group",
      "groups",
      "club",
      "clubs",
      "event",
      "events",
      "meetup",
      "network",
      "social network",
      "friend",
      "friends",
      "connection",
      "connections",
      "profile",
      "profiles",
    ],
    blockers: [
      "not social",
      "not a social app",
      "not dating",
      "nothing to do with dating",
    ],
    features: [
      {
        name: "Open Member Profile",
        description:
          "Let users open a member, creator, or teammate profile by name from Siri and Shortcuts.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt: "Let users open a member profile by name via Siri and Shortcuts",
      },
      {
        name: "Community Digest Widget",
        description:
          "Widget showing new posts, member activity, and upcoming community moments.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show a community digest with new posts, member activity, and upcoming events",
      },
      {
        name: "Member Directory View",
        description:
          "SwiftUI directory for searching people, roles, tags, and recent activity.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt:
          "Create a member directory view with search, roles, tags, and recent activity",
      },
      {
        name: "Create Community Event",
        description: "Shortcut for adding an event with title, time, location, and host.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt:
          "Let users create a community event with title, time, location, and host",
      },
    ],
  },
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
    blockers: [
      "not a fitness app",
      "not health",
      "not a health app",
      "not workout",
      "not tracking workouts",
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
    domain: "food",
    keywords: [
      "recipe",
      "recipes",
      "cooking",
      "cook",
      "meal",
      "meals",
      "ingredient",
      "ingredients",
      "grocery",
      "groceries",
      "restaurant",
      "kitchen",
      "nutrition",
      "menu",
    ],
    features: [
      {
        name: "Find Recipe via Siri",
        description:
          "Let users search saved recipes by ingredient, meal type, or dietary need.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users find saved recipes by ingredient, meal type, or dietary need via Siri",
      },
      {
        name: "Cooking Timer Shortcut",
        description:
          "Shortcut that starts step-specific timers from a recipe instruction.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt:
          "Let users start a cooking timer for a recipe step via Siri and Shortcuts",
      },
      {
        name: "Meal Plan Widget",
        description:
          "Widget showing today's planned meals, prep status, and missing ingredients.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show today's meal plan, prep status, and missing ingredients in a widget",
      },
      {
        name: "Recipe Detail View",
        description: "SwiftUI recipe view with ingredients, steps, timers, and notes.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt:
          "Create a recipe detail view with ingredients, steps, timers, and notes",
      },
    ],
  },
  {
    domain: "education",
    keywords: [
      "learn",
      "learning",
      "study",
      "student",
      "students",
      "course",
      "lesson",
      "lessons",
      "quiz",
      "flashcard",
      "flashcards",
      "school",
      "teacher",
      "education",
      "homework",
      "practice",
    ],
    features: [
      {
        name: "Start Study Session",
        description:
          "Shortcut that starts a focused study session with subject, duration, and goal.",
        surfaces: ["intent"],
        complexity: "low",
        featurePrompt:
          "Let users start a focused study session with subject, duration, and goal",
      },
      {
        name: "Practice Queue Widget",
        description: "Widget showing due flashcards, next lesson, and streak progress.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt: "Show due flashcards, next lesson, and study streak in a widget",
      },
      {
        name: "Lesson Progress View",
        description:
          "SwiftUI view for lesson steps, completion state, notes, and quiz results.",
        surfaces: ["view"],
        complexity: "medium",
        featurePrompt:
          "Create a lesson progress view with steps, completion state, notes, and quiz results",
      },
    ],
  },
  {
    domain: "creative",
    keywords: [
      "design",
      "designer",
      "creator",
      "creative",
      "photo",
      "photos",
      "image",
      "images",
      "video",
      "edit",
      "editing",
      "portfolio",
      "moodboard",
      "canvas",
      "asset",
      "assets",
      "brand",
    ],
    features: [
      {
        name: "Create Asset Shortcut",
        description:
          "Shortcut that starts a new creative asset with brief, format, and destination.",
        surfaces: ["intent"],
        complexity: "medium",
        featurePrompt:
          "Let users create a new creative asset with brief, format, and destination",
      },
      {
        name: "Review Queue Widget",
        description: "Widget showing assets awaiting feedback, approval, or export.",
        surfaces: ["widget"],
        complexity: "medium",
        featurePrompt:
          "Show creative assets awaiting feedback, approval, or export in a widget",
      },
      {
        name: "Asset Board View",
        description: "SwiftUI board for assets, statuses, comments, and export actions.",
        surfaces: ["view"],
        complexity: "high",
        featurePrompt:
          "Create an asset board view with statuses, comments, and export actions",
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
  const limit = clampLimit(input.limit);
  const text = normalizeText(input.appDescription);
  const excludedText = normalizeText((input.exclude ?? []).join(" "));
  const explicitDomain = normalizeDomain(input.domain);
  const strongestDescriptionScore = Math.max(
    ...FEATURE_CATALOG.map((ds) => domainDescriptionScore(text, ds))
  );

  const ranked = FEATURE_CATALOG.flatMap((domainSet) => {
    if (isBlocked(text, domainSet.blockers)) return [];
    if (isExcluded(text, excludedText, domainSet.domain)) return [];

    const descriptionScore = domainDescriptionScore(text, domainSet);
    const explicitBoost =
      explicitDomain === domainSet.domain && strongestDescriptionScore < 2 ? 1.5 : 0;
    const domainScore = descriptionScore + explicitBoost;

    if (domainScore <= 0) return [];

    return domainSet.features.flatMap((feature, index) => {
      if (isFeatureExcluded(feature, excludedText)) return [];
      const featureScore = featureRelevanceScore(text, feature);
      const score = domainScore * 10 + featureScore * 3 - index * 0.15;
      return [
        {
          suggestion: {
            ...feature,
            domain: domainSet.domain,
            rationale: buildRationale(domainSet.domain, descriptionScore, text),
            confidence: confidenceFor(score),
            source: "local",
          } satisfies FeatureSuggestion,
          score,
        },
      ];
    });
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const suggestions: FeatureSuggestion[] = [];
  const seen = new Set<string>();

  for (const entry of ranked) {
    if (seen.has(entry.suggestion.name)) continue;
    seen.add(entry.suggestion.name);
    suggestions.push(entry.suggestion);
    if (suggestions.length >= limit) break;
  }

  if (suggestions.length > 0) {
    const dynamic = !explicitDomain ? appSpecificFallbackSuggestions(text, limit) : [];
    if (strongestDescriptionScore < 2 && dynamic.length > 0) return dynamic;
    return suggestions;
  }

  return fallbackSuggestions(limit, explicitDomain, text);
}

/**
 * Suggest features with an optional Pro strategy pass.
 *
 * Local mode is deterministic and performs no network requests. Pro mode is
 * opt-in via input.mode or AXINT_SUGGEST_MODE and calls an authenticated Axint
 * Pro endpoint. Proprietary prompts, strategy packs, model routing, and
 * customer-specific learning stay server-side; the OSS compiler only sends a
 * sanitized request and falls back to local suggestions.
 */
export async function suggestFeaturesSmart(
  input: SuggestInput
): Promise<FeatureSuggestion[]> {
  const localSuggestions = suggestFeatures(input);
  const pro = await requestProSuggestions(input, localSuggestions);
  return pro.status === "used" ? pro.suggestions : localSuggestions;
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.filter((kw) => hasKeyword(text, kw)).length;
}

function domainDescriptionScore(text: string, domainSet: DomainFeatureSet): number {
  const base = keywordScore(text, domainSet.keywords);
  const domainNameBonus = hasKeyword(text, domainSet.domain) ? 1 : 0;
  return base + domainNameBonus;
}

function featureRelevanceScore(
  text: string,
  feature: Omit<FeatureSuggestion, "domain" | "rationale" | "confidence">
): number {
  const featureText = normalizeText(
    `${feature.name} ${feature.description} ${feature.featurePrompt}`
  );
  const appTokens = meaningfulTokens(text);
  if (appTokens.length === 0) return 0;
  return appTokens.filter((token) => hasKeyword(featureText, token)).length;
}

function fallbackSuggestions(
  limit: number,
  explicitDomain?: string,
  normalizedAppDescription = ""
): FeatureSuggestion[] {
  const dynamic = appSpecificFallbackSuggestions(normalizedAppDescription, limit);
  if (dynamic.length > 0) return dynamic;

  const fallback =
    FEATURE_CATALOG.find((ds) => ds.domain === explicitDomain) ??
    FEATURE_CATALOG.find((ds) => ds.domain === "collaboration") ??
    FEATURE_CATALOG.find((ds) => ds.domain === "productivity");

  if (!fallback) return [];

  return fallback.features.slice(0, limit).map((feature) => ({
    ...feature,
    domain: fallback.domain,
    rationale:
      fallback.domain === explicitDomain
        ? `Using the provided ${fallback.domain} domain as a weak hint because the description is broad.`
        : "Using broadly useful Apple-native workflow suggestions because the description is broad.",
    confidence: "low",
    source: "local",
  }));
}

function appSpecificFallbackSuggestions(
  normalizedAppDescription: string,
  limit: number
): FeatureSuggestion[] {
  const tokens = meaningfulTokens(normalizedAppDescription).filter(
    (token) =>
      ![
        "help",
        "helps",
        "user",
        "utility",
        "organized",
        "organize",
        "general",
        "native",
        "apple",
      ].includes(token)
  );
  if (tokens.length < 2) return [];

  const concept = titleCase(tokens.slice(0, 3).join(" "));
  const lowerConcept = concept.toLowerCase();
  const rationale =
    "No stock domain strongly matched, so Axint generated app-specific Apple-native surfaces from the current app description instead of falling back to a generic domain.";

  const suggestions: FeatureSuggestion[] = [
    {
      name: `Capture ${concept}`,
      description: `Let users capture a new ${lowerConcept} item from Siri, Shortcuts, or the action button without breaking flow.`,
      surfaces: ["intent"],
      complexity: "low",
      featurePrompt: `Let users capture a new ${lowerConcept} item with title, notes, and priority via Siri and Shortcuts`,
      domain: "custom",
      rationale,
      confidence: "medium",
      source: "local",
    },
    {
      name: `${concept} Brief Widget`,
      description: `Widget that summarizes the latest ${lowerConcept} state, blockers, and next action.`,
      surfaces: ["widget"],
      complexity: "medium",
      featurePrompt: `Show the latest ${lowerConcept} state, blockers, and next action in a widget`,
      domain: "custom",
      rationale,
      confidence: "medium",
      source: "local",
    },
    {
      name: `${concept} Review View`,
      description: `SwiftUI review surface for scanning ${lowerConcept} details, status, and follow-up actions.`,
      surfaces: ["view"],
      complexity: "medium",
      featurePrompt: `Create a ${lowerConcept} review view with status, details, and follow-up actions`,
      domain: "custom",
      rationale,
      confidence: "medium",
      source: "local",
    },
  ];

  return suggestions.slice(0, limit);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function normalizeDomain(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().trim();
}

function clampLimit(value?: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(12, Math.floor(value ?? 5)));
}

function isBlocked(text: string, blockers?: string[]): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((blocker) => hasKeyword(text, blocker));
}

function isExcluded(text: string, excludedText: string, domain: string): boolean {
  if (!excludedText) return false;
  return hasKeyword(excludedText, domain) || hasKeyword(text, `not ${domain}`);
}

function isFeatureExcluded(
  feature: Omit<FeatureSuggestion, "domain" | "rationale" | "confidence">,
  excludedText: string
): boolean {
  if (!excludedText) return false;
  const featureText = normalizeText(
    `${feature.name} ${feature.description} ${feature.featurePrompt}`
  );
  return meaningfulTokens(excludedText).some((token) => hasKeyword(featureText, token));
}

function hasKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix =
    normalizedKeyword.length > 3 &&
    !normalizedKeyword.includes(" ") &&
    !normalizedKeyword.includes("-") &&
    !normalizedKeyword.endsWith("s")
      ? "(?:s|es)?"
      : "";
  return new RegExp(`(^|[^a-z0-9])${escaped}${suffix}([^a-z0-9]|$)`, "i").test(text);
}

function meaningfulTokens(text: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "app",
    "as",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
    "users",
  ]);

  return Array.from(
    new Set(
      text
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !stopWords.has(token))
    )
  );
}

function buildRationale(
  domain: string,
  descriptionScore: number,
  normalizedAppDescription: string
): string {
  const cues = meaningfulTokens(normalizedAppDescription)
    .filter((token) => token.length > 3)
    .slice(0, 4);
  const cueText = cues.length > 0 ? ` from cues like ${cues.join(", ")}` : "";
  if (descriptionScore >= 3) {
    return `Strong match for ${domain} workflows${cueText}.`;
  }
  if (descriptionScore >= 1) {
    return `Matched ${domain} cues${cueText}.`;
  }
  return `Included from a weak ${domain} hint; validate fit before generating.`;
}

function confidenceFor(score: number): "low" | "medium" | "high" {
  if (score >= 35) return "high";
  if (score >= 15) return "medium";
  return "low";
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
