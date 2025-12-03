import SwiftUI

struct PINEntryView: View {
    @Binding var pin: String
    let onSubmit: (String) -> Void
    @Environment(\.dismiss) var dismiss

    @State private var shake = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Text("Enter PIN")
                    .font(.title2)
                    .fontWeight(.semibold)

                // PIN dots
                HStack(spacing: 16) {
                    ForEach(0..<6, id: \.self) { index in
                        Circle()
                            .fill(index < pin.count ? Color.primary : Color.gray.opacity(0.3))
                            .frame(width: 16, height: 16)
                    }
                }
                .modifier(ShakeEffect(animatableData: shake ? 1 : 0))

                // Number pad
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 16) {
                    ForEach(1...9, id: \.self) { number in
                        PINButton(label: "\(number)") {
                            appendDigit("\(number)")
                        }
                    }

                    Color.clear
                        .frame(width: 72, height: 72)

                    PINButton(label: "0") {
                        appendDigit("0")
                    }

                    PINButton(label: "delete.left", isSystemImage: true) {
                        if !pin.isEmpty {
                            pin.removeLast()
                            HapticsService.selection()
                        }
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
        .onAppear {
            pin = ""
        }
    }

    func appendDigit(_ digit: String) {
        guard pin.count < 6 else { return }
        pin += digit
        HapticsService.selection()

        if pin.count == 6 {
            onSubmit(pin)
        }
    }
}

struct PINButton: View {
    let label: String
    var isSystemImage: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if isSystemImage {
                Image(systemName: label)
                    .font(.title2)
            } else {
                Text(label)
                    .font(.title)
                    .fontWeight(.medium)
            }
        }
        .frame(width: 72, height: 72)
        .background(Color.gray.opacity(0.1))
        .clipShape(Circle())
        .buttonStyle(.plain)
    }
}

struct ShakeEffect: GeometryEffect {
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        let translation = sin(animatableData * .pi * 4) * 10
        return ProjectionTransform(CGAffineTransform(translationX: translation, y: 0))
    }
}

struct PasswordEntryView: View {
    @Binding var password: String
    let onSubmit: (String) -> Void
    @Environment(\.dismiss) var dismiss

    @State private var localPassword = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Enter Password")
                    .font(.title2)
                    .fontWeight(.semibold)

                SecureField("Password", text: $localPassword)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 40)

                Button("Submit") {
                    password = localPassword
                    onSubmit(localPassword)
                }
                .buttonStyle(.borderedProminent)
                .disabled(localPassword.isEmpty)

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
}

#Preview {
    PINEntryView(pin: .constant("")) { _ in }
}
