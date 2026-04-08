/**
 * Smart Home Intent — Control lights
 *
 * Demonstrates: number defaults, boolean params, multiple param types
 */
import { defineIntent, param } from "axint";

export default defineIntent({
  name: "SetLights",
  title: "Set Lights",
  description: "Adjusts the smart lights in a room",
  domain: "smart-home",
  params: {
    room: param.string("Which room to control"),
    brightness: param.number("Brightness percentage (0-100)", { default: 100 }),
    on: param.boolean("Turn lights on or off", { default: true }),
  },
  perform: async ({ room, brightness, on }) => {
    return { room, brightness, on };
  },
});
