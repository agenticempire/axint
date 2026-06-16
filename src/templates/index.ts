/**
 * Intent Template Registry
 *
 * Pre-built reference templates for common App Intent patterns across
 * every major Apple domain. Each template is a complete, runnable
 * TypeScript file that compiles cleanly with `axint compile`.
 *
 * Templates are exposed through the MCP server (`axint_list_templates`,
 * `axint_template`) and the CLI (`axint new --template <id>`).
 */

export interface IntentTemplate {
  /** Unique template identifier, kebab-case */
  id: string;
  /** Short kebab/camel name (kept for backwards compat) */
  name: string;
  /** Human-readable display title */
  title: string;
  /** Apple App Intent domain */
  domain: string;
  /** Category for filtering — usually mirrors domain */
  category: string;
  /** Description of what this template generates */
  description: string;
  /** The TypeScript source template (uses defineIntent API) */
  source: string;
}

// ─── Template definitions ────────────────────────────────────────────

const sendMessage: IntentTemplate = {
  id: "send-message",
  name: "send-message",
  title: "Send Message",
  domain: "messaging",
  category: "messaging",
  description: "Send a text message to a contact.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message to a specified contact.",
  domain: "messaging",
  params: {
    recipient: param.string("Who to send the message to"),
    body: param.string("The message content"),
  },
  perform: async ({ recipient, body }) => {
    // TODO: Integrate with your messaging backend
    return { sent: true };
  },
});
`,
};

const createEvent: IntentTemplate = {
  id: "create-event",
  name: "create-event",
  title: "Create Calendar Event",
  domain: "productivity",
  category: "productivity",
  description: "Create a calendar event with a title, date, and duration.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event in the user's calendar.",
  domain: "productivity",
  entitlements: ["com.apple.developer.siri"],
  infoPlistKeys: {
    NSCalendarsUsageDescription: "Access to your calendar to create events.",
  },
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    durationMinutes: param.int("Duration in minutes", { default: 30 }),
    allDay: param.boolean("All-day event", { required: false }),
  },
  perform: async ({ title, date }) => {
    return { eventId: "evt_placeholder" };
  },
});
`,
};

const bookRide: IntentTemplate = {
  id: "book-ride",
  name: "book-ride",
  title: "Book a Ride",
  domain: "navigation",
  category: "navigation",
  description: "Request a ride from a pickup location to a destination.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "BookRide",
  title: "Book a Ride",
  description: "Requests a ride from a pickup location to a destination.",
  domain: "navigation",
  params: {
    pickup: param.string("Pickup location"),
    destination: param.string("Destination address"),
    passengers: param.int("Number of passengers", { default: 1 }),
  },
  perform: async ({ pickup, destination }) => {
    return { rideId: "ride_placeholder", eta: 300 };
  },
});
`,
};

const getDirections: IntentTemplate = {
  id: "get-directions",
  name: "get-directions",
  title: "Get Directions",
  domain: "navigation",
  category: "navigation",
  description: "Get turn-by-turn directions to a destination.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "GetDirections",
  title: "Get Directions",
  description: "Returns turn-by-turn directions to a destination.",
  domain: "navigation",
  params: {
    destination: param.string("Where to navigate to"),
    mode: param.string("Travel mode (driving, walking, transit)", {
      default: "driving",
    }),
  },
  perform: async ({ destination }) => {
    return { routeId: "route_placeholder" };
  },
});
`,
};

const playTrack: IntentTemplate = {
  id: "play-track",
  name: "play-track",
  title: "Play Track",
  domain: "media",
  category: "media",
  description: "Play a specific track or song.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "PlayTrack",
  title: "Play Track",
  description: "Plays a specific track by title and artist.",
  domain: "media",
  params: {
    track: param.string("Track title"),
    artist: param.string("Artist name", { required: false }),
    shuffle: param.boolean("Shuffle mode", { required: false }),
  },
  perform: async ({ track }) => {
    return { playing: true };
  },
});
`,
};

const createNote: IntentTemplate = {
  id: "create-note",
  name: "create-note",
  title: "Create Note",
  domain: "productivity",
  category: "productivity",
  description: "Create a new note with a title and body.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateNote",
  title: "Create Note",
  description: "Creates a new note with a title and body.",
  domain: "productivity",
  params: {
    title: param.string("Note title"),
    body: param.string("Note body"),
    pinned: param.boolean("Pin the note", { required: false }),
  },
  perform: async ({ title, body }) => {
    return { noteId: "note_placeholder" };
  },
});
`,
};

const logExpense: IntentTemplate = {
  id: "log-expense",
  name: "log-expense",
  title: "Log Expense",
  domain: "finance",
  category: "finance",
  description: "Log a financial expense with amount, category, and note.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LogExpense",
  title: "Log Expense",
  description: "Logs a financial expense with amount, category, and note.",
  domain: "finance",
  params: {
    amount: param.double("Expense amount"),
    currency: param.string("ISO currency code (e.g., USD)", {
      default: "USD",
    }),
    category: param.string("Expense category"),
    note: param.string("Optional note", { required: false }),
  },
  perform: async ({ amount, category }) => {
    return { expenseId: "exp_placeholder" };
  },
});
`,
};

const logWorkout: IntentTemplate = {
  id: "log-workout",
  name: "log-workout",
  title: "Log Workout",
  domain: "health",
  category: "health",
  description: "Log a workout with duration, type, and calories burned.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LogWorkout",
  title: "Log Workout",
  description: "Logs a workout with duration, type, and calories burned.",
  domain: "health",
  entitlements: ["com.apple.developer.healthkit"],
  infoPlistKeys: {
    NSHealthShareUsageDescription: "Read workout history to track progress.",
    NSHealthUpdateUsageDescription: "Save new workouts you log.",
  },
  params: {
    type: param.string("Workout type (e.g., running, cycling)"),
    duration: param.duration("Workout duration"),
    calories: param.int("Calories burned", { required: false }),
  },
  perform: async ({ type, duration }) => {
    return { workoutId: "wo_placeholder" };
  },
});
`,
};

const setThermostat: IntentTemplate = {
  id: "set-thermostat",
  name: "set-thermostat",
  title: "Set Thermostat",
  domain: "smart-home",
  category: "smart-home",
  description: "Set a smart-home thermostat to a target temperature.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "SetThermostat",
  title: "Set Thermostat",
  description: "Sets a smart-home thermostat to a target temperature.",
  domain: "smart-home",
  params: {
    room: param.string("Which room"),
    temperature: param.double("Target temperature"),
    unit: param.string("Temperature unit (F or C)", { default: "F" }),
  },
  perform: async ({ room, temperature }) => {
    return { set: true };
  },
});
`,
};

const placeOrder: IntentTemplate = {
  id: "place-order",
  name: "place-order",
  title: "Place Order",
  domain: "commerce",
  category: "commerce",
  description: "Place a commerce order for a product.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "PlaceOrder",
  title: "Place Order",
  description: "Places an order for a product.",
  domain: "commerce",
  params: {
    productId: param.string("Product identifier"),
    quantity: param.int("Quantity", { default: 1 }),
    shippingAddress: param.string("Shipping address", { required: false }),
  },
  perform: async ({ productId, quantity }) => {
    return { orderId: "ord_placeholder", total: 0 };
  },
});
`,
};

const searchTasks: IntentTemplate = {
  id: "search-tasks",
  name: "search-tasks",
  title: "Search Tasks",
  domain: "productivity",
  category: "productivity",
  description: "Search for tasks using EntityQuery with string-based search.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Task",
  display: {
    title: "name",
    subtitle: "status",
  },
  properties: {
    id: param.string("Unique task identifier"),
    name: param.string("Task name"),
    status: param.string("Task status (todo, in-progress, done)"),
    dueDate: param.date("Due date"),
  },
  query: "string",
});

export default defineIntent({
  name: "SearchTasks",
  title: "Search Tasks",
  description: "Search for tasks by name or status.",
  domain: "productivity",
  params: {
    query: param.string("Search query"),
    status: param.string("Filter by status (optional)", { required: false }),
  },
  donateOnPerform: true,
  perform: async ({ query, status }) => {
    // TODO: Search your task database with the query
    // Use status filter if provided
    return { found: true, results: 0 };
  },
});
`,
};

const dynamicPlaylist: IntentTemplate = {
  id: "dynamic-playlist",
  name: "dynamic-playlist",
  title: "Dynamic Playlist",
  domain: "media",
  category: "media",
  description: "Create a playlist by name, mood, and track count.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "DynamicPlaylist",
  title: "Create Dynamic Playlist",
  description: "Create a playlist with a given mood or genre.",
  domain: "media",
  params: {
    name: param.string("Playlist name"),
    mood: param.string("Mood or genre (e.g., chill, workout, focus)"),
    trackCount: param.int("Number of tracks", { default: 20 }),
  },
  perform: async ({ name, mood }) => {
    return { playlistId: "playlist_placeholder" };
  },
});
`,
};

const planTrail: IntentTemplate = {
  id: "plan-trail",
  name: "plan-trail",
  title: "Plan Trail",
  domain: "navigation",
  category: "navigation",
  description:
    "Plan a trail outing with entity queries, dynamic options, and an interactive parameter summary.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Trail",
  display: {
    title: "name",
    subtitle: "region",
    image: "figure.hiking",
  },
  properties: {
    id: param.string("Trail identifier"),
    name: param.string("Trail name"),
    region: param.string("Trail region"),
    distanceKm: param.double("Distance in kilometers"),
    openNow: param.boolean("Whether the trail is currently open"),
  },
  query: "property",
});

export default defineIntent({
  name: "PlanTrail",
  title: "Plan Trail",
  description: "Build a trail plan from a runtime activity picker and a queryable trail entity.",
  domain: "navigation",
  parameterSummary: {
    switch: "includeNearby",
    cases: [
      {
        value: true,
        summary: {
          when: "region",
          then: "Plan \${activity} on \${trail} near \${region}",
          otherwise: "Plan \${activity} on \${trail} near me",
        },
      },
      {
        value: false,
        summary: "Plan \${activity} on \${trail}",
      },
    ],
    default: "Plan trail",
  },
  params: {
    activity: param.dynamicOptions("ActivityOptions", param.string("Activity type")),
    trail: param.entity("Trail", "Trail to open"),
    includeNearby: param.boolean("Limit results to nearby trails", { default: true }),
    region: param.string("Trail region", { required: false }),
  },
  perform: async ({ activity, trail }) => {
    return { planned: true, activity, trail };
  },
});
`,
};

const setTimer: IntentTemplate = {
  id: "set-timer",
  name: "set-timer",
  title: "Set Timer",
  domain: "utilities",
  category: "utilities",
  description: "Set a timer with a duration and optional label.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "SetTimer",
  title: "Set Timer",
  description: "Sets a timer with a specified duration and optional label.",
  domain: "utilities",
  params: {
    duration: param.duration("Timer duration"),
    label: param.string("Timer label (optional)", { required: false }),
  },
  perform: async ({ duration, label }) => {
    return { timerId: "timer_placeholder", running: true };
  },
});
`,
};

const searchNotes: IntentTemplate = {
  id: "search-notes",
  name: "search-notes",
  title: "Search Notes",
  domain: "productivity",
  category: "productivity",
  description: "Search through notes using a query string.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Note",
  display: {
    title: "title",
    subtitle: "preview",
  },
  properties: {
    id: param.string("Note identifier"),
    title: param.string("Note title"),
    preview: param.string("Note preview text"),
    createdDate: param.date("Created date"),
  },
  query: "string",
});

export default defineIntent({
  name: "SearchNotes",
  title: "Search Notes",
  description: "Searches notes by title, content, or date.",
  domain: "productivity",
  params: {
    query: param.string("Search query or keywords"),
    limit: param.int("Max results to return", { default: 10, required: false }),
  },
  donateOnPerform: true,
  perform: async ({ query, limit }) => {
    return { found: true, count: 0 };
  },
});
`,
};

const createReminder: IntentTemplate = {
  id: "create-reminder",
  name: "create-reminder",
  title: "Create Reminder",
  domain: "productivity",
  category: "productivity",
  description: "Create a reminder with title, date, and priority level.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateReminder",
  title: "Create Reminder",
  description: "Creates a new reminder with a due date and priority.",
  domain: "productivity",
  params: {
    title: param.string("Reminder title"),
    dueDate: param.date("Due date and time"),
    priority: param.string("Priority level (low, medium, high)", { default: "medium" }),
    list: param.string("Reminder list (optional)", { required: false }),
  },
  perform: async ({ title, dueDate, priority }) => {
    return { reminderId: "reminder_placeholder" };
  },
});
`,
};

const toggleSetting: IntentTemplate = {
  id: "toggle-setting",
  name: "toggle-setting",
  title: "Toggle Setting",
  domain: "smart-home",
  category: "smart-home",
  description: "Toggle a system or app setting on/off.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ToggleSetting",
  title: "Toggle Setting",
  description: "Toggles a system or app setting on or off.",
  domain: "smart-home",
  params: {
    setting: param.string("Setting name (e.g., wifi, bluetooth, do-not-disturb)"),
    enabled: param.boolean("Enable or disable", { required: false }),
  },
  perform: async ({ setting, enabled }) => {
    return { toggled: true };
  },
});
`,
};

const shareContent: IntentTemplate = {
  id: "share-content",
  name: "share-content",
  title: "Share Content",
  domain: "messaging",
  category: "messaging",
  description: "Share content to a destination with an optional message.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ShareContent",
  title: "Share Content",
  description: "Shares content to a destination or contact.",
  domain: "messaging",
  params: {
    url: param.string("URL to share"),
    destination: param.string("Where to share (contact, service, or platform)"),
    message: param.string("Message to include", { required: false }),
  },
  perform: async ({ url, destination }) => {
    return { shared: true };
  },
});
`,
};

const navigateTo: IntentTemplate = {
  id: "navigate-to",
  name: "navigate-to",
  title: "Navigate to Location",
  domain: "navigation",
  category: "navigation",
  description: "Navigate to a location with optional transport mode.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "NavigateTo",
  title: "Navigate to Location",
  description: "Opens navigation to a specified address or location.",
  domain: "navigation",
  params: {
    address: param.string("Destination address or place name"),
    mode: param.string("Transport mode (driving, walking, transit, cycling)", {
      default: "driving",
    }),
    avoidTolls: param.boolean("Avoid tolls", { required: false }),
  },
  perform: async ({ address, mode }) => {
    return { navigationStarted: true };
  },
});
`,
};

const playMusic: IntentTemplate = {
  id: "play-music",
  name: "play-music",
  title: "Play Music",
  domain: "media",
  category: "media",
  description: "Play music by track, artist, album, or playlist.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Playlist",
  display: {
    title: "name",
    subtitle: "trackCount",
  },
  properties: {
    id: param.string("Playlist identifier"),
    name: param.string("Playlist name"),
    trackCount: param.int("Number of tracks"),
  },
  query: "string",
});

export default defineIntent({
  name: "PlayMusic",
  title: "Play Music",
  description: "Plays music from a track, artist, album, or playlist.",
  domain: "media",
  params: {
    query: param.string("Track, artist, album, or playlist name"),
    shuffle: param.boolean("Shuffle playback", { required: false }),
    repeat: param.string("Repeat mode (off, all, one)", { default: "off" }),
  },
  perform: async ({ query }) => {
    return { playing: true };
  },
});
`,
};

const scanDocument: IntentTemplate = {
  id: "scan-document",
  name: "scan-document",
  title: "Scan Document",
  domain: "productivity",
  category: "productivity",
  description: "Scan or process a document and save in specified format.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ScanDocument",
  title: "Scan Document",
  description: "Scans or processes a document and saves it in the specified format.",
  domain: "productivity",
  params: {
    source: param.string("Document source (camera, file, or URL)"),
    format: param.string("Output format (pdf, jpg, png)", { default: "pdf" }),
    name: param.string("Document name", { required: false }),
  },
  perform: async ({ source, format }) => {
    return { documentId: "doc_placeholder", saved: true };
  },
});
`,
};

const translateText: IntentTemplate = {
  id: "translate-text",
  name: "translate-text",
  title: "Translate Text",
  domain: "utilities",
  category: "utilities",
  description: "Translate text between languages.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "TranslateText",
  title: "Translate Text",
  description: "Translates text from one language to another.",
  domain: "utilities",
  params: {
    text: param.string("Text to translate"),
    targetLanguage: param.string("Target language (e.g., Spanish, French, Mandarin)"),
    sourceLanguage: param.string("Source language", { default: "Auto-detect", required: false }),
  },
  perform: async ({ text, targetLanguage }) => {
    return { translated: "", language: targetLanguage };
  },
});
`,
};

const checkWeather: IntentTemplate = {
  id: "check-weather",
  name: "check-weather",
  title: "Check Weather",
  domain: "utilities",
  category: "utilities",
  description: "Check weather conditions for a location.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CheckWeather",
  title: "Check Weather",
  description: "Retrieves weather information for a specified location.",
  domain: "utilities",
  params: {
    location: param.string("City name or address"),
    unit: param.string("Temperature unit (Fahrenheit, Celsius)", { default: "Fahrenheit" }),
  },
  perform: async ({ location }) => {
    return { temperature: 72, condition: "Sunny", location: location };
  },
});
`,
};

const addToCart: IntentTemplate = {
  id: "add-to-cart",
  name: "add-to-cart",
  title: "Add to Cart",
  domain: "commerce",
  category: "commerce",
  description: "Add an item to a shopping cart with quantity.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "Product",
  display: {
    title: "name",
    subtitle: "price",
  },
  properties: {
    id: param.string("Product identifier"),
    name: param.string("Product name"),
    price: param.string("Product price"),
  },
  query: "string",
});

export default defineIntent({
  name: "AddToCart",
  title: "Add to Cart",
  description: "Adds an item to the shopping cart.",
  domain: "commerce",
  params: {
    productId: param.string("Product identifier or name"),
    quantity: param.int("Quantity to add", { default: 1 }),
  },
  perform: async ({ productId, quantity }) => {
    return { added: true, cartSize: 0 };
  },
});
`,
};

const bookAppointment: IntentTemplate = {
  id: "book-appointment",
  name: "book-appointment",
  title: "Book Appointment",
  domain: "productivity",
  category: "productivity",
  description: "Book an appointment with a service provider on a specific date.",
  source: `import { defineIntent, defineEntity, param } from "@axint/compiler";

defineEntity({
  name: "ServiceProvider",
  display: {
    title: "name",
    subtitle: "service",
  },
  properties: {
    id: param.string("Provider identifier"),
    name: param.string("Provider name"),
    service: param.string("Service type"),
  },
  query: "string",
});

export default defineIntent({
  name: "BookAppointment",
  title: "Book Appointment",
  description: "Books an appointment with a service provider.",
  domain: "productivity",
  params: {
    date: param.date("Appointment date and time"),
    serviceType: param.string("Type of service (haircut, massage, consultation, etc.)"),
    provider: param.string("Provider name or ID", { required: false }),
    notes: param.string("Special requests or notes", { required: false }),
  },
  perform: async ({ date, serviceType }) => {
    return { appointmentId: "appt_placeholder", confirmed: true };
  },
});
`,
};

const runShortcut: IntentTemplate = {
  id: "run-shortcut",
  name: "run-shortcut",
  title: "Run Shortcut",
  domain: "utilities",
  category: "utilities",
  description: "Run another shortcut or automation by name.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "RunShortcut",
  title: "Run Shortcut",
  description: "Runs another shortcut or automation by name with optional parameters.",
  domain: "utilities",
  params: {
    shortcutName: param.string("Name of the shortcut to run"),
    parameters: param.string("Parameters to pass (JSON format)", { required: false }),
    waitForCompletion: param.boolean("Wait for completion", { default: true }),
  },
  perform: async ({ shortcutName }) => {
    return { executed: true, result: null };
  },
});
`,
};

const foundationModelSession: IntentTemplate = {
  id: "foundation-model-session",
  name: "foundation-model-session",
  title: "Foundation Model Session",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold an App Intent that hands work to Apple's Foundation Models framework.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "SummarizeWithModel",
  title: "Summarize With Model",
  description: "Summarizes text with an Apple Foundation Models session.",
  schemaDomain: "assistant",
  params: {
    sourceText: param.string("Text to summarize"),
    audience: param.string("Who the summary is for", { required: false }),
  },
  perform: async ({ sourceText }) => {
    // Swift implementation hint:
    // import FoundationModels
    // let session = LanguageModelSession()
    // let response = try await session.respond(to: Prompt("Summarize: ..."))
    return { summary: "Replace with Foundation Models output" };
  },
});
`,
};

const foundationModelTool: IntentTemplate = {
  id: "foundation-model-tool",
  name: "foundation-model-tool",
  title: "Foundation Model Tool",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a model-backed App Intent with a place to wire a FoundationModels Tool.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "PlanWithTool",
  title: "Plan With Tool",
  description: "Uses a model tool to produce a structured app-side plan.",
  schemaDomain: "assistant",
  params: {
    request: param.string("User request"),
    context: param.string("Relevant app context", { required: false }),
  },
  perform: async ({ request }) => {
    // Swift implementation hint:
    // import FoundationModels
    // struct AppDataTool: Tool {
    //   let name = "app_data_lookup"
    //   let description = "Reads safe, user-authorized app context."
    //   func call(arguments: AppDataArguments) async throws -> AppDataResult {
    //     try await fetchAuthorizedContext(arguments)
    //   }
    // }
    //
    // let promptVersion = "plan-with-tool.v1"
    // let safeContext = redactSensitiveFields(context)
    // let session = LanguageModelSession(tools: [AppDataTool()])
    // let response = try await session.respond(
    //   to: Prompt("Use trusted app context only: \\(safeContext). Request: \\(request)")
    // )
    // let transcript = session.transcript
    // Persist promptVersion, transcript metadata, and tool-call counts for Cloud proof.
    return { plan: "Replace with Foundation Models tool output" };
  },
});
`,
};

const privateCloudModelIntent: IntentTemplate = {
  id: "private-cloud-model-intent",
  name: "private-cloud-model-intent",
  title: "Private Cloud Model Intent",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold an intent that can move from on-device models to Private Cloud Compute.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ReasonWithPrivateCloud",
  title: "Reason With Private Cloud",
  description: "Runs a higher-context model workflow for app-specific reasoning.",
  schemaDomain: "assistant",
  supportedModes: "[.foreground, .background]",
  params: {
    task: param.string("Reasoning task"),
    constraints: param.string("Constraints to respect", { required: false }),
  },
  perform: async ({ task }) => {
    // Swift implementation hint:
    // import FoundationModels
    // Use SystemLanguageModel first, then adopt PrivateCloudComputeLanguageModel
    // when the task needs larger context or deeper reasoning.
    return { result: "Replace with Private Cloud Compute model output" };
  },
});
`,
};

const longRunningProgressIntent: IntentTemplate = {
  id: "long-running-progress-intent",
  name: "long-running-progress-intent",
  title: "Long-Running Progress Intent",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold an intent that marks long-running work and progress reporting explicitly.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "BuildResearchBrief",
  title: "Build Research Brief",
  description: "Runs a longer model-backed workflow with progress proof.",
  schemaDomain: "assistant",
  conformsTo: ["LongRunningIntent", "ProgressReportingIntent"],
  supportedModes: "[.foreground, .background]",
  params: {
    topic: param.string("Brief topic"),
    sources: param.array(param.string("Source URL or note"), "Sources to include", {
      required: false,
    }),
  },
  perform: async ({ topic }) => {
    // Swift implementation hint:
    // Use performBackgroundTask(options: LongRunningTaskOptions(...)) for
    // background runtime and report progress as milestones complete.
    return { briefId: \`brief-\${topic}\` };
  },
});
`,
};

const interactiveSnippetIntent: IntentTemplate = {
  id: "interactive-snippet-intent",
  name: "interactive-snippet-intent",
  title: "Interactive Snippet Intent",
  domain: "apple-intelligence",
  category: "snippets",
  description:
    "Scaffold a snippet-backed App Intent flow for confirmation or follow-up actions.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ConfirmTicketSearch",
  title: "Confirm Ticket Search",
  description: "Presents a snippet-backed confirmation before continuing.",
  schemaDomain: "assistant",
  conformsTo: ["SnippetIntent"],
  params: {
    eventName: param.string("Event name"),
    ticketCount: param.int("Ticket count", { default: 2 }),
  },
  perform: async ({ eventName }) => {
    // Swift implementation hint:
    // Return some IntentResult & ShowsSnippetIntent from the real Swift
    // perform() and call requestConfirmation(..., snippetIntent: ...).
    return { confirmation: \`Review tickets for \${eventName}\` };
  },
});
`,
};

const systemShortcutBridge: IntentTemplate = {
  id: "system-shortcut-bridge",
  name: "system-shortcut-bridge",
  title: "System Shortcut Bridge",
  domain: "automation",
  category: "shortcuts",
  description:
    "Scaffold an intent that bridges app data into a system shortcut workflow.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "RunMorningAutomation",
  title: "Run Morning Automation",
  description: "Runs a named system shortcut with app context.",
  schemaDomain: "assistant",
  conformsTo: ["RunSystemShortcutIntent"],
  params: {
    shortcutName: param.string("Shortcut name"),
    context: param.string("Context payload", { required: false }),
  },
  perform: async ({ shortcutName }) => {
    // Swift implementation hint:
    // Resolve the system shortcut target, pass app context, and attach
    // Xcode 27 proof that the target exists on the current OS build.
    return { shortcutName };
  },
});
`,
};

const entityCollectionSearch: IntentTemplate = {
  id: "entity-collection-search",
  name: "entity-collection-search",
  title: "Entity Collection Search",
  domain: "apple-intelligence",
  category: "entities",
  description: "Scaffold an intent that accepts a collection of schema-backed entities.",
  source: `import { defineEntity, defineIntent, param } from "@axint/compiler";

defineEntity({
  name: "InboxMessage",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesEntity.message",
  syncable: true,
  indexed: true,
  indexedQuery: true,
  ownership: "shared",
  display: {
    title: "subject",
    subtitle: "sender",
  },
  properties: {
    id: param.string("Stable message identifier"),
    subject: param.string("Message subject"),
    sender: param.string("Sender name"),
  },
  query: "string",
});

export default defineIntent({
  name: "SummarizeInboxMessages",
  title: "Summarize Inbox Messages",
  description: "Summarizes a selected collection of messages.",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesIntent.sendMessage",
  params: {
    messages: param.entityCollection("InboxMessage", "Messages to summarize"),
  },
  perform: async ({ messages }) => {
    return { count: Array.isArray(messages) ? messages.length : 0 };
  },
});
`,
};

const unionValueRouter: IntentTemplate = {
  id: "union-value-router",
  name: "union-value-router",
  title: "Union Value Router",
  domain: "apple-intelligence",
  category: "entities",
  description: "Scaffold an intent that routes work across union-value style cases.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "RouteAssistantValue",
  title: "Route Assistant Value",
  description: "Routes an assistant value into the right app workflow.",
  schemaDomain: "assistant",
  params: {
    valueKind: param.string("Union value case"),
    payload: param.string("Serialized value payload"),
  },
  perform: async ({ valueKind }) => {
    // Swift implementation hint:
    // Define the concrete Swift union with @UnionValue and make its cases
    // enum adopt AppUnionValueCasesProviding before wiring this router.
    return { routedTo: valueKind };
  },
});
`,
};

const appIntentsTestingHarness: IntentTemplate = {
  id: "appintents-testing-harness",
  name: "appintents-testing-harness",
  title: "AppIntentsTesting Harness",
  domain: "apple-intelligence",
  category: "testing",
  description:
    "Scaffold a schema-backed intent with an evaluation contract for Siri, Shortcuts, and Spotlight proof.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "VerifyReminderIntentPath",
  title: "Verify Reminder Intent Path",
  description: "Exercises a schema-backed App Intent through user-facing system paths.",
  schemaDomain: "reminders",
  schema: "AppSchema.RemindersIntent.createReminder",
  params: {
    title: param.string("Reminder title"),
    dueDate: param.date("Due date", { required: false }),
  },
  evaluation: {
    suite: "ReminderIntentPathEvaluations",
    scenarios: ["siri-request", "shortcuts-run", "spotlight-suggestion"],
    criteria: ["intent resolves", "parameters bind", "result is visible"],
  },
  perform: async ({ title }) => {
    // Swift proof hint:
    // Add AppIntentsTesting coverage for Siri, Shortcuts, and Spotlight before release.
    return { title };
  },
});
`,
};

const visualIntelligenceRouter: IntentTemplate = {
  id: "visual-intelligence-router",
  name: "visual-intelligence-router",
  title: "Visual Intelligence Router",
  domain: "apple-intelligence",
  category: "visual-intelligence",
  description:
    "Scaffold an intent that maps a visual result into app search or object-specific actions.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "RouteVisualResult",
  title: "Route Visual Result",
  description: "Routes a Visual Intelligence result into the right app workflow.",
  schemaDomain: "visual-intelligence",
  params: {
    objectLabel: param.string("Detected object label"),
    sourceContext: param.string("Screenshot, camera, or scene context", {
      required: false,
    }),
  },
  previewProof: {
    view: "VisualResultRouteView",
    variants: ["light", "dark", "landscape"],
  },
  perform: async ({ objectLabel }) => {
    // Swift proof hint:
    // Attach screenshot fixtures and Xcode 27 evidence that detected objects map correctly.
    return { routedObject: objectLabel };
  },
});
`,
};

const imagePlaygroundIntent: IntentTemplate = {
  id: "image-playground-intent",
  name: "image-playground-intent",
  title: "Image Playground Intent",
  domain: "apple-intelligence",
  category: "image-playground",
  description:
    "Scaffold an intent for generating an image artifact with style, safety, and proof metadata.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "GenerateCampaignImage",
  title: "Generate Campaign Image",
  description: "Creates a generated image with an Image Playground handoff.",
  schemaDomain: "assistant",
  params: {
    prompt: param.string("Image prompt"),
    style: param.string("Requested visual style", { required: false }),
    audience: param.string("Audience or campaign context", { required: false }),
  },
  evaluation: {
    suite: "CampaignImageEvaluations",
    scenarios: ["safe-prompt", "style-match", "empty-context"],
    criteria: ["artifact returned", "style respected", "safety constraints held"],
  },
  perform: async ({ prompt }) => {
    // Swift proof hint:
    // Attach generated-image evidence before calling this demo-ready.
    return { prompt, artifact: "Replace with generated image handle" };
  },
});
`,
};

const multimodalFoundationModel: IntentTemplate = {
  id: "multimodal-foundation-model",
  name: "multimodal-foundation-model",
  title: "Multimodal Foundation Model",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a Foundation Models intent that accepts text plus image input and records evaluation proof.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateVisualBrief",
  title: "Create Visual Brief",
  description: "Creates a grounded visual brief from a prompt and image input.",
  schemaDomain: "assistant",
  params: {
    prompt: param.string("Brief prompt"),
    sourceImage: param.string("Image asset, URL, or fixture identifier", {
      required: false,
    }),
  },
  model: {
    sessionName: "VisualBriefSession",
    provider: "apple-on-device",
    useCase: "visual-briefing",
    instructions: "Use the supplied text and image evidence before generating a brief.",
    promptVersion: "wwdc26-multimodal-v1",
    modalities: ["text", "image"],
    imageInputs: [
      { name: "sourceImage", source: "parameter", required: false },
    ],
  },
  evaluation: {
    suite: "VisualBriefEvaluations",
    scenarios: ["text-only", "image-with-text"],
    criteria: ["uses image evidence", "keeps claims grounded"],
    fixtures: ["Fixtures/visual-brief/source.png"],
    metrics: ["groundedness", "latency"],
  },
  perform: async ({ prompt }) => {
    return { brief: prompt };
  },
});
`,
};

const customLanguageModelProvider: IntentTemplate = {
  id: "custom-language-model-provider",
  name: "custom-language-model-provider",
  title: "Custom Language Model Provider",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a custom Language Model provider session with protocol-conformance proof notes.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "RunBrandModel",
  title: "Run Brand Model",
  description: "Routes a prompt through a custom Language Model provider.",
  schemaDomain: "assistant",
  params: {
    prompt: param.string("Prompt for the custom model"),
  },
  model: {
    sessionName: "BrandModelSession",
    provider: "custom-language-model",
    instructions: "Answer using the brand model provider.",
    customProvider: {
      packageName: "BrandModelKit",
      typeName: "BrandLanguageModel",
      configuration: "BrandLanguageModel.Configuration(profile: .default)",
    },
  },
  perform: async ({ prompt }) => {
    return { output: prompt };
  },
});
`,
};

const viewAnnotationEntity: IntentTemplate = {
  id: "view-annotation-entity",
  name: "view-annotation-entity",
  title: "View Annotation Entity",
  domain: "apple-intelligence",
  category: "views",
  description:
    "Scaffold proof metadata for views that expose visible AppEntity identifiers to Apple Intelligence.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "VerifyVisibleEntityAnnotation",
  title: "Verify Visible Entity Annotation",
  description: "Records proof that a SwiftUI view maps visible content to an AppEntity identifier.",
  schemaDomain: "assistant",
  params: {
    entityName: param.string("AppEntity type name"),
    identifier: param.string("Visible entity identifier"),
    viewName: param.string("SwiftUI view name"),
  },
  previewProof: {
    view: "AnnotatedEntityView",
    variants: ["default", "accessibilityExtraLarge"],
  },
  perform: async ({ entityName, identifier }) => {
    // Swift proof hint:
    // In the paired view, apply .appEntityIdentifier(EntityIdentifier(for: Entity.self, identifier: id)).
    return { entityName, identifier };
  },
});
`,
};

const spotlightSemanticIndex: IntentTemplate = {
  id: "spotlight-semantic-index",
  name: "spotlight-semantic-index",
  title: "Spotlight Semantic Index",
  domain: "apple-intelligence",
  category: "entities",
  description:
    "Scaffold a schema-backed entity with Spotlight semantic index proof metadata.",
  source: `import { defineEntity, defineIntent, param } from "@axint/compiler";

defineEntity({
  name: "ResearchNote",
  schemaDomain: "notes",
  schema: "AppSchema.NotesEntity.note",
  syncable: true,
  indexed: true,
  indexedQuery: true,
  display: {
    title: "title",
    subtitle: "summary",
  },
  properties: {
    id: param.string("Stable note identifier"),
    title: param.string("Note title"),
    summary: param.string("Short summary"),
  },
  query: "string",
  semanticIndex: {
    contentType: "note",
    searchableByLLM: true,
    attribution: "Research notes owned by the current account",
    attributes: ["title", "summary"],
  },
});

export default defineIntent({
  name: "SearchResearchNotes",
  title: "Search Research Notes",
  description: "Searches semantically indexed research notes.",
  schemaDomain: "notes",
  params: {
    query: param.string("Search query"),
  },
  perform: async ({ query }) => {
    return { query };
  },
});
`,
};

const imagePlaygroundPcc: IntentTemplate = {
  id: "image-playground-pcc",
  name: "image-playground-pcc",
  title: "Image Playground PCC",
  domain: "apple-intelligence",
  category: "image-playground",
  description:
    "Scaffold an Image Playground flow with Private Cloud Compute proof requirements.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "GenerateProductScene",
  title: "Generate Product Scene",
  description: "Generates a product scene through Image Playground with PCC proof notes.",
  schemaDomain: "assistant",
  params: {
    prompt: param.string("Scene prompt"),
    sourceImage: param.string("Product image asset or fixture", { required: false }),
  },
  imagePlayground: {
    conceptParam: "prompt",
    sourceImageParam: "sourceImage",
    style: "photorealistic",
    dimensions: "landscape",
    mode: "programmatic",
    privateCloudCompute: true,
  },
  perform: async ({ prompt }) => {
    return { prompt, artifact: "Attach generated image artifact" };
  },
});
`,
};

const ocrVisionTool: IntentTemplate = {
  id: "ocr-vision-tool",
  name: "ocr-vision-tool",
  title: "OCR Vision Tool",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a Foundation Models tool that extracts text from image fixtures.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ReadImageText",
  title: "Read Image Text",
  description: "Extracts readable text from an image before model reasoning.",
  schemaDomain: "assistant",
  params: {
    image: param.string("Image fixture or asset identifier"),
  },
  model: {
    sessionName: "ImageTextSession",
    provider: "apple-on-device",
    instructions: "Use OCR output before answering.",
    modalities: ["text", "image"],
    imageInputs: [
      { name: "image", source: "parameter", required: true },
    ],
    tools: [
      {
        name: "OCRVisionTool",
        description: "Extracts text from the supplied image.",
        kind: "ocr",
        outputType: "[String]",
      },
    ],
  },
  perform: async ({ image }) => {
    return { image };
  },
});
`,
};

const barcodeVisionTool: IntentTemplate = {
  id: "barcode-vision-tool",
  name: "barcode-vision-tool",
  title: "Barcode Vision Tool",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a Foundation Models tool that reads barcode data from image fixtures.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ReadProductBarcode",
  title: "Read Product Barcode",
  description: "Reads a barcode from an image before model reasoning.",
  schemaDomain: "assistant",
  params: {
    image: param.string("Image fixture or asset identifier"),
  },
  model: {
    sessionName: "BarcodeSession",
    provider: "apple-on-device",
    instructions: "Use barcode results before answering.",
    modalities: ["text", "image"],
    imageInputs: [
      { name: "image", source: "parameter", required: true },
    ],
    tools: [
      {
        name: "BarcodeVisionTool",
        description: "Reads barcode values from the supplied image.",
        kind: "barcode",
        outputType: "[String]",
      },
    ],
  },
  perform: async ({ image }) => {
    return { image };
  },
});
`,
};

const stringCatalogLocalizer: IntentTemplate = {
  id: "string-catalog-localizer",
  name: "string-catalog-localizer",
  title: "String Catalog Localizer",
  domain: "productivity",
  category: "localization",
  description:
    "Scaffold a workflow for generating and proving String Catalog localization updates.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LocalizeStringCatalog",
  title: "Localize String Catalog",
  description: "Updates Localizable.xcstrings with reviewed generated translations.",
  domain: "localization",
  conformsTo: ["LongRunningIntent", "ProgressReportingIntent"],
  supportedModes: "[.foreground, .background]",
  params: {
    catalogPath: param.string("Path to Localizable.xcstrings"),
    locale: param.string("Target locale identifier"),
    reviewMode: param.string("Review mode, such as draft or approved", {
      default: "draft",
    }),
  },
  perform: async ({ catalogPath, locale }) => {
    // Swift proof hint:
    // Attach the updated .xcstrings artifact and locale coverage evidence.
    return { catalogPath, locale };
  },
});
`,
};

const resizableLayoutProof: IntentTemplate = {
  id: "resizable-layout-proof",
  name: "resizable-layout-proof",
  title: "Resizable Layout Proof",
  domain: "developer-tools",
  category: "preview-proof",
  description:
    "Scaffold a proof intent that tracks adaptive SwiftUI layout snapshots across iOS sizes.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "VerifyResizableLayout",
  title: "Verify Resizable Layout",
  description: "Records Preview Snapshot proof for adaptive iOS SwiftUI layouts.",
  domain: "developer-tools",
  params: {
    viewName: param.string("SwiftUI view name"),
    targetSize: param.string("Target size class or preview variant"),
    dynamicType: param.string("Dynamic Type size", { required: false }),
  },
  previewProof: {
    view: "ResizableLayoutPreview",
    variants: ["compact", "regular", "landscape", "accessibilityExtraLarge"],
  },
  perform: async ({ viewName, targetSize }) => {
    // Swift proof hint:
    // Attach Preview Snapshot baselines instead of relying on fixed device-sized frames.
    return { viewName, targetSize };
  },
});
`,
};

const swiftuiReorderableSwipeContainer: IntentTemplate = {
  id: "swiftui-reorderable-swipe-container",
  name: "swiftui-reorderable-swipe-container",
  title: "SwiftUI Reorderable Swipe Container",
  domain: "developer-tools",
  category: "swiftui",
  description:
    "Scaffold a proof intent with WWDC26 SwiftUI notes for reorderable custom containers and swipe actions outside List.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "ManageQueue",
  title: "Manage Queue",
  description: "Records the SwiftUI proof plan for a custom reorderable queue with swipe actions.",
  domain: "developer-tools",
  params: {
    collectionName: param.string("Name of the collection being reordered"),
    itemCount: param.int("Number of visible items", { default: 5 }),
  },
  perform: async ({ collectionName, itemCount }) => {
    // SwiftUI implementation hint:
    // struct QueueView: View {
    //   @State private var items: [QueueItem]
    //
    //   var body: some View {
    //     ScrollView {
    //       LazyVStack(spacing: 8) {
    //         ForEach(items) { item in
    //           QueueRow(item: item)
    //             .swipeActions {
    //               Button("Archive", role: .destructive) { archive(item) }
    //             }
    //         }
    //         .reorderable()
    //       }
    //     }
    //     .swipeActionsContainer()
    //     .reorderContainer(for: QueueItem.self) { difference in
    //       difference.apply(to: &items)
    //     }
    //   }
    // }
    //
    // Proof: attach a UI test that drags two rows, performs one swipe action,
    // and records the before/after order plus the archived item identifier.
    return { collectionName, itemCount };
  },
});
`,
};

const foundationModelsCustomProvider: IntentTemplate = {
  id: "foundation-models-custom-provider",
  name: "foundation-models-custom-provider",
  title: "Foundation Models Custom Provider",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a session backed by a LanguageModel-protocol provider that falls back to the on-device model when the provider is unavailable.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "DraftWithHouseModel",
  title: "Draft With House Model",
  description: "Drafts a reply through a custom LanguageModel provider with an on-device fallback.",
  schemaDomain: "assistant",
  params: {
    prompt: param.string("Draft prompt"),
  },
  model: {
    sessionName: "HouseModelSession",
    provider: "custom-language-model",
    useCase: "reply-drafting",
    instructions: "Draft a reply in the account voice and keep claims grounded.",
    customProvider: {
      packageName: "HouseModelKit",
      typeName: "HouseLanguageModel",
      configuration: "HouseLanguageModel.Configuration(deployment: .production)",
    },
    dynamicProfiles: [
      {
        name: "houseModel",
        provider: "custom-language-model",
        instructions: "Use the house model whenever the provider is reachable.",
      },
      {
        name: "onDeviceFallback",
        provider: "apple-on-device",
        instructions: "Fall back to the system model when the house provider is unavailable.",
      },
    ],
  },
  perform: async ({ prompt }) => {
    // Swift proof hint:
    // Attach evidence that the session degrades to the on-device profile when the provider is offline.
    return { draft: prompt };
  },
});
`,
};

const appIntentsTestingXctestHarness: IntentTemplate = {
  id: "app-intents-testing-harness",
  name: "app-intents-testing-harness",
  title: "App Intents Testing Harness",
  domain: "apple-intelligence",
  category: "testing",
  description:
    "Scaffold an intent plus an AppIntentsTesting XCTest harness that drives perform() with sample inputs.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LogReadingSession",
  title: "Log Reading Session",
  description: "Logs a reading session so the harness can exercise perform() end to end.",
  domain: "productivity",
  params: {
    bookTitle: param.string("Book title"),
    minutes: param.int("Minutes read"),
  },
  testHarness: {
    className: "LogReadingSessionIntentTests",
  },
  perform: async ({ bookTitle, minutes }) => {
    return { bookTitle, minutes };
  },
});
`,
};

const dynamicProfileSession: IntentTemplate = {
  id: "dynamic-profile-session",
  name: "dynamic-profile-session",
  title: "Dynamic Profile Session",
  domain: "apple-intelligence",
  category: "foundation-models",
  description:
    "Scaffold a Foundation Models session that selects a DynamicProfile per request context.",
  source: `import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CoachNextWorkout",
  title: "Coach Next Workout",
  description: "Coaches the next workout with a profile matched to the athlete's context.",
  schemaDomain: "assistant",
  params: {
    goal: param.string("Training goal"),
  },
  model: {
    sessionName: "WorkoutCoachSession",
    provider: "apple-on-device",
    useCase: "workout-coaching",
    instructions: "Coach with the active profile's tone and scope.",
    dynamicProfile: "quickTips",
    dynamicProfiles: [
      {
        name: "quickTips",
        instructions: "Short, actionable cues between sets.",
      },
      {
        name: "weeklyPlan",
        provider: "private-cloud-compute",
        instructions: "Full-week periodized plans that need the larger model.",
      },
    ],
  },
  perform: async ({ goal }) => {
    // Swift implementation hint:
    // import FoundationModels
    // let selectedProfile = goal.contains("week") ? "weeklyPlan" : "quickTips"
    // let profileSwitchProof = "selectedProfile=\\(selectedProfile)"
    // let session = LanguageModelSession(
    //   tools: [WorkoutHistoryTool()],
    //   profile: DynamicProfile(selectedProfile),
    //   instructions: "Use the selected profile's tools and instruction scope."
    // )
    // let response = try await session.respond(to: Prompt(goal))
    // let transcript = session.transcript
    // Persist selectedProfile, profileSwitchProof, transcript metadata, and tool-call counts.
    return { goal };
  },
});
`,
};

// ─── Registry ────────────────────────────────────────────────────────

export const TEMPLATES: IntentTemplate[] = [
  sendMessage,
  createEvent,
  bookRide,
  getDirections,
  playTrack,
  createNote,
  logExpense,
  logWorkout,
  setThermostat,
  placeOrder,
  searchTasks,
  dynamicPlaylist,
  planTrail,
  setTimer,
  searchNotes,
  createReminder,
  toggleSetting,
  shareContent,
  navigateTo,
  playMusic,
  scanDocument,
  translateText,
  checkWeather,
  addToCart,
  bookAppointment,
  runShortcut,
  foundationModelSession,
  foundationModelTool,
  privateCloudModelIntent,
  longRunningProgressIntent,
  interactiveSnippetIntent,
  systemShortcutBridge,
  entityCollectionSearch,
  unionValueRouter,
  appIntentsTestingHarness,
  visualIntelligenceRouter,
  imagePlaygroundIntent,
  multimodalFoundationModel,
  customLanguageModelProvider,
  viewAnnotationEntity,
  spotlightSemanticIndex,
  imagePlaygroundPcc,
  ocrVisionTool,
  barcodeVisionTool,
  stringCatalogLocalizer,
  resizableLayoutProof,
  swiftuiReorderableSwipeContainer,
  foundationModelsCustomProvider,
  appIntentsTestingXctestHarness,
  dynamicProfileSession,
];

/** @deprecated Use TEMPLATES. Kept for v0.1.x import compatibility. */
export const templates = TEMPLATES;

export function getTemplate(id: string): IntentTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(category?: string): IntentTemplate[] {
  if (category) {
    return TEMPLATES.filter((t) => t.category === category);
  }
  return TEMPLATES;
}
