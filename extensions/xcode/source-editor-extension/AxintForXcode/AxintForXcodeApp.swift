import SwiftUI

@main
struct AxintForXcodeApp: App {
    var body: some Scene {
        WindowGroup("Axint for Xcode") {
            ContentView()
                .frame(minWidth: 480, minHeight: 360)
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "diamond.fill")
                .font(.system(size: 56))
                .foregroundStyle(.orange)

            Text("Axint for Xcode")
                .font(.largeTitle.bold())

            Text("This app installs the Axint Source Editor Extension. To enable it:")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Step(number: 1, text: "Open System Settings → Login Items & Extensions")
                Step(number: 2, text: "Click Xcode Source Editor")
                Step(number: 3, text: "Enable AxintEditor")
                Step(number: 4, text: "Restart Xcode")
            }
            .padding(.horizontal)

            Text("Then look for the Editor → Axint menu in any Swift file.")
                .font(.callout)
                .foregroundStyle(.tertiary)
        }
        .padding(40)
    }
}

private struct Step: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number).")
                .font(.body.monospacedDigit())
                .foregroundStyle(.orange)
            Text(text)
        }
    }
}
