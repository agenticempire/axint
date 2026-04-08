/**
 * Messaging Intent — Send a message to a contact
 *
 * Demonstrates: string params, optional params, domain field
 */
import { defineIntent, param } from "axint";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message to a contact via your preferred messaging app",
  domain: "messaging",
  params: {
    recipient: param.string("Who to send the message to"),
    body: param.string("The message content"),
    urgent: param.boolean("Mark as urgent", { required: false }),
  },
  perform: async ({ recipient, body, urgent }) => {
    return { sent: true, recipient, body, urgent };
  },
});
