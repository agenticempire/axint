import { defineEntity, defineIntent, param } from "@axint/compiler";

defineEntity({
  name: "ResearchSource",
  schemaDomain: "assistant",
  schema: "AppSchema.AssistantEntity.document",
  syncable: true,
  indexed: true,
  indexedQuery: true,
  ownership: "shared",
  display: {
    title: "title",
    subtitle: "origin",
  },
  properties: {
    id: param.string("Stable source identifier"),
    title: param.string("Source title"),
    origin: param.string("Where this source came from"),
  },
  query: "string",
});

export default defineIntent({
  name: "BuildResearchBrief",
  title: "Build Research Brief",
  description:
    "Builds a research brief from a selected collection of assistant sources.",
  schemaDomain: "assistant",
  schema: "AppSchema.AssistantIntent.summarize",
  conformsTo: ["LongRunningIntent", "ProgressReportingIntent"],
  supportedModes: "[.foreground, .background]",
  params: {
    sources: param.entityCollection("ResearchSource", "Sources to include"),
    tags: param.array(param.string("Tag"), "Tags", { required: false }),
  },
  perform: async ({ sources }) => {
    // Swift implementation hint:
    // Use performBackgroundTask(options: LongRunningTaskOptions(...)) and
    // report progress as each source is processed.
    return { sourceCount: Array.isArray(sources) ? sources.length : 0 };
  },
});
