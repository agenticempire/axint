import type { IRViewProp, IRViewState } from "../core/types.js";
import { semanticLabels, usesSemanticLayout } from "./semantic-planner.js";

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
    /\b(dating|swipe|match|swolemate)\b/.test(lower) ||
    (/\bprofile\s+card\b/.test(lower) &&
      /\b(name|age|bio|photo|workout|preferences?)\b/.test(lower))
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
    /\b(settings|preferences|app settings|appearance|accent color|reduce motion|keyboard shortcut|transcription engine|visibility|invite policy|invite limit|public modules?|member permissions?|agent permissions?|privacy posture|integration readiness|operating model)\b/.test(
      lower
    ) &&
    /\b(toggle|picker|swatch|mode|preference|setting|appearance|keyboard|transcription|motion|visibility|invite|permission|privacy|integration|module|public)\b/.test(
      lower
    )
  );
}

export function usesInboxBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b(inbox|saved item|saved items|capture|composer|universal capture|classification|classifications)\b/.test(
      lower
    ) &&
    /\b(search|filter|unread|pinned|archived|tag|tags|source badge|classification chip|summarize|save to project|turn into post|action buttons?)\b/.test(
      lower
    )
  );
}

export function usesTrustPostureBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, "");
  return (
    (/\b(trust posture|command trust|security posture)\b/.test(lower) ||
      compact.includes("trustposture") ||
      compact.includes("commandtrust")) &&
    /\b(trust|posture|visibility|invite|permissions?|privacy|public|agent|member|settings|reduced motion)\b/.test(
      lower
    )
  );
}

export function usesEmptyStateBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b(empty[-\s]?state|sparse state|blank state|zero state|no results|nothing here|purpose-aware sparse|sparse)\b/.test(
      lower
    ) &&
    /\b(purpose|state|surface|screen|view|command|project|action|cta|pattern)\b/.test(
      lower
    )
  );
}

export function buildSmartViewBody(input: ViewBlueprintInput): string | null {
  const description = input.description ?? "";
  const semanticHaystack = `${input.name} ${description}`;
  const explicitKind = normalizeKind(input.componentKind);
  if (explicitKind === "settingsView") return buildComponentBody(explicitKind, input);
  if (usesTrustPostureBlueprint(semanticHaystack)) return buildTrustPostureBody(input);
  if (usesEmptyStateBlueprint(semanticHaystack))
    return buildPurposeAwareSparseStateBody(input);
  if (explicitKind) return buildComponentBody(explicitKind, input);
  if (usesThreePaneBlueprint(description)) return buildThreePaneBody(input);
  if (usesSettingsBlueprint(description)) return buildSettingsBody(input);
  if (usesInboxBlueprint(description)) return buildInboxBody(input);
  if (usesProfileCardBlueprint(description)) return buildProfileCardBody(input.platform);
  if (usesSemanticLayout(description)) return buildSemanticSurfaceBody(input);

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
  if (
    /\b(feed post|feedpost|post card|postcard|author avatar|reaction|comment|action row)\b/.test(
      haystack
    )
  )
    return "feedCard";
  if (
    /\b(project media|media card|mediacard|cover image|cover asset|gallery|nsimage|asset preview)\b/.test(
      haystack
    )
  )
    return "mediaCard";
  if (
    /\b(compact utility|utility row|utilityrow|quick action|status row|trailing action)\b/.test(
      haystack
    )
  )
    return "utilityRow";
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
  if (usesTrustPostureBlueprint(haystack)) return "trustPosture";
  if (usesEmptyStateBlueprint(haystack)) return "purposeAwareSparseState";
  if (haystack.includes("signal card") || haystack.includes("signalcard"))
    return "signalCard";
  if (haystack.includes("channel row") || haystack.includes("channelrow"))
    return "channelRow";
  if (haystack.includes("sidebar rail") || haystack.includes("sidebarrail"))
    return "sidebarRail";
  if (
    haystack.includes("settings") ||
    haystack.includes("preferences") ||
    /\b(visibility|invite policy|invite limit|permissions|privacy posture|integration readiness|operating model)\b/.test(
      haystack
    )
  )
    return "settingsView";
  if (haystack.includes("profile card") || haystack.includes("profilecard"))
    return "profileCard";
  return undefined;
}

function normalizeKind(kind: string | undefined): string | undefined {
  if (!kind) return undefined;
  const lower = kind.replace(/[\s_-]+/g, "").toLowerCase();
  if (lower === "feedcard" || lower === "feedpostcard" || lower === "postcard")
    return "feedCard";
  if (lower === "mediacard" || lower === "projectmediacard" || lower === "covercard")
    return "mediaCard";
  if (lower === "utilityrow" || lower === "compactutilityrow" || lower === "utilitycard")
    return "utilityRow";
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
  if (lower === "trustposture" || lower === "commandtrustposture") return "trustPosture";
  if (
    lower === "purposeawaresparsestate" ||
    lower === "sparsestate" ||
    lower === "emptystate" ||
    lower === "zerostate"
  )
    return "purposeAwareSparseState";
  if (lower === "signalcard") return "signalCard";
  if (lower === "channelrow") return "channelRow";
  if (lower === "sidebarrail") return "sidebarRail";
  if (lower === "settingsview" || lower === "settings" || lower === "preferences")
    return "settingsView";
  if (lower === "profilecard") return "profileCard";
  if (lower === "semanticcard" || lower === "generativecard") return "semanticCard";
  if (lower === "semanticrow" || lower === "generativerow") return "semanticRow";
  if (lower === "semanticpill" || lower === "semanticbadge") return "semanticPill";
  if (lower === "semanticpanel" || lower === "generativepanel") return "semanticPanel";
  if (lower === "semanticbar" || lower === "semantictoolbar") return "semanticBar";
  if (lower === "semanticlist" || lower === "semanticgrid") return "semanticList";
  if (lower === "custom") return undefined;
  return undefined;
}

function buildComponentBody(kind: string, input: ViewBlueprintInput): string {
  switch (kind) {
    case "feedCard":
      return `VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                    .overlay {
                        Text(authorInitials)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                    }
                    .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(authorName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                        Text("2m ago")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    }
                    Text(headline)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                }

                Spacer()

                if isPinned {
                    Label("Pinned", systemImage: "pin.fill")
                        .font(.caption2.weight(.bold))
                        .labelStyle(.titleAndIcon)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: Capsule())
                        .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                }
            }

            Text(bodyText)
                .font(.callout)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                ForEach(["Context", "Design", "Build"], id: \\.self) { tag in
                    Text(tag)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: Capsule())
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
                Spacer()
            }

            Divider()

            HStack(spacing: 12) {
                Button { } label: {
                    Label("\\(reactionCount)", systemImage: "sparkles")
                }
                Button { } label: {
                    Label("\\(commentCount)", systemImage: "bubble.left")
                }
                Spacer()
                Button { } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
            .buttonStyle(.plain)
            .font(.caption.weight(.semibold))
            .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;

    case "mediaCard":
      return `VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .bottomLeading) {
                #if os(macOS)
                if let nsImage = NSImage(named: coverImageName) {
                    Image(nsImage: nsImage)
                        .resizable()
                        .scaledToFill()
                } else {
                    RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous)
                        .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                        .overlay {
                            Image(systemName: coverSymbol)
                                .font(.system(size: 34, weight: .semibold))
                                .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                        }
                }
                #else
                Image(coverImageName)
                    .resizable()
                    .scaledToFill()
                #endif

                LinearGradient(
                    colors: [.clear, .black.opacity(0.64)],
                    startPoint: .center,
                    endPoint: .bottom
                )

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text(subtitle)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.white.opacity(0.78))
                    }
                    Spacer()
                    Text(status)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.white.opacity(0.16), in: Capsule())
                        .foregroundStyle(.white)
                }
                .padding(12)
            }
            .frame(height: 178)
            .clipShape(RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            HStack(spacing: 10) {
                Label(mediaLabel, systemImage: coverSymbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                Spacer()
                Button { } label: {
                    Label(actionTitle, systemImage: "arrow.up.right")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(12)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;

    case "utilityRow":
      return `HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous)
                .fill(isActive ? ${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")} : ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")})
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: iconName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(isActive ? ${colorRef(input.tokenNamespace, "accent", "Color.accentColor")} : ${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                    .lineLimit(1)
            }

            Spacer()

            Text(status)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(isActive ? ${colorRef(input.tokenNamespace, "successSoft", "Color.green.opacity(0.14)")} : ${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.12)")}, in: Capsule())
                .foregroundStyle(isActive ? ${colorRef(input.tokenNamespace, "success", ".green")} : ${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            Button { } label: {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.plain)
            .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.14)")}, lineWidth: 1)
        }`;

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

    case "trustPosture":
      return buildTrustPostureBody(input);

    case "purposeAwareSparseState":
      return buildPurposeAwareSparseStateBody(input);

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

    case "semanticCard":
      return buildSemanticCardBody(input);

    case "semanticRow":
      return buildSemanticRowBody(input);

    case "semanticPill":
      return buildSemanticPillBody(input);

    case "semanticPanel":
      return buildSemanticPanelBody(input);

    case "semanticBar":
      return buildSemanticBarBody(input);

    case "semanticList":
      return buildSemanticListBody(input);

    default:
      return `VStack { Text("${input.name}") }`;
  }
}

function buildSemanticSurfaceBody(input: ViewBlueprintInput): string {
  const description = input.description ?? "";
  const lower = description.toLowerCase();
  if (/\b(search|filter|toolbar|command bar|capture bar)\b/.test(lower))
    return buildSemanticBarBody(input);
  if (/\b(grid|gallery|tiles?)\b/.test(lower)) return buildSemanticGridBody(input);
  if (/\b(list|queue|table|timeline|inbox|feed)\b/.test(lower))
    return buildSemanticListBody(input);
  if (/\b(panel|inspector|detail|sheet)\b/.test(lower))
    return buildSemanticPanelBody(input);
  return buildSemanticDashboardBody(input);
}

function buildTrustPostureBody(input: ViewBlueprintInput): string {
  return `VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Trust posture")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("Visibility, permissions, privacy, and agent behavior stay visible before a command runs.")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

                Spacer()

                Label("Governed", systemImage: "checkmark.shield.fill")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(${colorRef(input.tokenNamespace, "successSoft", "Color.green.opacity(0.14)")}, in: Capsule())
                    .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 10)], spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Visibility", systemImage: "eye")
                        .font(.caption.weight(.semibold))
                    Text(visibility)
                        .font(.headline.weight(.semibold))
                }
                .padding(10)
                .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Label("Invite policy", systemImage: "person.badge.plus")
                        .font(.caption.weight(.semibold))
                    Text(invitePolicy)
                        .font(.headline.weight(.semibold))
                }
                .padding(10)
                .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Label("Privacy posture", systemImage: "lock.shield")
                        .font(.caption.weight(.semibold))
                    Text(privacyPosture)
                        .font(.headline.weight(.semibold))
                }
                .padding(10)
                .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Label("Reduced motion", systemImage: "figure.walk.motion")
                        .font(.caption.weight(.semibold))
                    Text(reduceMotion ? "On" : "Off")
                        .font(.headline.weight(.semibold))
                }
                .padding(10)
                .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))
            }

            VStack(spacing: 8) {
                Label(publicModulesEnabled ? "Public modules enabled" : "Public modules private", systemImage: "square.grid.2x2")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Label(membersCanInvite ? "Members can invite" : "Member invites need owner approval", systemImage: "person.2")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Label(agentsCanPublish ? "Agents can publish drafts" : "Agent output requires review", systemImage: "cpu")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            HStack(spacing: 8) {
                Button("Project Settings") { }
                    .buttonStyle(.borderedProminent)
                Button("Review policy") { }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(16)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;
}

function buildPurposeAwareSparseStateBody(input: ViewBlueprintInput): string {
  const labels = swiftStringArray(semanticLabels(input.description ?? input.name, 4));
  return `VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Purpose-aware sparse state")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("Empty command surfaces still explain purpose, next action, and why the space is quiet.")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

                Spacer()

                Label("Sparse", systemImage: "circle.dotted")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")}, in: Capsule())
                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(${labels}, id: \\.self) { purpose in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkle.magnifyingglass")
                            .frame(width: 28, height: 28)
                            .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "9")}, style: .continuous))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})

                        VStack(alignment: .leading, spacing: 3) {
                            Text(purpose)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                            Text("No content yet. Start with a command, connect project context, or keep the state intentionally quiet.")
                                .font(.caption)
                                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                        }
                    }
                    .padding(10)
                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))
                }
            }

            HStack(spacing: 8) {
                Button("Create command") { }
                    .buttonStyle(.borderedProminent)
                Button("Attach context") { }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(16)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;
}

function buildSemanticDashboardBody(input: ViewBlueprintInput): string {
  const labels = swiftStringArray(semanticLabels(input.description ?? input.name, 4));
  const subtitle = semanticLabels(input.description ?? input.name, 3).join(", ");
  return `VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("${escapeSwiftString(humanizeLocal(input.name))}")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("${escapeSwiftString(subtitle || "Focused surface with clear status and next action.")}")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
                Spacer()
                Button { } label: {
                    Label("New", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 12)], spacing: 12) {
                ForEach(${labels}, id: \\.self) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "sparkles")
                                .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                            Spacer()
                            Text("Live")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
                        }
                        Text(item)
                            .font(.headline.weight(.semibold))
                        Text("Status, owner, next action, and context are visible at a glance.")
                            .font(.caption)
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                    }
                    .padding(14)
                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
                }
            }

            ${buildSemanticListRows(input)}

            Spacer()
        }
        .padding(20)
        .background(${colorRef(input.tokenNamespace, "bg", "Color.clear")})`;
}

function buildSemanticCardBody(input: ViewBlueprintInput): string {
  const description = promptOnlyDescription(input.description ?? "");
  const labels = semanticLabels(`${input.name} ${description}`, 24);
  const title = humanizeLocal(input.name) || labels[0] || "Semantic Card";
  const primaryLabels = uniqueLocal(labels).slice(0, 14);
  const anchorLabels = uniqueLocal(labels.slice(-5));
  const subtitle = primaryLabels.slice(0, 3).join(" · ") || "Ready for review";
  const proofLine =
    primaryLabels.slice(6, 14).join(", ") ||
    primaryLabels.slice(3, 6).join(", ") ||
    "state, context, and next action";
  const anchorLine =
    anchorLabels.length > 1
      ? `${anchorLabels.join(" · ")} stay visible as product anchors.`
      : "The requested product anchors stay visible instead of collapsing into placeholder copy.";
  return `VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous)
                    .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                    .frame(width: 42, height: 42)
                    .overlay {
                        Image(systemName: "sparkles")
                            .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                    }

                VStack(alignment: .leading, spacing: 5) {
                    Text("${escapeSwiftString(title)}")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("${escapeSwiftString(subtitle)}")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

                Spacer()
            }

            HStack(spacing: 8) {
                ForEach(${swiftStringArray(primaryLabels)}, id: \\.self) { item in
                    Text(item)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: Capsule())
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
            }

            Text("${escapeSwiftString(proofLine)} shape the interaction state, visual rhythm, and next action so the component is useful on first render.")
                .font(.callout)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            Text("${escapeSwiftString(anchorLine)}")
                .font(.callout)
                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})

            HStack(spacing: 8) {
                Button("Review") { }
                    .buttonStyle(.borderedProminent)
                Button("Open") { }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;
}

function uniqueLocal(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function promptOnlyDescription(description: string): string {
  return description.split(/\n\nProject context hints:/)[0] ?? description;
}

function buildSemanticRowBody(input: ViewBlueprintInput): string {
  const labels = semanticLabels(input.description ?? input.name, 2);
  return `HStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .frame(width: 34, height: 34)
                .background(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "9")}, style: .continuous))
                .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})

            VStack(alignment: .leading, spacing: 3) {
                Text("${escapeSwiftString(labels[0] ?? humanizeLocal(input.name))}")
                    .font(.subheadline.weight(.semibold))
                Text("${escapeSwiftString(labels[1] ?? "Ready for the next action")}")
                    .font(.caption)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
            }

            Spacer()

            Text("Ready")
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(${colorRef(input.tokenNamespace, "successSoft", "Color.green.opacity(0.14)")}, in: Capsule())
                .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
        }
        .padding(10)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))`;
}

function buildSemanticPillBody(input: ViewBlueprintInput): string {
  const label =
    semanticLabels(input.description ?? input.name, 1)[0] ?? humanizeLocal(input.name);
  return `Label("${escapeSwiftString(label)}", systemImage: "checkmark.seal.fill")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")}, in: Capsule())
            .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})`;
}

function buildSemanticPanelBody(input: ViewBlueprintInput): string {
  if (usesCommandLayerPanel(input)) return buildCommandLayerPanelBody(input);

  return `VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("${escapeSwiftString(humanizeLocal(input.name))}")
                    .font(.headline.weight(.semibold))
                Spacer()
                Button { } label: {
                    Image(systemName: "ellipsis")
                }
                .buttonStyle(.plain)
            }

            ${buildSemanticListRows(input)}

            HStack {
                Button("Approve") { }
                    .buttonStyle(.borderedProminent)
                Button("Defer") { }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(16)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))`;
}

function usesCommandLayerPanel(input: ViewBlueprintInput): boolean {
  const lower = `${input.name} ${input.description ?? ""}`.toLowerCase();
  return (
    /\b(command layer|command center|composer|ambient activity|feed-first|top layer|status pill|status pills|home hierarchy)\b/.test(
      lower
    ) ||
    (lower.includes("command") && lower.includes("feed"))
  );
}

function buildCommandLayerPanelBody(input: ViewBlueprintInput): string {
  const haystack = `${input.name} ${input.description ?? ""}`.toLowerCase();
  const title = /\bcommand[-\s]?layer\b/.test(haystack)
    ? "Command layer"
    : humanizeLocal(input.name);
  const terms = semanticLabels(`${input.name} ${input.description ?? ""}`, 5);
  const summary =
    terms.length > 0
      ? `${terms.slice(0, 4).join(", ")} stay visible before action.`
      : "The current surface stays intact while the next action stays visible.";
  const chips = swiftStringArray(
    Array.from(new Set(["Command Summary", ...terms])).slice(0, 4)
  );

  return `VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("${escapeSwiftString(title)}")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("${escapeSwiftString(summary)}")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

                Spacer()

                Label("Ready", systemImage: "checkmark.seal.fill")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(${colorRef(input.tokenNamespace, "successSoft", "Color.green.opacity(0.14)")}, in: Capsule())
                    .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
            }

            HStack(spacing: 8) {
                ForEach(${chips}, id: \\.self) { item in
                    Text(item)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: Capsule())
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                TextField("Ask the swarm to route, summarize, or prepare a handoff", text: .constant(""))
                    .textFieldStyle(.plain)
                Button { } label: {
                    Image(systemName: "arrow.up.right")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .padding(10)
            .background(${colorRef(input.tokenNamespace, "bg", "Color.black.opacity(0.06)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))

            HStack(spacing: 10) {
                ForEach(["2 handoffs", "5 updates", "1 risk"], id: \\.self) { item in
                    HStack(spacing: 6) {
                        Circle()
                            .fill(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                            .frame(width: 6, height: 6)
                        Text(item)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: 180, alignment: .topLeading)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous)
                .strokeBorder(${colorRef(input.tokenNamespace, "border", "Color.secondary.opacity(0.16)")}, lineWidth: 1)
        }`;
}

function buildSemanticBarBody(input: ViewBlueprintInput): string {
  const labels = swiftStringArray(semanticLabels(input.description ?? input.name, 3));
  return `HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
            TextField("Search ${escapeSwiftString(humanizeLocal(input.name).toLowerCase())}", text: .constant(""))
                .textFieldStyle(.plain)

            Picker("Filter", selection: .constant("All")) {
                ForEach(["All", "Open", "Blocked"], id: \\.self) { filter in
                    Text(filter).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 280)

            Menu {
                ForEach(${labels}, id: \\.self) { item in
                    Button(item) { }
                }
            } label: {
                Image(systemName: "slider.horizontal.3")
            }
            .menuStyle(.borderlessButton)
        }
        .padding(10)
        .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))`;
}

function buildSemanticListBody(input: ViewBlueprintInput): string {
  return `VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("${escapeSwiftString(humanizeLocal(input.name))}")
                    .font(.headline.weight(.semibold))
                Spacer()
                Button { } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(.bordered)
            }

            ${buildSemanticListRows(input)}
        }
        .padding(14)
        .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))`;
}

function buildSemanticGridBody(input: ViewBlueprintInput): string {
  const labels = swiftStringArray(semanticLabels(input.description ?? input.name, 5));
  return `LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
            ForEach(${labels}, id: \\.self) { item in
                VStack(alignment: .leading, spacing: 8) {
                    RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous)
                        .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                        .frame(height: 90)
                        .overlay {
                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                        }
                    Text(item)
                        .font(.subheadline.weight(.semibold))
                    Text("Preview, state, and next action.")
                        .font(.caption)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }
                .padding(12)
                .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
            }
        }`;
}

function buildSemanticListRows(input: ViewBlueprintInput): string {
  const labels = swiftStringArray(
    semanticLabels(`${input.name} ${input.description ?? ""}`, 4)
  );
  return `VStack(spacing: 8) {
                ForEach(${labels}, id: \\.self) { item in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                            .frame(width: 28, height: 28)
                            .overlay {
                                Image(systemName: "checkmark")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                            }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item)
                                .font(.subheadline.weight(.semibold))
                            Text("Owner, status, and next action")
                                .font(.caption)
                                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    }
                    .padding(10)
                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "10")}, style: .continuous))
                }
            }`;
}

function buildSettingsBody(input: ViewBlueprintInput): string {
  if (usesOperatingModelSettings(input.description ?? input.name)) {
    return buildOperatingModelSettingsBody(input);
  }

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

export function usesOperatingModelSettings(description: string): boolean {
  const lower = description.toLowerCase();
  return /\b(visibility|invite policy|invite limit|public modules?|member permissions?|agent permissions?|privacy posture|integration readiness|operating model)\b/.test(
    lower
  );
}

function buildOperatingModelSettingsBody(input: ViewBlueprintInput): string {
  return `VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Operating model")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                Text("Control who can see, join, automate, and publish from this workspace.")
                    .font(.caption)
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
            }

            VStack(alignment: .leading, spacing: 14) {
                Text("Access")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)

                Picker("Visibility", selection: $visibility) {
                    Text("Private").tag("Private")
                    Text("Invite only").tag("Invite only")
                    Text("Public profile").tag("Public profile")
                }

                Picker("Invite policy", selection: $invitePolicy) {
                    Text("Owner approval").tag("Owner approval")
                    Text("Trusted members").tag("Trusted members")
                    Text("Open request").tag("Open request")
                }

                Stepper("Invite limit: \\(inviteLimit)", value: $inviteLimit, in: 1...250)
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            VStack(alignment: .leading, spacing: 14) {
                Text("Permissions")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)

                Toggle("Public modules enabled", isOn: $publicModulesEnabled)
                Toggle("Members can invite", isOn: $membersCanInvite)
                Toggle("Agents can publish drafts", isOn: $agentsCanPublish)
                Toggle("Require human review", isOn: $requireReview)
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            VStack(alignment: .leading, spacing: 14) {
                Text("Trust")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                    .textCase(.uppercase)

                Picker("Privacy posture", selection: $privacyPosture) {
                    Text("Strict").tag("Strict")
                    Text("Balanced").tag("Balanced")
                    Text("Open").tag("Open")
                }

                HStack {
                    Text("Integration readiness")
                    Spacer()
                    Text(integrationReadiness)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
                }
            }
            .padding(16)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: 620, maxHeight: .infinity, alignment: .topLeading)`;
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

function buildInboxBody(input: ViewBlueprintInput): string {
  const body = `VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Inbox")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                    Text("Capture, classify, and route everything before it gets lost.")
                        .font(.callout)
                        .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                }

                Spacer()

                Button {
                    draftText = ""
                } label: {
                    Label("New Capture", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
            }

            VStack(alignment: .leading, spacing: 12) {
                TextEditor(text: $draftText)
                    .frame(minHeight: 88)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "14")}, style: .continuous))
                    .overlay(alignment: .topLeading) {
                        if draftText.isEmpty {
                            Text("Paste a note, link, transcript, or agent output...")
                                .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                                .padding(.horizontal, 16)
                                .padding(.vertical, 18)
                                .allowsHitTesting(false)
                        }
                    }

                HStack(spacing: 8) {
                    Button("Save to Project") {
                        selectedFilter = "Pinned"
                    }
                    Button("Summarize") {
                        selectedFilter = "Unread"
                    }
                    Button("Turn into Post") {
                        selectedFilter = "All"
                    }
                    Spacer()
                    Text("classified automatically")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(${colorRef(input.tokenNamespace, "success", ".green")})
                }
                .buttonStyle(.bordered)
            }
            .padding(14)
            .background(${colorRef(input.tokenNamespace, "surface", "Color.secondary.opacity(0.08)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "card", "16")}, style: .continuous))

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                TextField("Search saved items", text: $searchText)
                    .textFieldStyle(.plain)

                Picker("Filter", selection: $selectedFilter) {
                    ForEach(["All", "Unread", "Pinned", "Archived"], id: \\.self) { filter in
                        Text(filter).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 360)
            }
            .padding(10)
            .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.10)")}, in: RoundedRectangle(cornerRadius: ${radiusRef(input.tokenNamespace, "row", "12")}, style: .continuous))

            List {
                ForEach(["Agent handoff", "Voice capture", "Design reference", "Customer note"], id: \\.self) { item in
                    HStack(alignment: .top, spacing: 12) {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(${colorRef(input.tokenNamespace, "accentSoft", "Color.accentColor.opacity(0.16)")})
                            .frame(width: 38, height: 38)
                            .overlay {
                                Image(systemName: item == "Voice capture" ? "waveform" : "tray.full")
                                    .foregroundStyle(${colorRef(input.tokenNamespace, "accent", "Color.accentColor")})
                            }

                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Text(item)
                                    .font(.headline)
                                    .foregroundStyle(${colorRef(input.tokenNamespace, "textPrimary", ".primary")})
                                Text(item == "Agent handoff" ? "agent" : "source")
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 3)
                                    .background(${colorRef(input.tokenNamespace, "surfaceRaised", "Color.secondary.opacity(0.14)")}, in: Capsule())
                            }
                            Text("Related project, classification chip, source badge, tags, and next action live here.")
                                .font(.callout)
                                .foregroundStyle(${colorRef(input.tokenNamespace, "textSecondary", ".secondary")})
                                .lineLimit(2)
                            HStack(spacing: 6) {
                                Text("#project")
                                Text("#context")
                                Text("#follow-up")
                            }
                            .font(.caption)
                            .foregroundStyle(${colorRef(input.tokenNamespace, "textMuted", ".secondary")})
                        }

                        Spacer()

                        HStack(spacing: 6) {
                            Button { selectedFilter = "Pinned" } label: {
                                Image(systemName: "pin")
                            }
                            Button { selectedFilter = "Archived" } label: {
                                Image(systemName: "archivebox")
                            }
                            Button { selectedFilter = "Unread" } label: {
                                Image(systemName: "text.bubble")
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 8)
                }
            }
            .listStyle(.plain)
        }
        .padding(20)
        .background(${colorRef(input.tokenNamespace, "bg", "Color.clear")})`;

  if (input.platform === "macOS") return body;
  return `NavigationStack {
            ${body}
                .navigationTitle("Inbox")
        }`;
}

function colorRef(namespace: string | undefined, name: string, fallback: string): string {
  return namespace ? `${namespace}.Colors.${name}` : fallback;
}

function humanizeLocal(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function swiftStringArray(values: string[]): string {
  const escaped = values.map((value) => `"${escapeSwiftString(value)}"`);
  return `[${escaped.join(", ")}]`;
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
