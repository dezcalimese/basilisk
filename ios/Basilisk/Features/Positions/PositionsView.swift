import SwiftUI

struct PositionsView: View {
    @StateObject private var viewModel = PositionsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.positions.isEmpty {
                    ProgressView("Loading positions...")
                } else if viewModel.positions.isEmpty {
                    ContentUnavailableView(
                        "No Positions",
                        systemImage: "briefcase",
                        description: Text("You don't have any open positions.\nFind signals to start trading.")
                    )
                } else {
                    List(viewModel.positions) { position in
                        PositionRowView(position: position)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await viewModel.closePosition(position) }
                                } label: {
                                    Label("Close", systemImage: "xmark.circle.fill")
                                }
                            }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Positions")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadPositions()
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK") {}
            } message: {
                Text(viewModel.errorMessage)
            }
            .alert("Position Closed", isPresented: $viewModel.showCloseResult) {
                Button("OK") {}
            } message: {
                if let result = viewModel.closeResult {
                    Text("P&L: $\(result.cost ?? 0, specifier: "%+.2f")")
                }
            }
        }
    }
}

struct PositionRowView: View {
    let position: Position

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(position.asset)
                        .font(.headline)
                        .fontWeight(.bold)

                    Text(position.direction)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(position.direction == "YES" ? Color.green.opacity(0.2) : Color.red.opacity(0.2))
                        .foregroundStyle(position.direction == "YES" ? .green : .red)
                        .clipShape(Capsule())
                }

                Text("\(position.contracts) @ $\(position.entryPrice, specifier: "%.2f")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let pnl = position.unrealizedPnl {
                    Text("$\(pnl, specifier: "%+.2f")")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundStyle(position.pnlColor)
                } else {
                    Text("--")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                if let current = position.currentPrice {
                    Text("$\(current, specifier: "%.2f")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

@MainActor
class PositionsViewModel: ObservableObject {
    @Published var positions: [Position] = []
    @Published var isLoading = false
    @Published var showError = false
    @Published var errorMessage = ""
    @Published var showCloseResult = false
    @Published var closeResult: TradeResponse?

    private let api = APIClient.shared

    func loadPositions() async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            positions = try await api.getPositions()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func refresh() async {
        do {
            positions = try await api.getPositions()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func closePosition(_ position: Position) async {
        do {
            let result = try await api.closePosition(tradeId: position.tradeId)

            if result.success {
                HapticsService.tradeExecuted()
                closeResult = result
                showCloseResult = true
                await refresh()
            } else {
                errorMessage = result.error ?? "Failed to close position"
                showError = true
                HapticsService.tradeFailed()
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            HapticsService.tradeFailed()
        }
    }
}

#Preview {
    PositionsView()
}
