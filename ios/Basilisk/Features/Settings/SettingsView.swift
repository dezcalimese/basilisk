import SwiftUI

struct SettingsView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    NavigationLink("API Keys") {
                        APIKeySetupView()
                    }
                }

                Section("Trading") {
                    NavigationLink("Trade Authentication") {
                        AuthSettingsView()
                    }
                }

                Section("Notifications") {
                    NavigationLink("Alert Settings") {
                        AlertSettingsView()
                    }
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct AuthSettingsView: View {
    @EnvironmentObject var authService: TradeAuthService
    @State private var showSetPIN = false
    @State private var showSetPassword = false
    @State private var skipAuthEnabled = false

    var body: some View {
        Form {
            Section("Authentication Method") {
                Picker("Method", selection: $authService.authMethod) {
                    ForEach(TradeAuthMethod.allCases, id: \.self) { method in
                        Label(method.displayName, systemImage: method.icon)
                            .tag(method)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()

                if authService.authMethod == .pin {
                    Button("Set PIN") { showSetPIN = true }
                }

                if authService.authMethod == .password {
                    Button("Set Password") { showSetPassword = true }
                }
            }

            Section("Quick Trades") {
                Toggle("Skip auth for small trades", isOn: $skipAuthEnabled)
                    .onChange(of: skipAuthEnabled) { _, newValue in
                        authService.skipAuthThreshold = newValue ? 10 : 0
                    }

                if skipAuthEnabled {
                    HStack {
                        Text("Threshold")
                        Spacer()
                        Stepper(
                            "$\(Int(authService.skipAuthThreshold))",
                            value: $authService.skipAuthThreshold,
                            in: 5...100,
                            step: 5
                        )
                    }
                }
            }

            Section {
                Text("Authentication protects against accidental trades and unauthorized access to your account.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Trade Authentication")
        .onAppear {
            skipAuthEnabled = authService.skipAuthThreshold > 0
        }
        .sheet(isPresented: $showSetPIN) {
            SetPINView()
        }
        .sheet(isPresented: $showSetPassword) {
            SetPasswordView()
        }
    }
}

struct SetPINView: View {
    @EnvironmentObject var authService: TradeAuthService
    @Environment(\.dismiss) var dismiss

    @State private var pin = ""
    @State private var confirmPin = ""
    @State private var step = 1

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Text(step == 1 ? "Enter new PIN" : "Confirm PIN")
                    .font(.title2)
                    .fontWeight(.semibold)

                HStack(spacing: 16) {
                    ForEach(0..<6, id: \.self) { index in
                        let currentPin = step == 1 ? pin : confirmPin
                        Circle()
                            .fill(index < currentPin.count ? Color.primary : Color.gray.opacity(0.3))
                            .frame(width: 16, height: 16)
                    }
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 16) {
                    ForEach(1...9, id: \.self) { number in
                        PINButton(label: "\(number)") {
                            appendDigit("\(number)")
                        }
                    }

                    Color.clear.frame(width: 72, height: 72)

                    PINButton(label: "0") {
                        appendDigit("0")
                    }

                    PINButton(label: "delete.left", isSystemImage: true) {
                        deleteDigit()
                    }
                }
                .padding(.horizontal, 40)

                Spacer()
            }
            .padding(.top, 60)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    func appendDigit(_ digit: String) {
        if step == 1 {
            guard pin.count < 6 else { return }
            pin += digit
            HapticsService.selection()

            if pin.count == 6 {
                step = 2
            }
        } else {
            guard confirmPin.count < 6 else { return }
            confirmPin += digit
            HapticsService.selection()

            if confirmPin.count == 6 {
                if pin == confirmPin {
                    Task {
                        try? await authService.setPIN(pin)
                        HapticsService.notification(.success)
                        dismiss()
                    }
                } else {
                    HapticsService.notification(.error)
                    confirmPin = ""
                }
            }
        }
    }

    func deleteDigit() {
        if step == 1 && !pin.isEmpty {
            pin.removeLast()
        } else if step == 2 && !confirmPin.isEmpty {
            confirmPin.removeLast()
        }
        HapticsService.selection()
    }
}

struct SetPasswordView: View {
    @EnvironmentObject var authService: TradeAuthService
    @Environment(\.dismiss) var dismiss

    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showError = false

    var body: some View {
        NavigationStack {
            Form {
                Section("New Password") {
                    SecureField("Password", text: $password)
                    SecureField("Confirm Password", text: $confirmPassword)
                }

                Section {
                    Button("Save Password") {
                        if password == confirmPassword && !password.isEmpty {
                            Task {
                                try? await authService.setPassword(password)
                                HapticsService.notification(.success)
                                dismiss()
                            }
                        } else {
                            showError = true
                        }
                    }
                    .disabled(password.isEmpty || confirmPassword.isEmpty)
                }
            }
            .navigationTitle("Set Password")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK") {}
            } message: {
                Text("Passwords do not match")
            }
        }
    }
}

struct AlertSettingsView: View {
    @State private var prefs: UserPreferences?
    @State private var isLoading = true
    @State private var alertsEnabled = true
    @State private var minEvThreshold = 0.05
    @State private var btcEnabled = true
    @State private var ethEnabled = true
    @State private var xrpEnabled = true

    var body: some View {
        Form {
            if isLoading {
                ProgressView()
            } else {
                Section {
                    Toggle("Alerts Enabled", isOn: $alertsEnabled)
                }

                Section("Minimum EV Threshold") {
                    Slider(value: $minEvThreshold, in: 0.01...0.20, step: 0.01) {
                        Text("EV Threshold")
                    }
                    Text("\(Int(minEvThreshold * 100))%")
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .center)
                }

                Section("Assets") {
                    Toggle("Bitcoin (BTC)", isOn: $btcEnabled)
                    Toggle("Ethereum (ETH)", isOn: $ethEnabled)
                    Toggle("Ripple (XRP)", isOn: $xrpEnabled)
                }

                Section {
                    Button("Save") {
                        Task { await savePreferences() }
                    }
                }
            }
        }
        .navigationTitle("Alert Settings")
        .task {
            await loadPreferences()
        }
    }

    func loadPreferences() async {
        do {
            prefs = try await APIClient.shared.getPreferences()
            if let prefs = prefs {
                alertsEnabled = prefs.alertsEnabled
                minEvThreshold = prefs.minEvThreshold
                btcEnabled = prefs.alertAssets.contains("BTC")
                ethEnabled = prefs.alertAssets.contains("ETH")
                xrpEnabled = prefs.alertAssets.contains("XRP")
            }
        } catch {
            // Use defaults
        }
        isLoading = false
    }

    func savePreferences() async {
        var assets: [String] = []
        if btcEnabled { assets.append("BTC") }
        if ethEnabled { assets.append("ETH") }
        if xrpEnabled { assets.append("XRP") }

        let updated = UserPreferences(
            telegramChatId: prefs?.telegramChatId,
            apnsDeviceToken: prefs?.apnsDeviceToken,
            minEvThreshold: minEvThreshold,
            alertAssets: assets,
            alertsEnabled: alertsEnabled,
            quietHoursStart: prefs?.quietHoursStart,
            quietHoursEnd: prefs?.quietHoursEnd
        )

        _ = try? await APIClient.shared.updatePreferences(updated)
        HapticsService.notification(.success)
    }
}

struct APIKeySetupView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "key.fill")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            Text("API Key Setup")
                .font(.title2)
                .fontWeight(.semibold)

            Text("API keys are managed through the backend server. Contact your administrator to configure Kalshi API credentials.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            Spacer()
        }
        .padding(.top, 60)
        .navigationTitle("API Keys")
    }
}

#Preview {
    SettingsView()
        .environmentObject(TradeAuthService())
}
