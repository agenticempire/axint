# Axint Ship Kits Sprint

Axint Ship Kits are production Apple-native components and modules that agents can install, adapt, validate, repair, and prove. The goal is not a snippet gallery. Each completed item becomes a shippable package: Swift source, Apple contracts, variants, diagnostics coverage, tests, docs, and an Axint repair path.

## Sprint Goal

Build Axint into the all-in-one Apple shipping layer for AI agents:

- Components for common app surfaces.
- Modules for Apple frameworks and production app flows.
- App Store readiness packs for the work around the app.
- Agent-facing repair contracts so failures become Fix Packets, not copied logs.

Target backlog: 500 Ship Kits.

Daily throughput target: 10 to 20 kits.

## Board Columns

Use these columns for GitHub Projects, Linear, Notion, or a markdown sprint board:

1. Backlog
2. Selected for Day
3. Contract Written
4. Implementation
5. Variants
6. Validation and Tests
7. Docs and Registry
8. Released

## Definition of Done

Each kit is complete only when it has all of this:

- A stable package id, title, category, tags, and search terms.
- At least 5 variants: minimal, standard, premium, dense, and accessibility-first.
- Required states when applicable: loading, empty, error, disabled, success, offline.
- SwiftUI implementation that compiles without project-specific private APIs.
- Apple contract files when needed: Info.plist keys, entitlements, privacy manifest, StoreKit config, test fixture, or Xcode notes.
- One focused test or preview harness.
- A demo GIF at the standard path: `media/ship-kits/<slug>/demo.gif`.
- A poster PNG at the standard path: `media/ship-kits/<slug>/poster.png`.
- Axint validator coverage or a documented diagnostic gap.
- Fix Packet examples for the top 2 likely failure modes.
- Registry metadata and install instructions.
- One short usage prompt for agents.
- Published registry URL under the intended namespace.
- The kit is marked in the completion ledger.

## Ticket Template

```text
ID:
Name:
Category:
User value:
Agent prompt:
Variants:
- minimal
- standard
- premium
- dense
- accessibility-first
States:
Apple contracts:
Files:
Tests:
Diagnostics:
Docs:
Registry package:
Demo GIF:
Poster:
Done when:
```

## Demo Standard

Every kit gets the same visual artifact shape so the Registry can be browsed with eyes, not only code:

- `media/demo.gif` inside the first-party package source.
- `media/poster.png` beside the GIF.
- A public mirror at `media/ship-kits/<slug>/demo.gif` in the Axint repo.
- README image points to the public mirror.
- GIF size target: 960 x 720.
- GIF length target: 88 to 128 frames.
- Each GIF should show the actual behavior of the component, not a generic package card.
- Browse-card posters and GIFs must live in structured Registry metadata, not only in README markdown.

The primary render path is `axint-registry/packages/interactions`.

## Completion Ledger

Do not mark a kit done until it is published and has a visible demo asset.

| Done | Rank | ID | Package | Registry | Demo |
|---|---:|---|---|---|---|
| yes | 1 | ONB-003 | `@axint/permission-primer-view` | `https://registry.axint.ai/@axint/permission-primer-view` | `media/ship-kits/permission-primer-view/demo.gif` |
| yes | 2 | SET-003 | `@axint/privacy-settings-view` | `https://registry.axint.ai/@axint/privacy-settings-view` | `media/ship-kits/privacy-settings-view/demo.gif` |
| yes | 3 | PAY-001 | `@axint/subscription-paywall-view` | `https://registry.axint.ai/@axint/subscription-paywall-view` | `media/ship-kits/subscription-paywall-view/demo.gif` |
| yes | 4 | AUT-001 | `@axint/sign-in-with-apple-view` | `https://registry.axint.ai/@axint/sign-in-with-apple-view` | `media/ship-kits/sign-in-with-apple-view/demo.gif` |
| yes | 5 | FDB-005 | `@axint/app-state-panel-view` | `https://registry.axint.ai/@axint/app-state-panel-view` | `media/ship-kits/app-state-panel-view/demo.gif` |
| yes | 6 | UI-006 | `@axint/search-bar-view` | `https://registry.axint.ai/@axint/search-bar-view` | `media/ship-kits/search-bar-view/demo.gif` |
| yes | 7 | UI-007 | `@axint/empty-state-view` | `https://registry.axint.ai/@axint/empty-state-view` | `media/ship-kits/empty-state-view/demo.gif` |
| yes | 8 | UI-008 | `@axint/loading-skeleton-view` | `https://registry.axint.ai/@axint/loading-skeleton-view` | `media/ship-kits/loading-skeleton-view/demo.gif` |
| yes | 9 | UI-009 | `@axint/error-banner-view` | `https://registry.axint.ai/@axint/error-banner-view` | `media/ship-kits/error-banner-view/demo.gif` |
| yes | 10 | UI-010 | `@axint/toast-notification-view` | `https://registry.axint.ai/@axint/toast-notification-view` | `media/ship-kits/toast-notification-view/demo.gif` |
| yes | 11 | UI-011 | `@axint/filter-chip-row-view` | `https://registry.axint.ai/@axint/filter-chip-row-view` | `media/ship-kits/filter-chip-row-view/demo.gif` |
| yes | 12 | UI-012 | `@axint/onboarding-carousel-view` | `https://registry.axint.ai/@axint/onboarding-carousel-view` | `media/ship-kits/onboarding-carousel-view/demo.gif` |
| yes | 13 | UI-013 | `@axint/profile-completion-card-view` | `https://registry.axint.ai/@axint/profile-completion-card-view` | `media/ship-kits/profile-completion-card-view/demo.gif` |
| yes | 14 | UI-014 | `@axint/media-picker-grid-view` | `https://registry.axint.ai/@axint/media-picker-grid-view` | `media/ship-kits/media-picker-grid-view/demo.gif` |
| yes | 15 | UI-015 | `@axint/settings-row-group-view` | `https://registry.axint.ai/@axint/settings-row-group-view` | `media/ship-kits/settings-row-group-view/demo.gif` |
| yes | 16 | UI-016 | `@axint/segmented-control-view` | `https://registry.axint.ai/@axint/segmented-control-view` | `media/ship-kits/segmented-control-view/demo.gif` |
| yes | 17 | UI-017 | `@axint/bottom-sheet-view` | `https://registry.axint.ai/@axint/bottom-sheet-view` | `media/ship-kits/bottom-sheet-view/demo.gif` |
| yes | 18 | UI-018 | `@axint/modal-confirmation-view` | `https://registry.axint.ai/@axint/modal-confirmation-view` | `media/ship-kits/modal-confirmation-view/demo.gif` |
| yes | 19 | UI-019 | `@axint/form-field-stack-view` | `https://registry.axint.ai/@axint/form-field-stack-view` | `media/ship-kits/form-field-stack-view/demo.gif` |
| yes | 20 | UI-020 | `@axint/tab-bar-view` | `https://registry.axint.ai/@axint/tab-bar-view` | `media/ship-kits/tab-bar-view/demo.gif` |
| yes | 21 | UI-021 | `@axint/card-list-view` | `https://registry.axint.ai/@axint/card-list-view` | `media/ship-kits/card-list-view/demo.gif` |
| yes | 22 | UI-022 | `@axint/detail-header-view` | `https://registry.axint.ai/@axint/detail-header-view` | `media/ship-kits/detail-header-view/demo.gif` |
| yes | 23 | UI-023 | `@axint/progress-ring-view` | `https://registry.axint.ai/@axint/progress-ring-view` | `media/ship-kits/progress-ring-view/demo.gif` |
| yes | 24 | UI-024 | `@axint/rating-prompt-view` | `https://registry.axint.ai/@axint/rating-prompt-view` | `media/ship-kits/rating-prompt-view/demo.gif` |
| yes | 25 | UI-025 | `@axint/swipe-action-row-view` | `https://registry.axint.ai/@axint/swipe-action-row-view` | `media/ship-kits/swipe-action-row-view/demo.gif` |

## Procurement And Ingestion

The 1,000-package target should come from three clean sources:

- Bought or commissioned source with a written commercial license that allows redistribution through Axint.
- Permissive open-source code, especially MIT, Apache-2.0, BSD, ISC, or 0BSD, with attribution preserved.
- Original Axint-built packages from the daily sprint factory.

Red line: do not copy proprietary code and "change it enough" to hide the source. That is not a strategy. It creates copyright, trust, and takedown risk. If a package is adapted from licensed or open-source material, the source, license, and transformation notes must be recorded in the kit metadata.

## Swift To Axint Ingester

The ingester track should convert normal Swift/SwiftUI into `.axint` or TypeScript Axint source, then recompile back to Swift for proof.

Minimum ingester stages:

1. Parse Swift source and detect surface: view, component, widget, app intent, live activity, extension, store, or proof harness.
2. Extract inputs, state, actions, Apple framework requirements, plist keys, entitlements, and privacy strings.
3. Generate Axint source plus `shipkit.json`.
4. Recompile to Swift through Axint.
5. Diff original Swift against generated Swift and record drift.
6. Generate README, agent prompt, demo metadata, and Fix Packet examples.
7. Require license/provenance fields before publish.

This lets the Registry scale from purchased or permissive Swift code without turning into a legal mess or a pile of disconnected snippets.

## Daily Batch Rule

Pick 10 to 20 kits per day. Bias toward a coherent vertical slice rather than random components.

Example daily batch:

- 4 UI components
- 3 production modules
- 2 Apple system surfaces
- 2 App Store readiness packs
- 1 agent repair/proof surface

Every batch should ship with one demo app screen that uses the new kits together.

## First 10 Days

Day 1: App Store readiness foundation, release evidence, privacy, plist, entitlement, TestFlight, screenshots, version notes.

Day 2: Onboarding and activation flow, permission primers, first action prompts, trial activation, widget and shortcut prompts.

Day 3: Auth and account flows, Sign in with Apple, passkeys, reset, session expiry, account deletion.

Day 4: Paywall and monetization, StoreKit 2, restore, redeem, trial banners, compliance footer, entitlement states.

Day 5: Navigation shells and settings, tab shells, split views, command palette, route guards, settings search.

Day 6: Forms and input systems, validation, wizard forms, autosave, draft restore, attachment picker.

Day 7: Data display, lists, tables, timelines, feeds, skeletons, empty and error states.

Day 8: Charts and analytics, chart empty states, legends, comparison views, KPI cards.

Day 9: Motion and feedback, shimmer, skeletons, success/failure states, toasts, progress, conflict sheets.

Day 10: Agent/Xcode proof surfaces, Fix Packet viewer, run console, workflow check, build proof, test result cards.

## Backlog Index

Each line below contains 25 kits. Twenty epics times 25 kits gives the 500-kit target.

### ASR - App Store Readiness

ASR-001 App Store Metadata Checklist; ASR-002 Privacy Nutrition Labels; ASR-003 Privacy Manifest Generator; ASR-004 Entitlements Audit Panel; ASR-005 Info.plist Usage String Builder; ASR-006 TestFlight Readiness Checklist; ASR-007 Review Submission Pack; ASR-008 App Review Rejection Repair Packet; ASR-009 StoreKit Review Prompt Gate; ASR-010 Screenshot Shot List; ASR-011 Launch Screenshot Frame; ASR-012 Localized Metadata Matrix; ASR-013 Age Rating Wizard; ASR-014 Export Compliance Checklist; ASR-015 Data Safety Map; ASR-016 Accessibility Audit Report; ASR-017 Crash Free Release Gate; ASR-018 Build Number Release Stamp; ASR-019 Version Notes Composer; ASR-020 App Icon Asset Checklist; ASR-021 In App Purchase Review Checklist; ASR-022 Subscription Compliance Sheet; ASR-023 Account Deletion Flow Checklist; ASR-024 App Privacy Link Validator; ASR-025 Release Evidence Packet.

### ONB - Onboarding and Activation

ONB-001 Welcome Hero; ONB-002 Feature Carousel; ONB-003 Permission Primer; ONB-004 Progressive Setup; ONB-005 Account Creation; ONB-006 Profile Setup; ONB-007 Goal Picker; ONB-008 Preference Wizard; ONB-009 Import Data Prompt; ONB-010 Trial Activation; ONB-011 Paywall Handoff; ONB-012 Tutorial Coach Marks; ONB-013 Checklist Onboarding; ONB-014 Empty State Activation; ONB-015 First Action Nudge; ONB-016 Sample Data Mode; ONB-017 Invite Team; ONB-018 Notification Opt-In; ONB-019 Location Permission; ONB-020 Health Permission; ONB-021 Calendar Permission; ONB-022 Widget Install Prompt; ONB-023 Shortcut Install Prompt; ONB-024 App Intent Tryout; ONB-025 Completion Celebration.

### AUT - Auth and Identity

AUT-001 Sign in with Apple Button; AUT-002 Email Sign In Form; AUT-003 Magic Link; AUT-004 Passkey Sign In; AUT-005 OAuth Provider Row; AUT-006 Social Sign In Stack; AUT-007 MFA Code Entry; AUT-008 Password Reset; AUT-009 Account Recovery; AUT-010 Session Expired Sheet; AUT-011 Keychain Session Store; AUT-012 Anonymous Trial Gate; AUT-013 Team Invite Accept; AUT-014 Organization Switcher; AUT-015 Role Badge; AUT-016 Profile Identity Card; AUT-017 Consent Screen; AUT-018 Terms Acceptance; AUT-019 Age Gate; AUT-020 Device Trust Prompt; AUT-021 Security Settings; AUT-022 Login Activity List; AUT-023 Delete Account Flow; AUT-024 Reauth Prompt; AUT-025 Auth Error State.

### PAY - Paywall and Monetization

PAY-001 Subscription Paywall; PAY-002 Feature Comparison Paywall; PAY-003 Trial Countdown Banner; PAY-004 Usage Limit Gate; PAY-005 Upgrade Modal; PAY-006 Restore Purchases Row; PAY-007 Redeem Code Entry; PAY-008 Pricing Toggle Monthly Annual; PAY-009 StoreKit Product List; PAY-010 Transaction Status View; PAY-011 Purchase Success; PAY-012 Purchase Failure; PAY-013 Cancellation Save Flow; PAY-014 Winback Offer; PAY-015 Receipt Debug Panel; PAY-016 Family Sharing Note; PAY-017 Entitlement Badge; PAY-018 Premium Feature Lock; PAY-019 Metered Usage Card; PAY-020 Credit Pack Purchase; PAY-021 Billing Settings; PAY-022 Pro Badge; PAY-023 Promo Code Deep Link; PAY-024 Subscription Compliance Footer; PAY-025 Paywall A/B Variant.

### FRM - Forms and Input

FRM-001 Text Field Row; FRM-002 Floating Label Field; FRM-003 Search Field; FRM-004 Token Input; FRM-005 Date Picker Sheet; FRM-006 Time Picker Sheet; FRM-007 Range Slider; FRM-008 Stepper Row; FRM-009 Currency Input; FRM-010 Measurement Input; FRM-011 Phone Input; FRM-012 Email Validation Field; FRM-013 Password Strength Field; FRM-014 One Time Code Field; FRM-015 Tag Picker; FRM-016 Multi Select List; FRM-017 Attachment Picker; FRM-018 Form Section Header; FRM-019 Inline Error Label; FRM-020 Field Help Popover; FRM-021 Autosave Indicator; FRM-022 Draft Restore Banner; FRM-023 Review Form; FRM-024 Wizard Form; FRM-025 Submit Button State.

### NAV - Navigation and Layout Shells

NAV-001 Tab Bar Shell; NAV-002 Sidebar Rail; NAV-003 Split View Shell; NAV-004 Navigation Stack Shell; NAV-005 Command Palette; NAV-006 Breadcrumb Bar; NAV-007 Bottom Sheet Host; NAV-008 Floating Action Button Menu; NAV-009 Toolbar Action Group; NAV-010 Search Results Shell; NAV-011 Filter Drawer; NAV-012 Detail Inspector Pane; NAV-013 Settings Sidebar; NAV-014 Card Grid Layout; NAV-015 Dashboard Shell; NAV-016 Master Detail List; NAV-017 Modal Router; NAV-018 Deep Link Handler; NAV-019 Route Guard; NAV-020 Empty Route View; NAV-021 Error Route View; NAV-022 Sheet Detent Controller; NAV-023 Adaptive iPad Layout; NAV-024 macOS Menu Commands; NAV-025 Keyboard Shortcut Overlay.

### DAT - Data Display and Lists

DAT-001 List Row; DAT-002 Swipe Action Row; DAT-003 Sectioned List; DAT-004 Infinite Feed; DAT-005 Pull To Refresh; DAT-006 Sortable Table; DAT-007 Editable Table; DAT-008 Detail Card; DAT-009 Stat Card; DAT-010 KPI Strip; DAT-011 Timeline Item; DAT-012 Activity Feed; DAT-013 Notification Row; DAT-014 File Row; DAT-015 People Row; DAT-016 Task Row; DAT-017 Calendar Event Row; DAT-018 Progress Row; DAT-019 Badge Stack; DAT-020 Avatar Stack; DAT-021 Tag Cloud; DAT-022 Data Empty State; DAT-023 Data Error State; DAT-024 Skeleton List; DAT-025 Diff Preview.

### CHT - Charts and Analytics

CHT-001 Line Chart; CHT-002 Multi Line Chart; CHT-003 Bar Chart; CHT-004 Stacked Bar Chart; CHT-005 Area Chart; CHT-006 Donut Chart; CHT-007 Pie Chart; CHT-008 Radar Chart; CHT-009 Ring Progress Chart; CHT-010 Sparkline; CHT-011 Heatmap Calendar; CHT-012 Histogram; CHT-013 Scatter Plot; CHT-014 Bubble Chart; CHT-015 Gauge Chart; CHT-016 Funnel Chart; CHT-017 Waterfall Chart; CHT-018 Timeline Chart; CHT-019 Candlestick Chart; CHT-020 Metric Card Chart; CHT-021 Compare Before After Chart; CHT-022 Goal Progress Chart; CHT-023 Category Breakdown; CHT-024 Chart Legend; CHT-025 Chart Empty/Error State.

### ANM - Animation and Motion

ANM-001 Shimmer; ANM-002 Skeleton Pulse; ANM-003 Typewriter Text; ANM-004 Count Up Number; ANM-005 Progress Ring Animation; ANM-006 Success Checkmark; ANM-007 Failure Shake; ANM-008 Pull Refresh Spinner; ANM-009 Loading Dots; ANM-010 Wave Text; ANM-011 Glow Sweep; ANM-012 Spotlight Reveal; ANM-013 Swipe Card Transition; ANM-014 Matched Geometry Card; ANM-015 Sheet Present Motion; ANM-016 Tab Switch Motion; ANM-017 Hero Image Parallax; ANM-018 Scroll Reveal; ANM-019 Floating Label Motion; ANM-020 Button Press Haptic; ANM-021 Icon Jiggle; ANM-022 Confetti Success; ANM-023 Toast Slide; ANM-024 Radar Sweep; ANM-025 Breathing Focus Animation.

### FDB - Feedback and Status States

FDB-001 Toast; FDB-002 Snackbar; FDB-003 Alert Banner; FDB-004 Inline Validation; FDB-005 Empty State; FDB-006 Error State; FDB-007 Loading State; FDB-008 Success State; FDB-009 Offline Banner; FDB-010 Retry Panel; FDB-011 Permission Denied State; FDB-012 Maintenance State; FDB-013 Rate Limit State; FDB-014 Sync Conflict Sheet; FDB-015 Undo Bar; FDB-016 Confirmation Dialog; FDB-017 Destructive Action Confirm; FDB-018 Progress HUD; FDB-019 Upload Progress; FDB-020 Download Progress; FDB-021 Background Task Status; FDB-022 Network Quality Indicator; FDB-023 Debug Diagnostics Panel; FDB-024 Feedback Form; FDB-025 Bug Report Sheet.

### MED - Media, Camera, and Capture

MED-001 Camera Capture; MED-002 Face Camera; MED-003 Barcode Scanner; MED-004 Document Scanner; MED-005 Photo Picker; MED-006 Video Picker; MED-007 Crop Editor; MED-008 Image Annotation; MED-009 Audio Recorder; MED-010 Voice Input; MED-011 Waveform Player; MED-012 Video Player; MED-013 Gallery Grid; MED-014 Lightbox Viewer; MED-015 Attachment Preview; MED-016 PDF Preview; MED-017 Share Sheet Attachment; MED-018 Live Text Capture; MED-019 Vision Landmark Overlay; MED-020 Object Detection Overlay; MED-021 QR Code Generator; MED-022 Avatar Editor; MED-023 Background Removal Stub; MED-024 Media Permission Primer; MED-025 Media Error State.

### MSG - Messaging and Communication

MSG-001 Chat Thread; MSG-002 Message Bubble; MSG-003 Composer Bar; MSG-004 Streaming Message; MSG-005 Typing Indicator; MSG-006 Voice Dictation Button; MSG-007 Attachment Composer; MSG-008 Reaction Bar; MSG-009 Thread Reply; MSG-010 Conversation List; MSG-011 Contact Picker; MSG-012 Notification Inbox; MSG-013 Announcement Banner; MSG-014 Email Composer; MSG-015 Support Chat; MSG-016 AI Chat Panel; MSG-017 Prompt Suggestion Chips; MSG-018 Message Search; MSG-019 Read Receipt Row; MSG-020 Presence Indicator; MSG-021 Mention Autocomplete; MSG-022 File Drop Zone; MSG-023 Chat Empty State; MSG-024 Chat Error State; MSG-025 Moderation Notice.

### PRD - Productivity and Scheduling

PRD-001 Task Board; PRD-002 Kanban Column; PRD-003 Checklist; PRD-004 Habit Tracker; PRD-005 Calendar Day View; PRD-006 Calendar Week View; PRD-007 Agenda List; PRD-008 Reminder Row; PRD-009 Timer; PRD-010 Pomodoro Focus; PRD-011 Notes Editor; PRD-012 Rich Text Toolbar; PRD-013 Markdown Preview; PRD-014 File Organizer; PRD-015 Goal Tracker; PRD-016 Project Overview; PRD-017 Activity Log; PRD-018 Approval Queue; PRD-019 Review Queue; PRD-020 Decision Log; PRD-021 Meeting Notes; PRD-022 Schedule Conflict Sheet; PRD-023 Timeline Planner; PRD-024 Import CSV Flow; PRD-025 Export Report Flow.

### HLT - Health and Fitness

HLT-001 Workout Log; HLT-002 Hydration Tracker; HLT-003 Meal Log; HLT-004 Medication Reminder; HLT-005 Sleep Summary; HLT-006 Heart Rate Card; HLT-007 Step Count Ring; HLT-008 Activity Rings; HLT-009 Health Permission Primer; HLT-010 HealthKit Sync Status; HLT-011 Weight Trend Chart; HLT-012 Symptom Journal; HLT-013 Mood Check In; HLT-014 Breathing Exercise; HLT-015 Meditation Timer; HLT-016 Recovery Score; HLT-017 Fitness Goal Card; HLT-018 Exercise Set Tracker; HLT-019 Nutrition Macro Chart; HLT-020 Cycle Tracker; HLT-021 Vitals Alert State; HLT-022 Health Data Export; HLT-023 Privacy First Health Empty State; HLT-024 Care Plan Checklist; HLT-025 Emergency Info Card.

### MAP - Maps and Location

MAP-001 Map View; MAP-002 Place Search; MAP-003 Location Permission Primer; MAP-004 Current Location Button; MAP-005 Route Preview; MAP-006 Turn By Turn Step Row; MAP-007 Geofence Setup; MAP-008 Location History Timeline; MAP-009 Nearby List; MAP-010 Place Detail Card; MAP-011 Map Annotation; MAP-012 Clustered Pins; MAP-013 Heatmap Overlay; MAP-014 Delivery Tracking; MAP-015 Ride Booking Sheet; MAP-016 Weather Location Card; MAP-017 Distance Filter; MAP-018 Region Selector; MAP-019 Offline Map State; MAP-020 Address Form; MAP-021 Apple Maps Handoff; MAP-022 Share Location; MAP-023 Check In Flow; MAP-024 Trip Planner; MAP-025 Location Error State.

### CMR - Commerce and Ordering

CMR-001 Product Card; CMR-002 Product Grid; CMR-003 Product Detail; CMR-004 Variant Picker; CMR-005 Cart Row; CMR-006 Cart Summary; CMR-007 Checkout Form; CMR-008 Address Book; CMR-009 Shipping Method Picker; CMR-010 Order Summary; CMR-011 Order Tracking Timeline; CMR-012 Coupon Entry; CMR-013 Inventory Status; CMR-014 Wishlist Button; CMR-015 Favorites Grid; CMR-016 Review Stars; CMR-017 Review Composer; CMR-018 Receipt View; CMR-019 Refund Request; CMR-020 Loyalty Points Card; CMR-021 Gift Card Entry; CMR-022 Order Empty State; CMR-023 Payment Error State; CMR-024 Subscription Product Card; CMR-025 Commerce Compliance Footer.

### SOC - Social and Collaboration

SOC-001 Share Sheet Button; SOC-002 Invite Friends; SOC-003 Referral Card; SOC-004 Contact Import; SOC-005 Profile Header; SOC-006 Follow Button; SOC-007 Follower List; SOC-008 Activity Reaction; SOC-009 Comment Thread; SOC-010 User Mention; SOC-011 Share Preview Card; SOC-012 Deep Link Preview; SOC-013 Social Empty State; SOC-014 Report Content Sheet; SOC-015 Block User Flow; SOC-016 Community Guidelines Notice; SOC-017 Team Member Row; SOC-018 Organization Profile; SOC-019 Collaboration Cursor; SOC-020 Presence Avatars; SOC-021 Public Profile Card; SOC-022 Creator Attribution; SOC-023 Badge Achievement Card; SOC-024 Feed Composer; SOC-025 Social Notification Row.

### SET - Settings and Account

SET-001 Settings List; SET-002 Account Settings; SET-003 Privacy Settings; SET-004 Notification Settings; SET-005 Appearance Settings; SET-006 Language Picker; SET-007 Region Picker; SET-008 Data Export Settings; SET-009 Delete Data Settings; SET-010 Connected Accounts; SET-011 Device List; SET-012 Storage Usage; SET-013 Cache Clear Row; SET-014 About App Screen; SET-015 Legal Links; SET-016 Terms Viewer; SET-017 Privacy Viewer; SET-018 Changelog Screen; SET-019 Diagnostics Export; SET-020 Contact Support; SET-021 Feedback Settings; SET-022 Feature Flags Panel; SET-023 Developer Mode Toggle; SET-024 Theme Token Editor; SET-025 Settings Search.

### AGT - Agent, Xcode, and Repair UX

AGT-001 Agent Status Card; AGT-002 Agent Run Console; AGT-003 Fix Packet Viewer; AGT-004 Repair Prompt Panel; AGT-005 Xcode Checklist; AGT-006 Evidence Required Banner; AGT-007 Ready To Ship Badge; AGT-008 Tool Call Timeline; AGT-009 MCP Connection Status; AGT-010 Context Memory Panel; AGT-011 Project Index Card; AGT-012 File Claim Row; AGT-013 Multi Agent Ledger; AGT-014 Approval Request Card; AGT-015 Human Handoff Sheet; AGT-016 Agent Suggestion List; AGT-017 Prompt Pack Picker; AGT-018 Token Budget Meter; AGT-019 Drift Guard Alert; AGT-020 Workflow Check Panel; AGT-021 Build Proof Card; AGT-022 Test Result Card; AGT-023 Release Gate Panel; AGT-024 Agent Onboarding Prompt; AGT-025 Agent Error Explainer.

### APL - Apple System Surfaces

APL-001 App Intent Template; APL-002 Entity Query Template; APL-003 App Enum Template; APL-004 App Shortcut Tile; APL-005 Siri Phrase Editor; APL-006 Shortcuts Gallery Row; APL-007 Widget Small; APL-008 Widget Medium; APL-009 Widget Large; APL-010 Widget Configuration; APL-011 Live Activity Lock Screen; APL-012 Dynamic Island Compact; APL-013 Dynamic Island Expanded; APL-014 Control Widget; APL-015 App Clip Entry; APL-016 Share Extension; APL-017 Action Extension; APL-018 Notification Content Extension; APL-019 Watch Complication; APL-020 Watch App Summary; APL-021 macOS Menu Bar Extra; APL-022 visionOS Ornament Panel; APL-023 Spotlight Search Item; APL-024 Universal Link Router; APL-025 Handoff Continuity Card.

## First Batch Candidates

Start with these because they define the product story better than a generic component dump:

- ASR-003 Privacy Manifest Generator
- ASR-004 Entitlements Audit Panel
- ASR-005 Info.plist Usage String Builder
- ASR-006 TestFlight Readiness Checklist
- ASR-025 Release Evidence Packet
- PAY-001 Subscription Paywall
- PAY-006 Restore Purchases Row
- PAY-024 Subscription Compliance Footer
- AUT-001 Sign in with Apple Button
- AUT-023 Delete Account Flow
- ONB-003 Permission Primer
- ONB-022 Widget Install Prompt
- ONB-023 Shortcut Install Prompt
- AGT-003 Fix Packet Viewer
- AGT-021 Build Proof Card
- APL-001 App Intent Template
- APL-007 Widget Small
- APL-011 Live Activity Lock Screen
- SET-003 Privacy Settings
- FDB-011 Permission Denied State

## Daily Completion Prompt

Use this with Codex, Claude, or Cursor at the start of each day:

```text
Read docs/SHIP_KITS_SPRINT.md. Select the next 10 to 20 uncompleted Axint Ship Kits from the First Batch Candidates or Backlog Index. For each selected kit, implement the SwiftUI source, 5 variants, required Apple contracts, focused tests/previews, registry metadata, one agent usage prompt, and Fix Packet examples for the top 2 failure modes. Keep the kits production-oriented and validate with Axint before marking them released.
```
