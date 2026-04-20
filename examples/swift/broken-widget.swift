import SwiftUI

struct StepsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "steps", provider: Provider()) { _ in
            Text("Steps")
        }
    }
}
