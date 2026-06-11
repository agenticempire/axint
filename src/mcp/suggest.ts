/**
 * axint.suggest — Apple-native feature advisor.
 *
 * Takes an app description or domain and returns a ranked list of
 * Apple-native features the app should expose. Each suggestion includes
 * the recommended surfaces, complexity estimate, and a ready-to-use
 * prompt for axint.feature.
 */

import { requestProSuggestions } from "./pro-intelligence.js";
import { semanticLabels } from "./semantic-planner.js";
import { analyzeAppleRepairTask } from "../repair/intelligence.js";

export interface SuggestInput {
  appDescription: string;
  domain?: string;
  limit?: number;
  mode?: "local" | "auto" | "ai" | "pro";
  platform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "multi";
  audience?: string;
  cwd?: string;
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
  modeTrace?: string;
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
  const freshProductMode = detectFreshProductMode(input, text);
  const greenfieldAppMode = detectGreenfieldAppMode(input, text);
  const productHierarchyMode = detectProductHierarchyMode(input, text);
  const additiveFeatureMode = detectAdditiveFeatureMode(input, text);
  const releasePreflightMode = detectReleasePreflightMode(input, text);
  const axintDogfoodMode = detectAxintDogfoodMode(input, text);

  if (freshProductMode?.kind === "public-page") {
    return publicLanderSuggestions(input, text, limit, freshProductMode.trace);
  }
  if (freshProductMode?.kind === "brand-polish") {
    return brandPolishSuggestions(input, text, limit, freshProductMode.trace);
  }
  if (axintDogfoodMode) {
    return axintDogfoodSuggestions(input, text, limit, axintDogfoodMode.trace);
  }
  if (greenfieldAppMode) {
    return greenfieldAppSuggestions(input, text, limit, greenfieldAppMode.trace);
  }
  if (productHierarchyMode) {
    return productHierarchySuggestions(input, text, limit, productHierarchyMode.trace);
  }
  if (additiveFeatureMode) {
    return additiveFeatureSuggestions(input, text, limit, additiveFeatureMode.trace);
  }
  if (releasePreflightMode) {
    return releasePreflightSuggestions(input, text, limit, releasePreflightMode.trace);
  }

  if (looksLikeExistingProductRepair(input, text)) {
    return existingProductRepairSuggestions(input, text, limit);
  }

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
    const adaptive = adaptiveSemanticSuggestions(
      input,
      text,
      suggestions[0]?.domain ?? explicitDomain ?? "custom",
      limit
    );
    return mergeSuggestions(
      shouldLeadWithAdaptive(text, strongestDescriptionScore)
        ? [...adaptive, ...suggestions]
        : [...suggestions, ...adaptive],
      limit
    );
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

type FreshProductMode =
  | {
      kind: "public-page";
      trace: string;
    }
  | {
      kind: "brand-polish";
      trace: string;
    }
  | undefined;

type GreenfieldAppMode =
  | {
      trace: string;
    }
  | undefined;

type ProductHierarchyMode =
  | {
      trace: string;
    }
  | undefined;

type AdditiveFeatureMode =
  | {
      trace: string;
    }
  | undefined;

type ReleasePreflightMode =
  | {
      trace: string;
    }
  | undefined;

type AxintDogfoodMode =
  | {
      trace: string;
    }
  | undefined;

function detectAxintDogfoodMode(
  input: SuggestInput,
  normalizedAppDescription: string
): AxintDogfoodMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const axintCues = [
    "axint",
    "cloud check",
    "mcp",
    "mcp version",
    "workflow check",
    "fix packet",
    "ax001",
    "dogfood",
    "dogfooding",
    "non-apple artifact",
    "non apple artifact",
    "version metadata",
    "version truth",
    "release script",
    "generic feature scaffold",
    "classifier",
    "cadabra dogfood",
  ].filter((cue) => hasKeyword(combined, cue));

  const toolingIntent = [
    "atom",
    "atoms",
    "classify",
    "classified",
    "fix",
    "misclassified",
    "misclassification",
    "prevent",
    "route",
    "routing",
    "stale",
    "sync",
    "version",
  ].some((cue) => hasKeyword(combined, cue));

  if (axintCues.length < 2 || !toolingIntent) return undefined;

  const cueList = axintCues.slice(0, 6).join(", ");
  return {
    trace: `Current prompt won as Axint dogfood/tooling work (${cueList}); Axint is repairing its own classifier, Cloud Check, and version-truth atoms instead of mapping provider words to an app image-provider repair.`,
  };
}

function detectFreshProductMode(
  input: SuggestInput,
  normalizedAppDescription: string
): FreshProductMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const publicPageCues = [
    ".axint",
    "custom lander",
    "custom startup landing page",
    "landing page",
    "startup landing",
    "public lander",
    "public page",
    "public project page",
    "profile page",
    "project profile",
    "project page",
    "premium public project page",
    "page manifest",
    "module manifest",
    "brand",
    "brand asset",
    "programmable module",
    "programmable modules",
    "shareable launch card",
    "share card",
    "share cards",
    "custom share card",
    "customize share card",
    "customize share cards",
    "install qr",
    "qr block",
    "qr blocks",
    "email capture",
    "safe customization",
  ].filter((cue) => hasKeyword(combined, cue));

  const buildIntent = [
    "add",
    "become",
    "build",
    "create",
    "design",
    "generate",
    "make",
    "ship",
    "turn into",
    "upgrade into",
  ].some((cue) => hasKeyword(combined, cue));

  const staleContextHint = [
    "older repair",
    "previous repair",
    "repair notes",
    "stale",
    "old context",
    "previous context",
  ].some((cue) => hasKeyword(combined, cue));

  if (publicPageCues.length >= 2 && (buildIntent || staleContextHint)) {
    const cueList = publicPageCues.slice(0, 5).join(", ");
    return {
      kind: "public-page",
      trace: `Current prompt won because it contains fresh public-page cues (${cueList}); repair words are treated as constraints unless the user asks to fix a broken existing screen.`,
    };
  }

  const brandCues = [
    "official mark",
    "symbol mark",
    "wordmark",
    "brand accuracy",
    "brand asset",
    "wrong brand",
    "wrong logo",
    "wrong symbol",
    "hand-drawn symbol",
    "profile identity",
    "brand kit",
    "axint.ai",
  ].filter((cue) => hasKeyword(combined, cue));

  const brandIntent = [
    "needs",
    "replace",
    "use",
    "keep",
    "remove",
    "preserve",
    "make premium",
    "repair",
    "polish",
  ].some((cue) => hasKeyword(combined, cue));

  if (brandCues.length >= 2 && brandIntent) {
    const cueList = brandCues.slice(0, 5).join(", ");
    return {
      kind: "brand-polish",
      trace: `Current prompt won because it contains brand/provenance cues (${cueList}); Axint is treating this as existing-product brand polish, not fresh feature brainstorming.`,
    };
  }

  return undefined;
}

function detectProductHierarchyMode(
  input: SuggestInput,
  normalizedAppDescription: string
): ProductHierarchyMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const hierarchyCues = [
    "app display name",
    "better outfit wild",
    "better / outfit / wild",
    "default lane",
    "default surface",
    "display name",
    "dogfood controls",
    "feedback buttons",
    "hide advanced",
    "installed app display name",
    "launch promise",
    "magic level",
    "preset lanes",
    "product hierarchy",
    "public vocabulary",
    "result feedback",
    "the photo they would actually post",
    "version triple-tap",
    "viral-product hierarchy",
  ].filter((cue) => hasKeyword(combined, cue));

  const hierarchyIntent = [
    "add",
    "hide",
    "make",
    "rename",
    "reorganize",
    "rewrite",
    "simplify",
    "turn into",
  ].some((cue) => hasKeyword(combined, cue));

  if (hierarchyCues.length < 3 || !hierarchyIntent) return undefined;

  const cueList = hierarchyCues.slice(0, 6).join(", ");
  return {
    trace: `Current prompt won as product hierarchy work (${cueList}); Axint is planning public vocabulary, default lanes, feedback signals, and provider semantics instead of narrowing the task to Magic Pass controls or stale repair.`,
  };
}

function detectAdditiveFeatureMode(
  input: SuggestInput,
  normalizedAppDescription: string
): AdditiveFeatureMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const additiveIntent = [
    "add",
    "build",
    "create",
    "enable",
    "expose",
    "introduce",
    "let users choose",
    "make",
    "route",
    "select",
    "surface",
    "wire",
  ].some((cue) => hasKeyword(combined, cue));

  const controlCues = [
    "new control surface",
    "control surface",
    "controls",
    "picker",
    "toggle",
    "model tier",
    "quality tier",
    "fast",
    "pro",
    "perfect",
    "magic pass",
    "magic strength",
    "glow-up",
    "glow up",
    "backdrop",
    "background",
    "creative direction",
    "prompt builder",
    "provider routing",
    "settings captured",
    "nano banana",
    "image generation",
  ].filter((cue) => hasKeyword(combined, cue));

  const explicitRepair = [
    "bug",
    "broken",
    "crash",
    "failed",
    "failing",
    "fix",
    "not working",
    "regression",
    "repair",
    "runtime freeze",
  ].some((cue) => hasKeyword(combined, cue));

  const negatedRepairCue =
    /\bnot\s+(?:a|an|the)?\s*(?:stale\s+|swiftui\s+|scroll\s+|layout\s+|runtime\s+|existing\s+|generic\s+)*(?:or\s+)?(?:stale\s+|swiftui\s+|scroll\s+|layout\s+|runtime\s+|existing\s+|generic\s+)*repair\b/.test(
      combined
    ) || /\bnot\s+.*\brepair\b/.test(combined);
  const explicitAdditiveOverride =
    negatedRepairCue ||
    [
      "not a repair",
      "new control surface",
      "new controls",
      "add controls",
      "add a control",
    ].some((cue) => hasKeyword(combined, cue));

  if (!additiveIntent) return undefined;
  if (explicitRepair && !explicitAdditiveOverride) return undefined;
  if (controlCues.length < 2) return undefined;

  const cueList = controlCues.slice(0, 6).join(", ");
  return {
    trace: `Current prompt won as additive feature work (${cueList}); Axint is planning a new control surface and provider contract instead of treating the request as a stale SwiftUI repair.`,
  };
}

function detectReleasePreflightMode(
  input: SuggestInput,
  normalizedAppDescription: string
): ReleasePreflightMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const releaseCues = [
    "app store connect",
    "asc",
    "testflight",
    "test flight",
    "app record",
    "missing app",
    "bundle id",
    "bundle identifier",
    "archive",
    "xcarchive",
    "exportoptions",
    "export options",
    "exportoptions-testflight.plist",
    "export-options",
    "upload",
    "distribution",
    "release metadata",
    "release preflight",
    "deployment metadata",
    "build number",
    "version number",
    "signing",
    "provisioning",
  ].filter((cue) => hasKeyword(combined, cue));

  const releaseIntent = [
    "blocked",
    "cannot upload",
    "failed",
    "failing",
    "fix",
    "missing",
    "preflight",
    "prep",
    "repair",
    "ship",
    "upload",
    "validate",
    "verify",
  ].some((cue) => hasKeyword(combined, cue));

  const explicitFreshFeature =
    /\b(create|generate|scaffold|build)\s+(?:a|an|new)\s+(?:app|screen|view|intent|widget|feature)\b/.test(
      combined
    );

  if (releaseCues.length < 2 || !releaseIntent || explicitFreshFeature) {
    return undefined;
  }

  const cueList = releaseCues.slice(0, 6).join(", ");
  return {
    trace: `Current prompt won as release-preflight work (${cueList}); Axint is planning App Store/TestFlight proof and metadata repair instead of inventing new Siri/widget surfaces.`,
  };
}

function detectGreenfieldAppMode(
  input: SuggestInput,
  normalizedAppDescription: string
): GreenfieldAppMode {
  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const strongGreenfieldCues = [
    "from scratch",
    "greenfield",
    "mvp",
    "minimum viable",
    "native mvp",
    "new app",
    "new native app",
    "first version",
    "full app",
    "starter app",
    "three page app",
    "3 page app",
  ].filter((cue) => hasKeyword(combined, cue));

  const buildIntent = [
    "build",
    "create",
    "generate",
    "make",
    "scaffold",
    "ship",
    "start",
  ].some((cue) => hasKeyword(combined, cue));

  const appleAppCues = [
    "apple app",
    "ios app",
    "iphone app",
    "mac app",
    "macos app",
    "native app",
    "swiftui",
    "xcode",
  ].filter((cue) => hasKeyword(combined, cue));

  const stageSupportsGreenfield =
    input.stage === "idea" || input.stage === "prototype" || input.stage === "mvp";

  const explicitRepair = [
    "bug",
    "broken",
    "failed",
    "failing",
    "fix",
    "not working",
    "regression",
    "repair",
  ].some((cue) => hasKeyword(combined, cue));

  const strongGreenfield = strongGreenfieldCues.length > 0;
  const appish = appleAppCues.length > 0 || hasKeyword(combined, "app");

  if (!buildIntent) return undefined;
  if (explicitRepair && !strongGreenfield) return undefined;
  if (!strongGreenfield && !(stageSupportsGreenfield && appish)) return undefined;

  const cueList = [...strongGreenfieldCues, ...appleAppCues].slice(0, 5).join(", ");
  return {
    trace: `Current prompt won as a greenfield app build${cueList ? ` (${cueList})` : ""}; Axint is planning an app spine, state model, preview flow, and proof harness instead of reusing stale repair context.`,
  };
}

function greenfieldAppSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 4);
  const productLabel =
    labels.find((label) => !/app|native|mvp|build/i.test(label)) ?? "Native App";
  const lowerProduct = productLabel.toLowerCase();
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Greenfield app prompts need a coherent build plan before isolated intents or widgets.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${productLabel} App Spine`,
      description:
        "Create the app shell, shared store, first navigation stack, and starter screens as one coherent product path.",
      surfaces: ["app", "store", "view"],
      complexity: "medium",
      featurePrompt: `Create the ${platform}${lowerProduct} app spine with a SwiftUI @main shell, shared Observable store, three useful screens, navigation, empty states, and sample data. Keep it demoable immediately and preserve a clean path for real persistence later.`,
      domain: "greenfield-app",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Prevents new apps from becoming disconnected one-off Swift files.",
      loop: "App shell -> store -> screens -> focused proof",
      nextStep:
        "Generate app, store, and view surfaces together, then run project index and a focused build proof.",
      modeTrace,
    },
    {
      name: `${productLabel} Core Flow`,
      description:
        "Turn the main user action into a real clickable flow with forms, buttons, and success state instead of a static mock.",
      surfaces: ["view", "component", "store"],
      complexity: "medium",
      featurePrompt: `Create the first useful ${platform}${lowerProduct} flow with input controls, primary action, validation state, saved-result list, and reusable row/card components. Make the flow clickable enough for a browser or simulator demo.`,
      domain: "greenfield-app",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Makes the first demo show actual app behavior, not just layout.",
      loop: "Input -> validate -> save -> review",
      nextStep:
        "Add stable accessibility identifiers so Axint Cloud Preview and UI tests can drive the flow.",
      modeTrace,
    },
    {
      name: `${productLabel} Agent-Ready Proof Harness`,
      description:
        "Add the focused test and Axint proof loop agents need before claiming the generated app works.",
      surfaces: ["view"],
      complexity: "low",
      featurePrompt: `Add focused proof for the ${platform}${lowerProduct} starter app: app launches, first screen renders, primary button is hittable, one item can be created, and navigation returns to the home screen. Include accessibility identifiers and expected Xcode/UI-test evidence.`,
      domain: "greenfield-app",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Turns greenfield generation into audit-grade evidence.",
      loop: "Render -> tap -> assert -> record proof",
      nextStep:
        "Run axint.run with the generated app files and attach simulator/build evidence when available.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function productHierarchySuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 5);
  const productLabel =
    (hasKeyword(normalizedAppDescription, "cadabra") ? "Cadabra" : undefined) ??
    labels.find((label) => /cadabra|photo|camera|preset|product/i.test(label)) ??
    "Product";
  const lowerProduct = productLabel.toLowerCase();
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Product hierarchy prompts need public-facing language, default paths, hidden advanced controls, feedback capture, and provider semantics before isolated feature scaffolds.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${productLabel} Public Hierarchy`,
      description:
        "Restructure the live product around the promise, default lane, public controls, and simplified vocabulary users will actually understand.",
      surfaces: ["view", "store", "component"],
      complexity: "medium",
      featurePrompt: `Create the ${platform}${productLabel} product hierarchy pass: set the launch promise, organize presets into Better, Outfit, and Wild lanes, make Better the default surface, rename internal Magic Pass copy into public Magic Level language, keep the installed display name aligned with the product, and hide advanced dogfood controls behind an intentional debug affordance. Do not replace this with Fast/Pro/Perfect provider controls unless those remain advanced-only.`,
      domain: "product-hierarchy",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Turns raw capability into a product a normal user can understand in the first session.",
      loop: "Promise -> default lane -> public controls -> hidden advanced -> proof",
      nextStep:
        "Patch the real launch/review/settings surfaces together so labels, defaults, and hidden controls agree.",
      modeTrace,
    },
    {
      name: `${productLabel} Result Feedback Loop`,
      description:
        "Add simple feedback buttons that teach the product which outputs are good, identity-breaking, too fake, or worse than the original.",
      surfaces: ["view", "store"],
      complexity: "medium",
      featurePrompt: `Add a focused ${platform}result feedback loop with Love, Not me, Too fake, and Worse actions. Persist the feedback on each generated artifact, connect it to provider-output diagnostics, and make it available for prompt-quality repair without exposing private image data or hidden dogfood controls.`,
      domain: "product-hierarchy",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Makes dogfood feedback actionable and audit-grade instead of anecdotal.",
      loop: "Generate -> react -> persist -> improve prompt contract",
      nextStep:
        "Add state and analytics-safe metadata first, then verify feedback survives history/share routing.",
      modeTrace,
    },
    {
      name: `${productLabel} Provider Semantics Contract`,
      description:
        "Translate the simplified public lanes into strict provider instructions for identity lock, portrait cleanup, outfit edits, and scene replacement.",
      surfaces: ["store", "component"],
      complexity: "medium",
      featurePrompt: `Create the ${platform}${lowerProduct} provider semantics contract: Better means visible identity-safe portrait cleanup, Outfit changes clothing/style without changing face or scene, and Wild is the only lane allowed to replace the scene. Preserve identity lock, face shape, age, expression, hairline, beard, body structure, and clothing intent unless the public lane explicitly allows the change.`,
      domain: "product-hierarchy",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Keeps simplified product lanes connected to real provider behavior rather than cosmetic labels.",
      loop: "Public lane -> prompt contract -> generated artifact metadata -> feedback",
      nextStep:
        "Run provider prompt/request proof and attach a before/after dogfood sample when available.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function additiveFeatureSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 5);
  const featureLabel = hasKeyword(normalizedAppDescription, "magic pass")
    ? "Magic Pass"
    : (labels.find((label) => /generation|control|nano|image/i.test(label)) ??
      "Feature Controls");
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Additive feature prompts need a usable product-control surface, state capture, provider routing, and proof instead of generic settings or repair scaffolds.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${featureLabel} Control Surface`,
      description:
        "Create the visible controls users actually asked for, including state, pickers, toggles, and preview copy tied to the product vocabulary.",
      surfaces: ["view", "store", "component"],
      complexity: "medium",
      featurePrompt: `Create the ${platform}${featureLabel} control surface with explicit model tier choices (Fast, Pro, Perfect), magic strength choices (Natural, Strong, Extreme), glow-up and backdrop toggles, creative direction text input, saved settings state, and no generic appearance, keyboard shortcut, or transcription settings copy.`,
      domain: "additive-feature",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Turns a new product capability into real controls instead of a decorative settings scaffold.",
      loop: "Controls -> store -> apply action -> proof",
      nextStep:
        "Generate view/store/component together, then patch the real provider path to consume the saved settings.",
      modeTrace,
    },
    {
      name: `${featureLabel} Provider Routing Contract`,
      description:
        "Wire the selected controls into the backend/provider prompt builder so UI choices affect the generated result.",
      surfaces: ["store", "intent"],
      complexity: "medium",
      featurePrompt: `Create the ${platform}${featureLabel} provider routing contract: persist selected model tier, route Fast/Pro/Perfect to the right provider model, pass magic strength, glow-up, backdrop, and creative direction into the prompt builder, and keep hard model overrides available only for explicit debugging.`,
      domain: "additive-feature",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Prevents the UI from becoming fake by forcing provider behavior to reflect the selected controls.",
      loop: "Persist settings -> route provider -> attach evidence",
      nextStep:
        "Run Cloud Check with source plus a provider-routing test or build log showing the settings are consumed.",
      modeTrace,
    },
    {
      name: `${featureLabel} Proof Harness`,
      description:
        "Add focused evidence that every user-facing option survives selection, persistence, provider routing, and generated artifact metadata.",
      surfaces: ["view"],
      complexity: "low",
      featurePrompt: `Add focused proof for the ${platform}${featureLabel} feature: selecting each model tier updates saved state, glow-up and backdrop toggles persist, creative direction appears in the provider prompt, each generated shot records the selected settings, and no stale generic settings copy is present.`,
      domain: "additive-feature",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Makes the additive feature audit-grade by tying UX controls to durable runtime evidence.",
      loop: "Select -> persist -> generate -> inspect metadata",
      nextStep:
        "Run axint.run or a focused UI/state test and attach provider prompt evidence where available.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function releasePreflightSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 4);
  const releaseLabel =
    labels.find((label) => /testflight|release|app store|archive|upload/i.test(label)) ??
    "Release";
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Release and deployment prompts need App Store Connect, signing, archive/export, and metadata proof before any generated Apple surface.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${releaseLabel} Preflight Repair`,
      description:
        "Verify the release path in order: bundle ID, App Store Connect app record, signing, archive, export options, and upload target.",
      surfaces: ["store", "view"],
      complexity: "medium",
      featurePrompt: `Repair the ${platform}TestFlight/App Store release preflight without generating a new command surface. Check bundle identifier, App Store Connect app record existence, version/build number, signing identity, provisioning profile, archive path, exportOptions plist, and upload/export logs. Return the smallest metadata or portal action needed before another archive/export attempt.`,
      domain: "release-preflight",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Stops agents from treating release metadata failures as product feature generation.",
      loop: "Metadata -> archive -> export -> upload evidence",
      nextStep:
        "Run the release preflight or archive/export command and attach the shortest failing App Store Connect or xcodebuild log.",
      modeTrace,
    },
    {
      name: "Export Options Proof Surface",
      description:
        "Treat exportOptions.plist and upload logs as deployment artifacts with their own proof, not as Axint DSL or Swift source.",
      surfaces: ["store"],
      complexity: "low",
      featurePrompt:
        "Add proof handling for deployment artifacts: validate exportOptions plist shape, confirm method/team/signingStyle/destination, py-compile or script-smoke any release helper scripts, and run Cloud Check only against related Swift/Axint source when Apple behavior changed.",
      domain: "release-preflight",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Keeps Cloud Check honest for non-source deployment artifacts and avoids fake AX001 diagnostics.",
      loop: "Artifact proof -> related source check -> archive/export retry",
      nextStep:
        "Use plist/script proof first; use Cloud Check for the Swift or Axint files that actually implement app behavior.",
      modeTrace,
    },
    {
      name: "Release Evidence Packet",
      description:
        "Collect the exact evidence an agent or founder needs to know whether the release blocker is code, metadata, signing, or missing portal setup.",
      surfaces: ["view", "component"],
      complexity: "medium",
      featurePrompt:
        "Create a release evidence packet with app record status, bundle ID, version/build, signing/provisioning status, archive result, export result, upload result, relevant log paths, and the next safe owner action. Do not call the app ready for TestFlight until archive/export/upload evidence passes.",
      domain: "release-preflight",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Turns release failures into audit-grade proof instead of mystery Xcode/App Store Connect churn.",
      loop: "Collect logs -> classify blocker -> patch metadata or portal -> rerun",
      nextStep:
        "Attach the generated evidence packet to the next Axint run or release checklist.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function axintDogfoodSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const platform = input.platform ? `${input.platform} ` : "";
  const labels = semanticLabels(normalizedAppDescription, 5);
  const dogfoodLabel =
    labels.find((label) => /axint|dogfood|cloud|mcp|version|classifier/i.test(label)) ??
    "Axint Dogfood";
  const rationale = `Mode trace: ${modeTrace} Dogfooding prompts about Axint itself need source classifier, release/version truth, and regression-harness fixes before any generated Apple surface.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${dogfoodLabel} Routing Atom`,
      description:
        "Patch Axint's own classifier so implementation files, deployment artifacts, and dogfood repair requests route to the right proof surface.",
      surfaces: ["store", "component"],
      complexity: "medium",
      featurePrompt: `Repair the ${platform}Axint dogfood routing atom: Cloud Check should treat JS/TS/Python/shell/plist/docs as non-Apple artifacts unless they are explicit Axint contracts, suggest should route Axint/Cadabra dogfood prompts to tooling or product-quality repair lanes, and provider-output words must not automatically become an image-provider SwiftUI repair.`,
      domain: "axint-dogfood",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Prevents Axint from creating fake AX001 diagnostics or stale app-surface suggestions while dogfooding real products.",
      loop: "Dogfood log -> classifier patch -> regression test -> Cloud Check proof",
      nextStep:
        "Add focused tests for the exact misclassification, then run the Cloud Check, suggest, repair, and version suites.",
      modeTrace,
    },
    {
      name: `${dogfoodLabel} Version Truth Guard`,
      description:
        "Keep MCP, CLI, extension, docs, roadmap, and release fallback versions pinned to the canonical package version.",
      surfaces: ["store"],
      complexity: "low",
      featurePrompt:
        "Extend Axint version-truth checks so MCP fallback metadata, Fix Packet compiler fallback, VS Code lockfiles, Claude Desktop manifests, Xcode extension metadata, roadmap release links, README proof lines, and release notes cannot drift from package.json.",
      domain: "axint-dogfood",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Stops stale MCP metadata from undermining trust during large downstream dogfood runs.",
      loop: "Canonical version -> tracked surfaces -> release check -> prepublish proof",
      nextStep:
        "Run versions:check and release:check after the patch, then publish only when both package registries match.",
      modeTrace,
    },
    {
      name: `${dogfoodLabel} Regression Harness`,
      description:
        "Convert Cadabra dogfood misses into durable Axint tests so the same atoms do not regress during the next release.",
      surfaces: ["component"],
      complexity: "medium",
      featurePrompt:
        "Add regression coverage for Cadabra dogfood atoms: non-Apple artifacts avoid AX001, provider-behavior repairs avoid runtime-freeze, TestFlight metadata routes to release-preflight, Magic Pass and preset-library prompts stay product-specific, and feature generation refuses generic scaffolds when product vocabulary is present.",
      domain: "axint-dogfood",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Turns anecdotal dogfooding into audit-grade product-quality evidence.",
      loop: "Fixture -> failing test -> patch -> focused suite -> full build",
      nextStep: "Run focused tests first, then npm run prepublishOnly before committing.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function publicLanderSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 5);
  const projectLabel =
    labels.find((label) => /axint|project|profile|public|lander/i.test(label)) ??
    "Project";
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Axint is planning a new customer-facing lander/module surface instead of re-entering stale SwiftUI repair mode.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${projectLabel} Public Lander Manifest`,
      description:
        "Define the public page as a safe .axint module contract so humans and agents can configure hero, proof, install, share, and capture blocks without editing raw SwiftUI first.",
      surfaces: ["view", "component", "store"],
      complexity: "medium",
      featurePrompt: `Create a ${platform}.axint page manifest for a custom public lander with programmable modules, proof blocks, install QR blocks, email capture, safe customization, share card metadata, and preserved UI test identifiers. If the project has existing public-page files, inspect and patch ProjectShowcaseView, ShareComposerView, brand assets, and public-page customization before generating new surfaces.`,
      domain: "public-page",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Turns a vague public profile request into a structured page contract agents can extend safely.",
      loop: "Manifest -> validate modules -> render page -> prove identifiers",
      nextStep:
        "Generate or update the .axint page first, then compile/render the SwiftUI surface against that manifest.",
      modeTrace,
    },
    {
      name: "Share Card and Install Blocks",
      description:
        "Create reusable launch blocks for social preview cards, QR install flows, copyable install commands, and email capture moments.",
      surfaces: ["component", "view"],
      complexity: "medium",
      featurePrompt: `Create reusable ${platform}public-page modules for share cards, install QR, copyable install command, email capture, creator/project metadata, and analytics-safe call-to-action events.`,
      domain: "public-page",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Makes each project page distributable instead of merely decorative.",
      loop: "Preview -> share -> install -> capture",
      nextStep:
        "Keep each block addressable with stable accessibility identifiers and manifest keys.",
      modeTrace,
    },
    {
      name: "Safe Customization Rules",
      description:
        "Add guardrails that let users customize copy, layout modules, theme tokens, and share assets while blocking unsafe links or broken module combinations.",
      surfaces: ["store", "component"],
      complexity: "medium",
      featurePrompt: `Create safe customization rules for a .axint public page: allowed modules, required fields, link validation, theme token bounds, share image metadata, and fallback copy for missing blocks.`,
      domain: "public-page",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Lets agents personalize public pages without creating malformed or unsafe output.",
      loop: "Customize -> validate -> preview -> publish",
      nextStep:
        "Run validation before rendering and return actionable diagnostics for missing modules.",
      modeTrace,
    },
    {
      name: "Public Page Proof Harness",
      description:
        "Add focused proof for the public page: required modules render, install/share actions are hittable, and preserved identifiers remain stable across customization.",
      surfaces: ["view"],
      complexity: "low",
      featurePrompt: `Add focused ${platform}tests for the custom public lander: hero renders, share card metadata exists, install QR block is visible, email capture is reachable, and preserved UI test identifiers remain stable.`,
      domain: "public-page",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Keeps the new lander work from regressing into static mockup territory.",
      loop: "Render -> interact -> verify identifiers -> Cloud Check",
      nextStep:
        "Run `axint run` with the changed manifest, rendering files, and focused page tests.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
}

function brandPolishSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number,
  modeTrace: string
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 4);
  const brandLabel =
    labels.find((label) => /axint|brand|mark|symbol|profile/i.test(label)) ?? "Brand";
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Mode trace: ${modeTrace} Axint is planning a surgical brand/provenance pass for existing product surfaces instead of generic feature ideas.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${brandLabel} Asset Provenance Map`,
      description:
        "Find the official mark, compare it against current local assets, and decide exactly which surfaces use the symbol, wordmark, or cover art.",
      surfaces: ["component", "view"],
      complexity: "low",
      featurePrompt: `Audit asset provenance for the ${platform}project before editing UI: identify the official Axint symbol mark source, current local asset filenames, wrong or hand-drawn variants, wordmark-only surfaces, and the exact SwiftUI files that render each asset. Return file targets, replacement plan, and visual proof steps.`,
      domain: "brand-polish",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Prevents agents from swapping logos by vibes and gives brand changes a proof trail.",
      loop: "Source asset -> map usage -> patch smallest surfaces -> visual proof",
      nextStep:
        "Inspect assets and the existing brand kit before generating or replacing any image.",
      modeTrace,
    },
    {
      name: "Existing Surface Brand Wiring",
      description:
        "Patch the current SwiftUI surfaces and brand-kit tokens in place instead of creating a new marketing screen.",
      surfaces: ["view", "store", "component"],
      complexity: "medium",
      featurePrompt: `Repair existing ${platform}brand wiring in place: inspect BrandKit, ProjectShowcaseView, profile/project surfaces, cover art, and any share-card composer before changing the official mark. Preserve working routes and accessibility identifiers, remove the wrong brand asset, and keep wordmark usage where appropriate.`,
      domain: "brand-polish",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Keeps premium polish tied to the real app instead of drifting into a disconnected redesign.",
      loop: "Inspect -> patch assets/tokens -> validate Swift -> focused UI proof",
      nextStep:
        "Use `axint validate-swift` on the touched SwiftUI files, then run a focused visual or UI proof.",
      modeTrace,
    },
    {
      name: "Brand Visual Proof Pass",
      description:
        "Add proof that the correct asset appears on the right surfaces and the old/wrong mark no longer appears.",
      surfaces: ["view"],
      complexity: "low",
      featurePrompt: `Add visual proof for the ${platform}brand repair: verify the official Axint symbol appears on intended project surfaces, the wordmark cover remains where appropriate, the wrong hand-drawn symbol is absent, and share-card previews use the correct brand assets. Include screenshot or focused UI-test evidence in Cloud Check.`,
      domain: "brand-polish",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Turns subjective polish into verifiable product quality.",
      loop: "Render -> compare -> screenshot/test -> Cloud Check evidence",
      nextStep:
        "Attach the screenshot path, UI-test log, or preview proof to Cloud Check after the patch.",
      modeTrace,
    },
  ];

  return suggestions.slice(0, limit);
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

function adaptiveSemanticSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  domain: string,
  limit: number
): FeatureSuggestion[] {
  const labels = semanticLabels(normalizedAppDescription, 4).filter(
    (label) => !["Overview", "Active", "Needs Review"].includes(label)
  );
  if (labels.length < 2) return [];

  const concept = labels.slice(0, 2).join(" ");
  const lowerConcept = concept.toLowerCase();
  const platform = input.platform ? `${input.platform} ` : "";
  const rationale = `Generated from the app description terms ${labels
    .slice(0, 4)
    .join(", ")} instead of relying only on a stock domain template.`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `${concept} Command Surface`,
      description: `Expose the core ${lowerConcept} workflow through Siri, Shortcuts, and an in-app command entry point.`,
      surfaces: ["intent", "view"],
      complexity: "medium",
      featurePrompt: `Create a ${platform}${lowerConcept} command surface with intent entry, visible status, and next action controls`,
      domain,
      rationale,
      confidence: "medium",
      source: "local",
      impact: "Turns the app's core noun into an Apple-native action loop.",
      loop: "Capture -> validate -> route -> resume",
      nextStep: "Generate the view and intent together so they share vocabulary.",
    },
    {
      name: `${concept} State Loop`,
      description: `Shared state for ${lowerConcept} so views, shortcuts, widgets, and agents read from the same source of truth.`,
      surfaces: ["store", "view", "intent"],
      complexity: "medium",
      featurePrompt: `Create a shared ${lowerConcept} store with a review view and App Intent that reads and updates the same state`,
      domain,
      rationale,
      confidence: "medium",
      source: "local",
      impact: "Prevents generated surfaces from becoming isolated demo files.",
      loop: "Store -> view -> intent -> widget",
      nextStep: "Generate store first, then generate each surface against it.",
    },
    {
      name: `${concept} Review Queue`,
      description: `A focused review queue for scanning ${lowerConcept} items, risk, owner, status, and the next decision.`,
      surfaces: ["view", "component"],
      complexity: "medium",
      featurePrompt: `Create a ${platform}${lowerConcept} review queue component kit with rows, status pills, owner metadata, and approve or defer actions`,
      domain,
      rationale,
      confidence: "medium",
      source: "local",
      impact: "Makes the app feel operational instead of static.",
      loop: "Scan -> decide -> approve -> archive",
      nextStep: "Generate row, card, and toolbar components as a kit.",
    },
  ];

  return suggestions.slice(0, Math.max(0, limit));
}

function shouldLeadWithAdaptive(
  normalizedAppDescription: string,
  strongestDescriptionScore: number
): boolean {
  if (strongestDescriptionScore < 3) return true;
  return [
    "agent",
    "approval",
    "context",
    "handoff",
    "mission",
    "operator",
    "project room",
    "transcription",
    "voice",
    "workflow",
  ].some((keyword) => hasKeyword(normalizedAppDescription, keyword));
}

function mergeSuggestions(
  suggestions: FeatureSuggestion[],
  limit: number
): FeatureSuggestion[] {
  const seen = new Set<string>();
  const merged: FeatureSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = normalizeText(suggestion.name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(suggestion);
    if (merged.length >= limit) break;
  }
  return merged;
}

function looksLikeExistingProductRepair(
  input: SuggestInput,
  normalizedAppDescription: string
): boolean {
  if (!normalizedAppDescription) return false;

  const goalsText = normalizeText((input.goals ?? []).join(" "));
  const constraintsText = normalizeText((input.constraints ?? []).join(" "));
  const combined = [normalizedAppDescription, goalsText, constraintsText]
    .filter(Boolean)
    .join(" ");

  const repairIntent = [
    "bug",
    "broken",
    "can't",
    "cannot",
    "cleanup",
    "does not",
    "doesn't",
    "fails",
    "failing",
    "fix",
    "improve",
    "no near-duplicate",
    "no longer",
    "polish",
    "premium",
    "not working",
    "output quality",
    "regression",
    "repair",
    "rescue pass",
    "restore",
    "stronger",
    "stopped",
    "turning",
    "upgrade",
    "weak",
    "won't",
  ].some((keyword) => hasKeyword(combined, keyword));

  const existingSurface = [
    "animation",
    "build",
    "click",
    "command center",
    "composer",
    "existing",
    "focus",
    "gesture",
    "hittable",
    "input",
    "identity",
    "image generation",
    "image provider",
    "layout",
    "magic pass",
    "model routing",
    "nano banana",
    "near-duplicate",
    "output quality",
    "project room",
    "provider",
    "provider output",
    "provider prompt",
    "provider quality",
    "prompt builder",
    "prompt quality",
    "route",
    "screen",
    "scroll",
    "swiftui",
    "tab",
    "tap",
    "test",
    "ui test",
    "ux",
    "view",
    "xcode",
    "zindex",
  ].some((keyword) => hasKeyword(combined, keyword));

  const providerOutputCues = [
    "background",
    "cosmic",
    "face",
    "fantasy",
    "fine-line",
    "gemini",
    "generated output",
    "glow-up",
    "glow up",
    "identity",
    "image generation",
    "image provider",
    "magic pass",
    "nano banana",
    "near-duplicate",
    "output quality",
    "provider",
    "provider output",
    "provider prompt",
    "prompt contract",
    "skin cleanup",
    "under-eye",
  ].filter((keyword) => hasKeyword(combined, keyword));

  const providerQualityIntent =
    providerOutputCues.length >= 2 &&
    [
      "contract",
      "cleanup",
      "friend testing",
      "identity-safe",
      "leaves unchanged",
      "no near-duplicate",
      "output quality",
      "quality semantics",
      "rescue pass",
      "semantics",
      "stronger",
      "weak",
    ].some((keyword) => hasKeyword(combined, keyword));

  if (
    /\b(create|generate|scaffold|build)\s+(?:a|an|new)\b/.test(combined) &&
    /\b(bug report|issue tracker|support ticket)\b/.test(combined)
  ) {
    return false;
  }

  return providerQualityIntent || (repairIntent && existingSurface);
}

function existingProductRepairSuggestions(
  input: SuggestInput,
  normalizedAppDescription: string,
  limit: number
): FeatureSuggestion[] {
  const repairRead = analyzeAppleRepairTask({
    text: [
      input.appDescription,
      ...(input.goals ?? []),
      ...(input.constraints ?? []),
    ].join("\n"),
    platform: input.platform,
  });
  const focus = repairProblemFocus(normalizedAppDescription);
  const concept = repairScreenConcept(normalizedAppDescription);
  const interactionFocus = focus.includes("interaction")
    ? titleCase(focus)
    : `${titleCase(focus)} Interaction`;
  const promptCues = repairPromptCues(normalizedAppDescription);
  const needsInteractionMap = repairNeedsInteractionMap(normalizedAppDescription);
  const leadCause = repairRead.rootCauses[0];
  const checklist = repairRead.inspectionChecklist.slice(0, 3).join(" ");
  const cueSentence =
    promptCues.length > 0
      ? ` Keep these prompt-specific cues in scope: ${promptCues.join(", ")}.`
      : "";
  const platform = input.platform ? `${input.platform} ` : "";
  const isProviderRepair = repairRead.issueClass === "provider-behavior";
  const mainRepairTarget = isProviderRepair
    ? `existing ${platform}${concept} provider behavior`
    : `existing ${platform}${concept} SwiftUI flow`;
  const mainRepairPrompt = isProviderRepair
    ? `Repair the ${mainRepairTarget} without treating it as launch/responsiveness evidence or replacing the surrounding app. ${repairRead.summary} Preserve the user's product vocabulary, selected settings, provider route, and generated artifact metadata.${cueSentence} Inspect first: ${checklist || "provider prompt builder, model routing, local overrides, request payload, and generated output metadata."} Patch the smallest prompt/routing contract and prove the selected controls reach the provider request.`
    : `Repair the ${mainRepairTarget} without replacing the surrounding app. ${repairRead.summary} Preserve store state, existing tab routing, first-viewport hierarchy, primary buttons, accessibility identifiers, and the user's current product vocabulary.${cueSentence} Inspect first: ${checklist || "related SwiftUI parent shell, shared stores, and focused proof evidence."} Identify the touched files, reproduce the behavior, patch the smallest view/state/hit-testing/routing change, and keep existing components intact.`;
  const proofPrompt = isProviderRepair
    ? `Add focused ${platform}provider behavior proof for the existing ${focus} repair. The proof should verify selected settings enter the provider prompt/request, identity-preservation constraints are present, generated artifact metadata records the chosen controls, and no launch-hang assumptions are used.${cueSentence}`
    : `Add a focused ${platform}Xcode unit or UI test for the existing ${focus} bug. The proof should exercise the exact tap, scroll, focus, layout, route, or state behavior that regressed and should not depend on unrelated screens.${cueSentence}`;
  const routingPrompt = isProviderRepair
    ? `Audit the existing ${platform}${concept} provider routing and model-selection path. Confirm Fast/Pro/Perfect, style strength, glow-up, backdrop, and creative direction route to the provider request and are recorded on the generated artifact.${cueSentence}`
    : `Audit the existing ${platform}${concept} routes and primary actions. Confirm buttons such as capture, run agent, launch check, open vault, decisions, missions, agents, and project context route to real existing tabs or sheets.${cueSentence} Add accessibility identifiers and a focused UI test for each primary command-center action that must be hittable and route correctly.`;
  const contextPrompt = isProviderRepair
    ? `Index the project context for the existing ${focus} repair, then inspect provider services, prompt builders, model routing, local secret overrides, shot metadata, and any generated-output comparison before patching.${cueSentence} Axint senior read: ${repairRead.summary}`
    : `Index the project context for the existing ${focus} bug, then inspect related SwiftUI views, stores, modifiers, overlays, disabled states, gestures, accessibility identifiers, route containers, and recently changed files before patching.${cueSentence} Axint senior read: ${repairRead.summary}`;
  const rationale = `Detected an existing-product repair request (${repairRead.issueClass}), so Axint is returning a proof-first repair loop instead of new feature ideas. ${repairRead.summary}`;

  const suggestions: FeatureSuggestion[] = [
    {
      name: `Repair Existing ${titleCase(concept)} Flow`,
      description: `Patch the current ${concept} in place, preserve the surrounding product, and avoid replacing working screens with a fresh scaffold. ${leadCause ? `Likely first read: ${leadCause.title}.` : ""}`,
      surfaces: ["view", "component"],
      complexity: "medium",
      featurePrompt: mainRepairPrompt,
      domain: "repair",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Moves Axint from idea generation into senior-engineer repair mode for an existing Apple product.",
      loop: "Reproduce -> patch smallest surface -> validate source -> prove in Xcode",
      nextStep:
        "Run Cloud Check with expectedBehavior, actualBehavior, and the focused Xcode build or UI-test log.",
    },
    ...(needsInteractionMap
      ? [
          {
            name: `Trace ${interactionFocus} Blockers`,
            description:
              "Map the parent wrappers, overlays, disabled state, gestures, focus bindings, and hit-testing layers that can make visible controls stop accepting input.",
            surfaces: ["view", "store"],
            complexity: "medium",
            featurePrompt: `Build an interaction map for the existing ${platform}${concept} before patching. ${repairRead.rootCauses
              .slice(0, 3)
              .map((cause) => `${cause.title}: ${cause.inspect.join(", ")}`)
              .join(
                " "
              )}${cueSentence} Patch the smallest parent or child modifier that restores interaction, then prove it with a focused UI test.`,
            domain: "repair",
            rationale,
            confidence: "high",
            source: "local",
            impact:
              "Targets the class of bugs where a visible SwiftUI control stops accepting taps or typing because a parent layer or state gate is blocking it.",
            loop: "Interaction map -> blocker patch -> focused input proof -> Cloud Check evidence",
            nextStep:
              "Run `axint project index --changed <files>` and inspect the highest interaction-risk related files before editing.",
          } satisfies FeatureSuggestion,
        ]
      : []),
    {
      name: `Add Focused ${titleCase(focus)} Proof`,
      description:
        "Create or run the smallest unit/UI proof that can fail before the patch and pass after it.",
      surfaces: ["view"],
      complexity: "low",
      featurePrompt: proofPrompt,
      domain: "repair",
      rationale,
      confidence: "high",
      source: "local",
      impact: "Turns the repair into durable evidence an agent can trust.",
      loop: "Failing proof -> targeted patch -> passing proof -> Cloud Check evidence",
      nextStep:
        "Paste the passing focused test log into Cloud Check so the gate can reconcile source and runtime evidence.",
    },
    {
      name: `Preserve ${titleCase(concept)} Routing`,
      description:
        "Verify the upgraded screen still routes primary actions to the real existing destinations instead of decorative placeholder states.",
      surfaces: ["view", "store"],
      complexity: "medium",
      featurePrompt: routingPrompt,
      domain: "repair",
      rationale,
      confidence: "high",
      source: "local",
      impact:
        "Keeps premium UX work wired to the actual product instead of becoming a static mockup.",
      loop: "Action map -> route proof -> focused UI test -> Cloud Check evidence",
      nextStep:
        "Run `axint run --only-testing <UITestTarget/Class/testName>` with the changed files so the proof lands in the final gate.",
    },
    {
      name: `Inspect ${titleCase(focus)} Context`,
      description:
        "Look beyond the current file for the overlay, disabled state, gesture, z-index, route, or shared state that may be blocking the behavior.",
      surfaces: ["view", "store"],
      complexity: "medium",
      featurePrompt: contextPrompt,
      domain: "repair",
      rationale,
      confidence: "medium",
      source: "local",
      impact:
        "Prevents the agent from guessing inside one file when the blocker lives in a parent shell or shared state layer.",
      loop: "Context index -> related files -> targeted repair -> proof",
      nextStep:
        "Run `axint project index` and rerun Cloud Check against the failing file with the generated project context.",
    },
  ];

  return suggestions.slice(0, limit);
}

function repairNeedsInteractionMap(normalizedAppDescription: string): boolean {
  return /\b(input|composer|comment|reply|textfield|text field|texteditor|text editor|tap|click|hittable|focus|keyboard|overlay|zindex|z-index|disabled|allowshittesting|hit testing|gesture)\b/.test(
    normalizedAppDescription
  );
}

function repairProblemFocus(normalizedAppDescription: string): string {
  if (
    /\b(provider|provider output|generated output|output quality|prompt builder|provider prompt|model routing|gemini|nano banana|image generation|identity|identity drift|identity-safe|face|face shape|head shape|hairline|beard|background|backdrop|fantasy|cosmic|skin cleanup|fine-line|under-eye|near-duplicate|10\/10|unchanged|glow-up|glow up)\b/.test(
      normalizedAppDescription
    )
  ) {
    return "provider output";
  }
  if (
    /\b(command center|command-center|hero|first viewport|first-viewport|primary action|primary actions)\b/.test(
      normalizedAppDescription
    )
  ) {
    return "command center";
  }
  if (
    /\b(comment box|compose box|composer|reply box|post box|text field|textfield|text editor|texteditor|input|focus|type|tap)\b/.test(
      normalizedAppDescription
    )
  ) {
    return "input interaction";
  }
  if (
    /\b(scroll|tab|sticky|header|list|feed|position|offset)\b/.test(
      normalizedAppDescription
    )
  ) {
    return "scroll and layout";
  }
  if (/\b(route|navigation|sheet|modal|window|screen)\b/.test(normalizedAppDescription)) {
    return "route";
  }
  if (
    /\b(accessibility|identifier|hittable|button|click)\b/.test(normalizedAppDescription)
  ) {
    return "hittable UI";
  }
  if (/\b(build|compile|xcode|diagnostic|error)\b/.test(normalizedAppDescription)) {
    return "Xcode build";
  }
  return "SwiftUI repair";
}

function repairScreenConcept(normalizedAppDescription: string): string {
  if (
    /\b(cadabra|gemini|nano banana|image generation|image provider|provider output|output quality|magic pass)\b/.test(
      normalizedAppDescription
    )
  ) {
    return "image provider";
  }
  if (/\bproject room\b/.test(normalizedAppDescription)) return "project room";
  if (/\bcommand center|command-center\b/.test(normalizedAppDescription)) {
    return "command center";
  }
  if (/\bhome(?:page)?|home screen|home feed\b/.test(normalizedAppDescription)) {
    return "home screen";
  }
  if (/\bdiscover\b/.test(normalizedAppDescription)) return "discover screen";
  if (/\blaunch readiness|launch check|launch center\b/.test(normalizedAppDescription)) {
    return "launch readiness";
  }
  return repairProblemFocus(normalizedAppDescription);
}

function repairPromptCues(normalizedAppDescription: string): string[] {
  const cues: [RegExp, string][] = [
    [/\bproject room\b/, "Project Room"],
    [/\bmy project\b/, "My Project"],
    [/\bcommand center|command-center\b/, "command center"],
    [/\blaunch readiness|launch check|launch center\b/, "launch readiness"],
    [/\bcapture\b/, "Capture"],
    [/\bvault\b/, "Vault"],
    [/\bagents?\b/, "Agents"],
    [/\bmissions?\b/, "Missions"],
    [/\bdecisions?\b/, "Decisions"],
    [/\bproject context\b/, "project context"],
    [/\bdiscover\b/, "Discover"],
    [/\blive\s+(?:activit(?:y|ies)|events?|feed|status)\b|\bevents?\b/, "Live/Events"],
    [/\bbuilders?\b/, "Builders"],
    [/\bmarketplace\b|\bmarket\b/, "Marketplace"],
    [/\btab(?:s)?\b|\btab routing\b/, "tab routing"],
    [/\bcard heights?\b|\buniform\b/, "uniform card heights"],
    [/\bclick targets?\b|\bhittable\b|\bprimary action/, "real click targets"],
    [/\breduced motion\b|\bmotion\b/, "reduced motion"],
    [/\bscroll\b|\btop\b/, "scroll-to-top behavior"],
    [/\bidentity\b|\bface shape\b|\bhead shape\b/, "identity preservation"],
    [/\bgemini\b|\bnano banana\b/, "image provider"],
    [
      /\bprovider output\b|\boutput quality\b|\bgenerated output\b/,
      "provider output quality",
    ],
    [/\bprovider prompt\b|\bprompt builder\b|\bprompt contract\b/, "provider prompt"],
    [/\bmodel routing\b|\bfast\/pro\/perfect\b/, "model routing"],
    [/\bmagic pass\b/, "Magic Pass"],
    [/\bskin cleanup\b|\bfine-line\b|\bunder-eye\b/, "portrait cleanup"],
    [/\bnear-duplicate\b|\bleaves unchanged\b|\bunchanged\b/, "near-duplicate avoidance"],
    [/\bfantasy\b|\bcosmic\b|\bbackground\b/, "background preservation"],
  ];

  return unique(
    cues
      .filter(([pattern]) => pattern.test(normalizedAppDescription))
      .map(([, label]) => label)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
