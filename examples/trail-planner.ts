import { defineIntent, defineEntity, param } from "@axint/compiler";

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
    openNow: param.boolean("Whether the trail is open"),
  },
  query: "property",
});

export default defineIntent({
  name: "PlanTrail",
  title: "Plan Trail",
  description: "Build a trail plan from queryable entities and runtime options.",
  parameterSummary: {
    switch: "includeNearby",
    cases: [
      {
        value: true,
        summary: {
          when: "region",
          then: "Plan ${activity} on ${trail} near ${region}",
          otherwise: "Plan ${activity} on ${trail} near me",
        },
      },
      {
        value: false,
        summary: "Plan ${activity} on ${trail}",
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
  perform: async ({ activity, trail, includeNearby, region }) => {
    return {
      planned: true,
      activity,
      trail,
      includeNearby,
      region,
    };
  },
});
