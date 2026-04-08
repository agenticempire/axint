/**
 * Example: Calendar Assistant Intent
 *
 * This shows how to define an App Intent that lets Siri
 * create calendar events through your agent.
 *
 * Run:
 *   axint compile examples/calendar-assistant.ts --out generated/
 */

import { defineIntent, param } from "../src/sdk/index.js";

export default defineIntent({
  name: "CreateCalendarEvent",
  title: "Create Calendar Event",
  description: "Creates a new event in the user's calendar",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    duration: param.duration("Event duration", { default: "1h" }),
    location: param.string("Location", { required: false }),
  },
  perform: async ({ title, date, duration, location }) => {
    return {
      success: true,
      eventId: "evt_" + Date.now(),
      message: `Created "${title}" on ${date}`,
    };
  },
});
