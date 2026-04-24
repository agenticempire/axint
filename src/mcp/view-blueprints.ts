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

export function buildSmartViewBody(input: ViewBlueprintInput): string | null {
  const description = input.description ?? "";
  const explicitKind = normalizeKind(input.componentKind);
  if (explicitKind) return buildComponentBody(explicitKind, input);
  if (usesThreePaneBlueprint(description)) return buildThreePaneBody(input);
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
  if (haystack.includes("channel row") || haystack.includes("channelrow"))
    return "channelRow";
  if (haystack.includes("sidebar rail") || haystack.includes("sidebarrail"))
    return "sidebarRail";
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
  if (lower === "channelrow") return "channelRow";
  if (lower === "sidebarrail") return "sidebarRail";
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

    case "profileCard":
      return buildProfileCardBody(input.platform);

    default:
      return `VStack { Text("${input.name}") }`;
  }
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
        }`;
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

function extractDimension(
  description: string,
  pattern: RegExp,
  fallback: string
): string {
  const match = description.match(pattern);
  return match?.[2] ?? fallback;
}
