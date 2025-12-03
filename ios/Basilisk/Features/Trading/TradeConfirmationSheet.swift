import SwiftUI

struct TradeConfirmationSheet: View {
    let signal: Signal
    @ObservedObject var viewModel: SignalViewModel
    @EnvironmentObject var authService: TradeAuthService

    @State private var showPINEntry = false
    @State private var showPasswordEntry = false
    @State private var enteredPIN = ""
    @State private var enteredPassword = ""
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Signal summary
                SignalSummaryCard(signal: signal)

                // Size stepper
                ContractSizeStepper(size: $viewModel.contractSize)

                // Cost breakdown
                CostBreakdown(
                    contracts: viewModel.contractSize,
                    price: signal.price,
                    maxProfit: viewModel.maxProfit,
                    maxLoss: viewModel.maxLoss
                )

                Spacer()

                // Execute button
                Button(action: { Task { await executeTrade() } }) {
                    HStack {
                        Image(systemName: authIcon)
                        Text("Confirm Trade")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isExecuting)
            }
            .padding()
            .navigationTitle("Confirm Trade")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $showPINEntry) {
                PINEntryView(pin: $enteredPIN) { entered in
                    Task { await verifyPINAndTrade(entered) }
                }
            }
            .sheet(isPresented: $showPasswordEntry) {
                PasswordEntryView(password: $enteredPassword) { entered in
                    Task { await verifyPasswordAndTrade(entered) }
                }
            }
        }
    }

    var authIcon: String {
        switch authService.authMethod {
        case .biometric: return "faceid"
        case .pin: return "lock.fill"
        case .password: return "key.fill"
        case .none: return "checkmark.circle.fill"
        }
    }

    func executeTrade() async {
        HapticsService.tradeConfirm()

        let amount = Double(viewModel.contractSize) * signal.price

        // Check if we can skip auth for small trades
        if authService.shouldSkipAuth(forAmount: amount) {
            if await viewModel.executeTrade(signal: signal) {
                dismiss()
            }
            return
        }

        switch authService.authMethod {
        case .biometric:
            if await authService.authenticateWithBiometrics() {
                if await viewModel.executeTrade(signal: signal) {
                    dismiss()
                }
            }
        case .pin:
            showPINEntry = true
        case .password:
            showPasswordEntry = true
        case .none:
            if await viewModel.executeTrade(signal: signal) {
                dismiss()
            }
        }
    }

    func verifyPINAndTrade(_ pin: String) async {
        if await authService.verifyPIN(pin) {
            showPINEntry = false
            if await viewModel.executeTrade(signal: signal) {
                dismiss()
            }
        }
    }

    func verifyPasswordAndTrade(_ password: String) async {
        if await authService.verifyPassword(password) {
            showPasswordEntry = false
            if await viewModel.executeTrade(signal: signal) {
                dismiss()
            }
        }
    }
}

struct SignalSummaryCard: View {
    let signal: Signal

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text(signal.asset)
                    .font(.title)
                    .fontWeight(.bold)

                Text(signal.direction)
                    .font(.headline)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(signal.direction == "YES" ? Color.green.opacity(0.2) : Color.red.opacity(0.2))
                    .foregroundStyle(signal.direction == "YES" ? .green : .red)
                    .clipShape(Capsule())

                Spacer()

                Text("\(signal.ev, specifier: "%.1%") EV")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(signal.evColor)
            }

            HStack {
                Text("Strike: $\(signal.strike, specifier: "%.0f")")
                Spacer()
                Text("Expires: \(signal.formattedExpiry)")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct ContractSizeStepper: View {
    @Binding var size: Int

    var body: some View {
        VStack(spacing: 8) {
            Text("Contracts")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 20) {
                Button {
                    if size > 1 { size -= 1 }
                    HapticsService.selection()
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.title)
                }
                .disabled(size <= 1)

                Text("\(size)")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .frame(minWidth: 80)

                Button {
                    if size < 100 { size += 1 }
                    HapticsService.selection()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title)
                }
                .disabled(size >= 100)
            }
        }
    }
}

struct CostBreakdown: View {
    let contracts: Int
    let price: Double
    let maxProfit: Double
    let maxLoss: Double

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Est. Cost")
                Spacer()
                Text("$\(price * Double(contracts), specifier: "%.2f")")
                    .fontWeight(.semibold)
            }

            HStack {
                Text("Max Profit")
                Spacer()
                Text("+$\(maxProfit, specifier: "%.2f")")
                    .foregroundStyle(.green)
            }

            HStack {
                Text("Max Loss")
                Spacer()
                Text("-$\(maxLoss, specifier: "%.2f")")
                    .foregroundStyle(.red)
            }
        }
        .font(.subheadline)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
