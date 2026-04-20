import AppIntents

struct WaterCheck: AppIntent {
    static var title: LocalizedStringResource = "Water Check"

    @Parameter(title: "Ounces")
    var ounces: Double

    func perform() async throws -> some IntentResult {
        .result()
    }
}
