/**
 * Health Log Intent — Log a health measurement
 *
 * Demonstrates: HealthKit entitlements, privacy usage copy, date params,
 * optional fields, and numeric fidelity for health data.
 */
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "LogHealthMetric",
  title: "Log Health Metric",
  description: "Records a health measurement like weight, blood pressure, or exercise",
  domain: "health",
  entitlements: ["com.apple.developer.healthkit"],
  infoPlistKeys: {
    NSHealthShareUsageDescription: "Read prior health measurements to compare your progress.",
    NSHealthUpdateUsageDescription: "Save new health measurements that you log from this shortcut.",
  },
  params: {
    metric: param.string("What you're logging (e.g., weight, steps)"),
    value: param.double("The measurement value"),
    date: param.date("When the measurement was taken"),
    duration: param.duration("Activity duration", { required: false }),
    notes: param.string("Additional notes", { required: false }),
  },
  perform: async ({ metric, value, date }) => {
    return { logged: true, metric, value, date };
  },
});
