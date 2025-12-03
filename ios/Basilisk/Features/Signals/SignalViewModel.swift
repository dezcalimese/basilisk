import Foundation

@MainActor
class SignalViewModel: ObservableObject {
    @Published var signals: [Signal] = []
    @Published var selectedSignal: Signal?
    @Published var isLoading = false
    @Published var showError = false
    @Published var errorMessage = ""

    @Published var contractSize = 1
    @Published var isExecuting = false

    private let api = APIClient.shared

    func loadSignals() async {
        guard !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            signals = try await api.getSignals(limit: 20)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func refresh() async {
        do {
            signals = try await api.getSignals(limit: 20)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func selectSignal(_ signal: Signal) {
        selectedSignal = signal
        contractSize = 1
    }

    func executeTrade(signal: Signal) async -> Bool {
        isExecuting = true
        defer { isExecuting = false }

        do {
            let result = try await api.executeFromSignal(
                signalId: signal.id,
                contracts: contractSize
            )

            if result.success {
                HapticsService.tradeExecuted()
                return true
            } else {
                errorMessage = result.error ?? "Trade failed"
                showError = true
                HapticsService.tradeFailed()
                return false
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            HapticsService.tradeFailed()
            return false
        }
    }

    var maxProfit: Double {
        guard let signal = selectedSignal else { return 0 }
        // Max profit = (1 - entry_price) * contracts
        let entryPrice = signal.price
        return (1.0 - entryPrice) * Double(contractSize)
    }

    var maxLoss: Double {
        guard let signal = selectedSignal else { return 0 }
        // Max loss = entry_price * contracts
        return signal.price * Double(contractSize)
    }

    var estimatedCost: Double {
        guard let signal = selectedSignal else { return 0 }
        return signal.price * Double(contractSize)
    }
}
