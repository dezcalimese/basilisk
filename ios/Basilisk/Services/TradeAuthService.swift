import Foundation
import LocalAuthentication
import SwiftUI

enum TradeAuthMethod: String, Codable, CaseIterable {
    case biometric = "biometric"
    case pin = "pin"
    case password = "password"
    case none = "none"

    var displayName: String {
        switch self {
        case .biometric: return "Face ID / Touch ID"
        case .pin: return "PIN (6-digit)"
        case .password: return "Password"
        case .none: return "None"
        }
    }

    var icon: String {
        switch self {
        case .biometric: return "faceid"
        case .pin: return "lock.fill"
        case .password: return "key.fill"
        case .none: return "lock.open.fill"
        }
    }
}

@MainActor
class TradeAuthService: ObservableObject {
    @AppStorage("tradeAuthMethod") var authMethod: TradeAuthMethod = .biometric
    @AppStorage("skipAuthThreshold") var skipAuthThreshold: Double = 0

    private let keychain = KeychainService()

    // MARK: - PIN Management

    func setPIN(_ pin: String) async throws {
        try await keychain.set(pin, forKey: "tradePIN")
    }

    func verifyPIN(_ pin: String) async -> Bool {
        guard let stored = try? await keychain.get("tradePIN") else { return false }
        return pin == stored
    }

    func hasPINSet() async -> Bool {
        return (try? await keychain.get("tradePIN")) != nil
    }

    // MARK: - Password Management

    func setPassword(_ password: String) async throws {
        try await keychain.set(password, forKey: "tradePassword")
    }

    func verifyPassword(_ password: String) async -> Bool {
        guard let stored = try? await keychain.get("tradePassword") else { return false }
        return password == stored
    }

    func hasPasswordSet() async -> Bool {
        return (try? await keychain.get("tradePassword")) != nil
    }

    // MARK: - Biometric Authentication

    func canUseBiometrics() -> Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    func authenticateWithBiometrics() async -> Bool {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Authenticate to execute trade"
            )
        } catch {
            return false
        }
    }

    // MARK: - Unified Auth Check

    func shouldSkipAuth(forAmount amount: Double) -> Bool {
        return skipAuthThreshold > 0 && amount < skipAuthThreshold
    }

    func requiresAuth(forAmount amount: Double) -> Bool {
        if authMethod == .none { return false }
        return !shouldSkipAuth(forAmount: amount)
    }
}

// MARK: - Keychain Service

actor KeychainService {
    func set(_ value: String, forKey key: String) throws {
        let data = value.data(using: .utf8)!

        // Delete existing item
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
    }

    func get(_ key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status != errSecItemNotFound else {
            return nil
        }

        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }

        guard let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    func delete(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
}

enum KeychainError: Error {
    case unhandledError(status: OSStatus)
}
