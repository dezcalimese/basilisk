import SwiftUI

@main
struct BasiliskApp: App {
    @StateObject private var authService = TradeAuthService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
        }
    }
}
