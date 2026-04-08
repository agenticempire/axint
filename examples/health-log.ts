/**
 * Health Log Intent — Log a health measurement
 *
 * Demonstrates: date params, duration, URL, optional fields
 */
import { defineIntent, param } from "axint";

export default defineIntent({
  name: "LogHealthMetric",
  title: "Log Health Metric",
  description: "Records a health measurement like weight, blood pressure, or exercise",
  domain: "health",
  params: {
    metric: param.string("What you're logging (e.g., weight, steps)"),
    value: param.number("The measurement value"),
    date: param.date("When the measurement was taken"),
    duration: param.duration("Activity duration", { required: false }),
    notes: param.string("Additional notes", { required: false }),
  },
  perform: async ({ metric, value, date }) => {
    return { logged: true, metric, value, date };
  },
});
