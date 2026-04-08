/**
 * Intent Template Registry
 *
 * Pre-built intent templates for common App Intent patterns.
 * Templates provide a starting point that users can customize.
 */

export interface IntentTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category for filtering (messaging, productivity, etc.) */
  category: string;
  /** Description of what this template generates */
  description: string;
  /** The TypeScript source template (uses defineIntent API) */
  source: string;
}

// TODO: Import and register templates as they're created
// import { calendarTemplate } from "./calendar.js";
// import { messagingTemplate } from "./messaging.js";

export const templates: IntentTemplate[] = [
  // Templates will be registered here as the community contributes them
];

export function getTemplate(id: string): IntentTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function listTemplates(category?: string): IntentTemplate[] {
  if (category) {
    return templates.filter((t) => t.category === category);
  }
  return templates;
}
