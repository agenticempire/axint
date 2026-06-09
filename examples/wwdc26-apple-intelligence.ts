import { defineEntity, defineIntent, param } from "@axint/compiler";

defineEntity({
  name: "TravelMessage",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesEntity.message",
  syncable: true,
  indexed: true,
  indexedQuery: true,
  ownership: "shared",
  display: {
    title: "name",
    subtitle: "thread",
    image: "message",
  },
  properties: {
    id: param.string("Stable message identifier"),
    name: param.string("Message summary"),
    thread: param.string("Conversation thread"),
  },
  query: "string",
});

export default defineIntent({
  name: "SummarizeTravelMessage",
  title: "Summarize Travel Message",
  description:
    "Summarizes a shared travel message and prepares it for an app workflow.",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesIntent.sendMessage",
  conformsTo: ["LongRunningIntent", "CancellableIntent"],
  supportedModes: "[.foreground, .background]",
  allowedExecutionTargets: ".main",
  params: {
    message: param.entity("TravelMessage", "Message to summarize"),
    audience: param.string("Who the summary is for", { required: false }),
  },
  perform: async ({ message }) => {
    // Swift implementation hint:
    // import FoundationModels
    // let session = LanguageModelSession()
    // Run the prompt against the current OS model, then attach Cloud Check proof.
    return { summary: `Replace with Foundation Models output for ${message}` };
  },
});
