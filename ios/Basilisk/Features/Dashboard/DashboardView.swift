import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // P&L Card
                    PnLCard(summary: viewModel.pnlSummary, isLoading: viewModel.isLoading)

                    // Stats Grid
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        StatCard(
                            title: "Win Rate",
                            value: viewModel.pnlSummary.map { "\(Int($0.winRate * 100))%" } ?? "--",
                            icon: "chart.pie.fill",
                            color: .blue
                        )

                        StatCard(
                            title: "Trades",
                            value: viewModel.pnlSummary.map { "\($0.tradeCount)" } ?? "--",
                            icon: "arrow.left.arrow.right",
                            color: .purple
                        )

                        StatCard(
                            title: "Open",
                            value: "\(viewModel.openPositionCount)",
                            icon: "briefcase.fill",
                            color: .orange
                        )

                        StatCard(
                            title: "Signals",
                            value: "\(viewModel.activeSignalCount)",
                            icon: "bolt.fill",
                            color: .green
                        )
                    }

                    // Top Signal Preview
                    if let topSignal = viewModel.topSignal {
                        TopSignalCard(signal: topSignal)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadData()
            }
        }
    }
}

struct PnLCard: View {
    let summary: PnLSummary?
    let isLoading: Bool

    var body: some View {
        VStack(spacing: 12) {
            Text("Today's P&L")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if isLoading {
                ProgressView()
            } else if let summary = summary {
                Text("$\(summary.netPnl, specifier: "%+.2f")")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundStyle(summary.netPnl >= 0 ? .green : .red)

                HStack(spacing: 20) {
                    Label("\(summary.wins)W", systemImage: "arrow.up.circle.fill")
                        .foregroundStyle(.green)

                    Label("\(summary.losses)L", systemImage: "arrow.down.circle.fill")
                        .foregroundStyle(.red)
                }
                .font(.subheadline)
            } else {
                Text("$0.00")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)

            Text(value)
                .font(.title)
                .fontWeight(.bold)

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct TopSignalCard: View {
    let signal: Signal

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(.yellow)
                Text("Top Signal")
                    .fontWeight(.semibold)
                Spacer()
            }

            HStack {
                VStack(alignment: .leading) {
                    Text("\(signal.asset) \(signal.direction)")
                        .font(.headline)
                    Text("@ $\(signal.strike, specifier: "%.0f")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text("\(signal.ev, specifier: "%.1%") EV")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(signal.evColor)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var pnlSummary: PnLSummary?
    @Published var openPositionCount = 0
    @Published var activeSignalCount = 0
    @Published var topSignal: Signal?
    @Published var isLoading = false

    private let api = APIClient.shared

    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadPnL() }
            group.addTask { await self.loadPositions() }
            group.addTask { await self.loadSignals() }
        }
    }

    func refresh() async {
        await loadData()
    }

    private func loadPnL() async {
        do {
            pnlSummary = try await api.getPnLSummary(period: "today")
        } catch {
            // Silent fail for dashboard
        }
    }

    private func loadPositions() async {
        do {
            let positions = try await api.getPositions()
            openPositionCount = positions.count
        } catch {
            // Silent fail
        }
    }

    private func loadSignals() async {
        do {
            let signals = try await api.getSignals(limit: 10)
            activeSignalCount = signals.count
            topSignal = signals.first
        } catch {
            // Silent fail
        }
    }
}

#Preview {
    DashboardView()
}
