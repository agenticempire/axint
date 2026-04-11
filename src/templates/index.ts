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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, defineEntity, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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

const setTimer: IntentTemplate = {
  id: "set-timer",
  name: "set-timer",
  title: "Set Timer",
  domain: "utilities",
  category: "utilities",
  description: "Set a timer with a duration and optional label.",
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, defineEntity, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, defineEntity, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
  source: `import { defineIntent, defineEntity, param } from "@axintai/compiler";

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
  source: `import { defineIntent, defineEntity, param } from "@axintai/compiler";

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
  source: `import { defineIntent, param } from "@axintai/compiler";

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
