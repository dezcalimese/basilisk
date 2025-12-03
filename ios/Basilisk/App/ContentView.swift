import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            SignalListView()
                .tabItem {
                    Label("Signals", systemImage: "chart.line.uptrend.xyaxis")
                }
                .tag(0)

            PositionsView()
                .tabItem {
                    Label("Positions", systemImage: "briefcase.fill")
                }
                .tag(1)

            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "square.grid.2x2.fill")
                }
                .tag(2)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(3)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(TradeAuthService())
}
