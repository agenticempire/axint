import type { IRViewProp, IRViewState } from "../core/types.js";

export type BlueprintPlatform = "iOS" | "macOS" | "visionOS" | "all";

export interface ViewBlueprintInput {
  name: string;
  description?: string;
  props?: IRViewProp[];
  state?: IRViewState[];
  platform?: BlueprintPlatform;
  tokenNamespace?: string;
  componentKind?: string;
}

export function usesProfileCardBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b(profile|dating|swipe|match|card)\b/.test(lower) &&
    /\b(name|age|bio|photo|profile|workout)\b/.test(lower)
  );
}

export function usesThreePaneBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b(three|3)[-\s]?pane\b/.test(lower) ||
    (lower.includes("sidebar rail") &&
      (lower.includes("channels column") || lower.includes("channel column")))
  );
}

export function usesSettingsBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b(settings|preferences|app settings|appearance|accent color|reduce motion|keyboard shortcut|transcription engine)\b/.test(
      lower
    ) &&
    /\b(toggle|picker|swatch|mode|preference|setting|appearance|keyboard|transcription|motion)\b/.test(
      lower
    )
  );
}

export function buildSmartViewBody(input: ViewBlueprintInput): string | null {
  const description = input.description ?? "";
  const explicitKind = normalizeKind(input.componentKind);
  if (explicitKind) return buildComponentBody(explicitKind, input);
  if (usesThreePaneBlueprint(description)) return buildThreePaneBody(input);
  if (usesSettingsBlueprint(description)) return buildSettingsBody(input);
  if (usesProfileCardBlueprint(description)) return buildProfileCardBody(input.platform);

  const inferredKind = normalizeKind(inferComponentKind(input.name, description));
  if (inferredKind) return buildComponentBody(inferredKind, input);
  return null;
}

export function reservedViewPropertyName(name: string): string {
  if (name === "body") return "messageBody";
  if (name === "self") return "value";
  if (name === "Type") return "kind";
  return name;
}

function inferComponentKind(name: string, description: string): string | undefined {
  const haystack = `${name} ${description}`.toLowerCase();
  if (haystack.includes("avatar")) return "avatar";
  if (haystack.includes("status ring") || haystack.includes("statusring"))
    return "statusRing";
  if (haystack.includes("mission card") || haystack.includes("missioncard"))
    return "missionCard";
  if (haystack.includes("context panel") || haystack.includes("projectcontext"))
    return "contextPanel";
  if (haystack.includes("context update") || haystack.includes("stale context"))
    return "contextUpdateCard";
  if (haystack.includes("decision log") || haystack.includes("decisionlog"))
    return "decisionLog";
  if (haystack.includes("approval card") || haystack.includes("approvalcard"))
    return "approvalCard";
  if (haystack.includes("agent row") || haystack.includes("agentrow")) return "agentRow";
  if (haystack.includes("role card") || haystack.includes("rolecard")) return "roleCard";
  if (haystack.includes("signal card") || haystack.includes("signalcard"))
    return "signalCard";
  if (haystack.includes("channel row") || haystack.includes("channelrow"))
    return "channelRow";
  if (haystack.includes("sidebar rail") || haystack.includes("sidebarrail"))
    return "sidebarRail";
  if (haystack.includes("settings") || haystack.includes("preferences"))
    return "settingsView";
  if (haystack.includes("profile card") || haystack.includes("profilecard"))
    return "profileCard";
  return undefined;
}

function normalizeKind(kind: string | undefined): string | undefined {
  if (!kind) return undefined;
  const lower = kind.replace(/[\s_-]+/g, "").toLowerCase();
  if (lower === "avatar") return "avatar";
  if (lower === "statusring") return "statusRing";
  if (lower === "missioncard") return "missionCard";
  if (lower === "contextpanel" || lower === "projectcontextpanel") return "contextPanel";
  if (lower === "contextupdatecard" || lower === "contextupdate")
    return "contextUpdateCard";
  if (lower === "decisionlog" || lower === "decisionlogcard") return "decisionLog";
  if (lower === "approvalcard" || lower === "approval") return "approvalCard";
  if (lower === "agentrow") return "agentRow";
  if (lower === "rolecard") return "roleCard";
  if (lower === "signalcard") return "signalCard";
  if (lower === "channelrow") return "channelRow";
  if (lower === "sidebarrail") return "sidebarRail";
  if (lower === "settingsview" || lower === "settings" || lower === "preferences")
    return "settingsView";
  if (lower === "profilecard") return "profileCard";
  if (lower === "custom") return undefined;
  return undefined;
}

function buildComponentBody(kind: string, input: ViewBlueprintInput): string {
  switch (kind) {
    case "avatar":
      return `ZStack(alignment: .bottomTrailing) {
            Circle()
                .fill(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.16)")})
                .overlay {
                    Text(initials)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                }

            Circle()
                .fill(status == "online" ? .green : .secondary)
                .frame(width: 10, height: 10)
                .overlay {
                    Circle().stroke(.background, lineWidth: 2)
                }
        }
        .frame(width: 36, height: 36)`;

    case "statusRing":
      return `VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.16)")}, lineWidth: 8)
                Circle()
                    .trim(from: 0, to: min(max(value, 0), 1))
                    .stroke(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")}, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\\(Int(value * 100))%")
                    .font(.caption.weight(.bold))
            }
            .frame(width: 56, height: 56)

            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }`;

    case "missionCard":
      return `VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: Capsule())
            }

            ProgressView(value: progress)
                .tint(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
        }
        .padding(16)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous))`;

    case "contextPanel":
      return `VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Project Context")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                    .textCase(.uppercase)
                Spacer()
                Text(${textExpr(input, "syncStatus", "synced 12m ago")})
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("North Star")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)
                Text(${textExpr(input, "northStar", "Keep the project room aligned while humans and agents move fast.")})
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 10) {
                ${contextFileRow("NORTH_STAR.md", "synced")}
                ${contextFileRow("PROJECT_CONTEXT.md", "synced")}
                ${contextFileRow("DECISIONS.md", "updated")}
                ${contextFileRow("ROADMAP.md", "2 pending")}
            }

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(${colorRef(input.tokenNamespace, "warning", ".orange")})
                VStack(alignment: .leading, spacing: 4) {
                    Text("\\(${numericExpr(input, "suggestedUpdates", "2")}) suggested updates")
                        .font(.caption.weight(.semibold))
                    Text("Review context changes from #general before the next run.")
                        .font(.caption2)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
                Spacer()
            }
            .padding(12)
            .background(${colorRef(input.tokenNamespace, "warningSoft", "Color.orange.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))

            Spacer()
        }
        .padding(16)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")})`;

    case "contextUpdateCard":
      return `VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(${colorRef(input.tokenNamespace, "warning", ".orange")})
                VStack(alignment: .leading, spacing: 5) {
                    Text("Context may be stale")
                        .font(.subheadline.weight(.semibold))
                    Text(${textExpr(input, "summary", "This thread changed the onboarding strategy.")})
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("Update PROJECT_CONTEXT.md", systemImage: "doc.text")
                Label("Add decision to DECISIONS.md", systemImage: "checkmark.seal")
                Label("Revise current sprint in ROADMAP.md", systemImage: "map")
            }
            .font(.caption)
            .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            HStack {
                Button("Apply updates") {}
                    .buttonStyle(.borderedProminent)
                Button("Review diff") {}
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "warningSoft", "Color.orange.opacity(0.24)")}, lineWidth: 1)
        }`;

    case "decisionLog":
      return `VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(${textExpr(input, "title", "Choose context-first positioning")})
                    .font(.headline)
                Spacer()
                Text(${textExpr(input, "owner", "Nima")})
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Decision")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                Text(${textExpr(input, "decision", "Make Context the default tab and primary product invariant.")})
                    .font(.callout)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
            }

            Text(${textExpr(input, "impact", "Missions, agents, and onboarding now reference the North Star.")})
                .font(.caption)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))`;

    case "approvalCard":
      return `VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(${textExpr(input, "missionTitle", "Build native Mac shell")})
                    .font(.headline)
                Spacer()
                Text(${textExpr(input, "costEstimate", "$0.42-$0.86")})
                    .font(.caption.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
            }

            Label(${textExpr(input, "risk", "Touches layout and local files. Human approval required.")}, systemImage: "shield.lefthalf.filled")
                .font(.caption)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            HStack {
                Button("Approve") {}
                    .buttonStyle(.borderedProminent)
                Button("Run cheap") {}
                    .buttonStyle(.bordered)
                Button("Not yet") {}
                    .buttonStyle(.plain)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))`;

    case "agentRow":
      return `HStack(spacing: 10) {
            Circle()
                .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                .overlay {
                    Text(String(${textExpr(input, "name", "Product Agent")}.prefix(1)))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                }
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(${textExpr(input, "name", "Product Agent")})
                    .font(.subheadline.weight(.semibold))
                Text(${textExpr(input, "role", "Keeps context sharp")})
                    .font(.caption)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
            }

            Spacer()

            Text(${textExpr(input, "status", "awake")})
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(${colorRef(input.tokenNamespace, "successSoft", "Color.green.opacity(0.14)")}, in: Capsule())
                .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous))`;

    case "roleCard":
      return `VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(${textExpr(input, "title", "Context Guardian")})
                    .font(.headline)
                Spacer()
                Text(${textExpr(input, "status", "suggested")})
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
            }
            Text(${textExpr(input, "description", "Detects stale context, summarizes decisions, and keeps Markdown current.")})
                .font(.caption)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))`;

    case "signalCard":
      return `VStack(alignment: .leading, spacing: 12) {
            Text(${textExpr(input, "sourceTitle", "Apple expands App Intents at WWDC")})
                .font(.headline)
            Text(${textExpr(input, "insight", "Potential roadmap impact. Create a research mission before the next SDK beta.")})
                .font(.caption)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            HStack(spacing: 8) {
                Button("Discuss") {}
                Button("Ask Agent") {}
                Button("Create Mission") {}
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "12")}, style: .continuous))`;

    case "channelRow":
      return `HStack(spacing: 10) {
            Circle()
                .fill(isSelected ? ${colorRef(input.tokenNamespace, "accent", "Color.accentColor")} : ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.18)")})
                .frame(width: 8, height: 8)

            Text(title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .lineLimit(1)

            Spacer()

            if unreadCount > 0 {
                Text("\\(unreadCount)")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")}, in: Capsule())
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(isSelected ? ${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.10)")} : .clear, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous))`;

    case "sidebarRail":
      return `VStack(spacing: 12) {
            ForEach(0..<5, id: \\.self) { index in
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(index == selectedIndex ? ${colorRef(input.tokenNamespace, "accent", "Color.accentColor")} : ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.16)")})
                    .frame(width: 36, height: 36)
            }
            Spacer()
        }
        .padding(.vertical, 12)
        .frame(width: ${layoutRef(input.tokenNamespace, "sidebarRail", "56")})`;

    case "settingsView":
      return buildSettingsBody(input);

    case "profileCard":
      return buildProfileCardBody(input.platform);

    default:
      return `VStack { Text("${input.name}") }`;
  }
}

function buildSettingsBody(input: ViewBlueprintInput): string {
  return `VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Settings")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                Text("Tune the workspace without leaving the current project room.")
                    .font(.caption)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
            }

            VStack(alignment: .leading, spacing: 14) {
                Text("Appearance")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)

                Picker("Appearance", selection: $appearanceMode) {
                    Text("System").tag("System")
                    Text("Light").tag("Light")
                    Text("Dark").tag("Dark")
                }
                .pickerStyle(.segmented)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Accent Color")
                        .font(.subheadline.weight(.semibold))
                    HStack(spacing: 10) {
                        ForEach(["Blue", "Purple", "Orange", "Green", "Pink", "Teal"], id: \\.self) { color in
                            Button {
                                accentColor = color
                            } label: {
                                Circle()
                                    .fill(color == "Blue" ? Color.blue : color == "Purple" ? Color.purple : color == "Orange" ? Color.orange : color == "Green" ? Color.green : color == "Pink" ? Color.pink : Color.teal)
                                    .frame(width: 22, height: 22)
                                    .overlay {
                                        if accentColor == color {
                                            Image(systemName: "checkmark")
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(.white)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\\(color) accent")
                        }
                    }
                }
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            VStack(alignment: .leading, spacing: 14) {
                Text("Input")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)

                Picker("Transcription Engine", selection: $transcriptionEngine) {
                    Text("Apple Speech").tag("Apple Speech")
                    Text("WhisperKit").tag("WhisperKit")
                }

                Toggle("Reduce motion", isOn: $reduceMotion)
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            VStack(alignment: .leading, spacing: 10) {
                Text("Keyboard Shortcuts")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)
                ${shortcutRow("Command-K", "Open command bar")}
                ${shortcutRow("Command-/", "Show shortcuts")}
                ${shortcutRow("H R", "Hand off current run")}
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: 560, maxHeight: .infinity, alignment: .topLeading)`;
}

function buildThreePaneBody(input: ViewBlueprintInput): string {
  const rail = extractDimension(
    input.description ?? "",
    /(sidebar rail|rail)[^\d]*(\d+)/i,
    "56"
  );
  const channels = extractDimension(
    input.description ?? "",
    /(channels? column|channel list|channels?)[^\d]*(\d+)/i,
    "244"
  );
  const rightPane = extractDimension(
    input.description ?? "",
    /(right(?: context)? pane|context pane|right column|right rail)[^\d]*(\d+)/i,
    "308"
  );
  const includeRightPane = wantsRightContextPane(input.description ?? "");

  return `HStack(spacing: 0) {
            VStack(spacing: 12) {
                ForEach(0..<5, id: \\.self) { index in
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(index == 0 ? ${colorRef(input.tokenNamespace, "accent", "Color.accentColor")} : ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.16)")})
                        .frame(width: 36, height: 36)
                }
                Spacer()
            }
            .padding(.vertical, 12)
            .frame(width: ${layoutRef(input.tokenNamespace, "sidebarRail", rail)})
            .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")})

            VStack(alignment: .leading, spacing: 8) {
                Text("Channels")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(["general", "agents", "builds", "launch"], id: \\.self) { channel in
                    HStack {
                        Text("#")
                            .foregroundStyle(.secondary)
                        Text(channel)
                        Spacer()
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(channel == "agents" ? ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")} : .clear, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous))
                }
                Spacer()
            }
            .padding(12)
            .frame(width: ${layoutRef(input.tokenNamespace, "channelsColumn", channels)})
            .background(${colorRef(input.tokenNamespace, "panel", "Color.secondary.opacity(0.05)")})

            VStack(alignment: .leading, spacing: 16) {
                Text("Mission Control")
                    .font(.title2.weight(.bold))
                Text("Agent activity, handoffs, and execution context stay in the flexible content area.")
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
${
  includeRightPane
    ? `\n            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Context")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                    Spacer()
                    Text("Synced")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("North Star")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    Text("The project room where context never gets lost.")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                        .fixedSize(horizontal: false, vertical: true)
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Context Files")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    ${contextFileRow("NORTH_STAR.md", "synced")}
                    ${contextFileRow("PROJECT_CONTEXT.md", "synced")}
                    ${contextFileRow("DECISIONS.md", "updated")}
                    ${contextFileRow("ROADMAP.md", "2 pending")}
                }

                Spacer()
            }
            .padding(14)
            .frame(width: ${layoutRef(input.tokenNamespace, "rightContextPane", rightPane)}, maxHeight: .infinity, alignment: .topLeading)
            .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")})
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.18)")})
                    .frame(width: 1)
            }`
    : ""
}
        }
        .background(${colorRef(input.tokenNamespace, "bg", "Color.clear")})`;
}

function buildProfileCardBody(platform: BlueprintPlatform | undefined): string {
  const card = `VStack(spacing: 20) {
            ZStack(alignment: .bottomLeading) {
                AsyncImage(url: photoURL) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    LinearGradient(
                        colors: [.purple.opacity(0.35), .orange.opacity(0.28)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .overlay {
                        Image(systemName: "person.crop.square")
                            .font(.system(size: 48, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.72))
                    }
                }
                .frame(width: 320, height: 440)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .strokeBorder(.white.opacity(0.16), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.18), radius: 24, x: 0, y: 16)

                VStack(alignment: .leading, spacing: 10) {
                    Text("\\(name), \\(age)")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                    Text(bio)
                        .font(.body)
                        .lineLimit(3)
                    Text(workoutPreferences)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .foregroundStyle(.white)
                .padding(24)
            }
            .offset(x: swipeOffset)
            .rotationEffect(.degrees(swipeOffset / 18))
            .gesture(
                DragGesture()
                    .onChanged { value in
                        swipeOffset = value.translation.width
                    }
                    .onEnded { value in
                        if value.translation.width > 80 {
                            lastAction = "Liked \\(name)"
                        } else if value.translation.width < -80 {
                            lastAction = "Passed on \\(name)"
                        }
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                            swipeOffset = 0
                        }
                    }
            )

            HStack(spacing: 16) {
                Button {
                    lastAction = "Passed on \\(name)"
                } label: {
                    Label("Pass", systemImage: "xmark")
                }
                .buttonStyle(.bordered)
                .tint(.red)

                Button {
                    lastAction = "Liked \\(name)"
                } label: {
                    Label("Like", systemImage: "heart.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }

            Text(lastAction)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()`;

  if (platform === "macOS") return card;
  return `NavigationStack {
            ${card}
                .navigationTitle("Profile")
        }`;
}

function colorRef(namespace: string | undefined, name: string, fallback: string): string {
  return namespace ? `${namespace}.Colors.${name}` : fallback;
}

function radiusRef(
  namespace: string | undefined,
  name: string,
  fallback: string
): string {
  return namespace ? `${namespace}.Radii.${name}` : fallback;
}

function layoutRef(
  namespace: string | undefined,
  name: string,
  fallback: string
): string {
  return namespace ? `${namespace}.Layout.${name}` : fallback;
}

function contextFileRow(name: string, status: string): string {
  return `HStack(spacing: 8) {
                    Image(systemName: "doc.text")
                        .foregroundStyle(.secondary)
                    Text("${name}")
                        .font(.caption)
                    Spacer()
                    Text("${status}")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }`;
}

function shortcutRow(keys: string, action: string): string {
  return `HStack {
                    Text("${keys}")
                        .font(.system(.caption, design: .monospaced).weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    Text("${action}")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }`;
}

function wantsRightContextPane(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    lower.includes("right pane") ||
    lower.includes("context pane") ||
    lower.includes("right context") ||
    lower.includes("project context") ||
    lower.includes("300") ||
    lower.includes("308")
  );
}

function textExpr(input: ViewBlueprintInput, name: string, fallback: string): string {
  return hasValue(input, name) ? name : `"${escapeSwiftString(fallback)}"`;
}

function numericExpr(input: ViewBlueprintInput, name: string, fallback: string): string {
  return hasValue(input, name) ? name : fallback;
}

function hasValue(input: ViewBlueprintInput, name: string): boolean {
  return Boolean(
    input.props?.some((prop) => prop.name === name) ||
    input.state?.some((state) => state.name === name)
  );
}

function escapeSwiftString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractDimension(
  description: string,
  pattern: RegExp,
  fallback: string
): string {
  const match = description.match(pattern);
  return match?.[2] ?? fallback;
}
