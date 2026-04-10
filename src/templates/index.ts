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
  description:
    "Create a playlist with dynamic option suggestions powered by DynamicOptionsProvider.",
  source: `import { defineIntent, param } from "@axintai/compiler";

export default defineIntent({
  name: "DynamicPlaylist",
  title: "Create Dynamic Playlist",
  description: "Create a playlist with dynamically suggested moods or genres.",
  domain: "media",
  params: {
    name: param.string("Playlist name"),
    mood: param.dynamicOptions(
      "MoodProvider",
      param.string("Mood for the playlist")
    ),
  },
  customResultType: "PlaylistResultView",
  perform: async ({ name, mood }) => {
    // TODO: Implement playlist creation
    // mood comes from the DynamicOptionsProvider
    return { playlistId: "playlist_placeholder" };
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
