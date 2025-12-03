import SwiftUI

struct SignalListView: View {
    @StateObject private var viewModel = SignalViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.signals.isEmpty {
                    ProgressView("Loading signals...")
                } else if viewModel.signals.isEmpty {
                    ContentUnavailableView(
                        "No Signals",
                        systemImage: "chart.line.downtrend.xyaxis",
                        description: Text("No high-EV opportunities right now.\nPull to refresh.")
                    )
                } else {
                    List(viewModel.signals) { signal in
                        SignalRowView(signal: signal)
                            .swipeActions(edge: .trailing) {
                                Button {
                                    viewModel.selectSignal(signal)
                                } label: {
                                    Label("Trade", systemImage: "dollarsign.circle.fill")
                                }
                                .tint(.green)
                            }
                            .onTapGesture {
                                viewModel.selectSignal(signal)
                            }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Signals")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadSignals()
            }
            .sheet(item: $viewModel.selectedSignal) { signal in
                TradeConfirmationSheet(signal: signal, viewModel: viewModel)
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK") {}
            } message: {
                Text(viewModel.errorMessage)
            }
        }
    }
}

struct SignalRowView: View {
    let signal: Signal

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(signal.asset)
                        .font(.headline)
                        .fontWeight(.bold)

                    Text(signal.direction)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(signal.direction == "YES" ? Color.green.opacity(0.2) : Color.red.opacity(0.2))
                        .foregroundStyle(signal.direction == "YES" ? .green : .red)
                        .clipShape(Capsule())
                }

                Text("@ $\(signal.strike, specifier: "%.0f")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("\(signal.ev, specifier: "%.1%")")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(signal.evColor)

                Text(signal.formattedExpiry)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    SignalListView()
        .environmentObject(TradeAuthService())
}
