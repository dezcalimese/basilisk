import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case networkError(Error)
    case decodingError(Error)
    case serverError(Int, String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown")"
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    private let baseURL: String
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: String = "http://localhost:8000/api/v1") {
        self.baseURL = baseURL

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Signals

    func getSignals(limit: Int = 10) async throws -> [Signal] {
        return try await get("/mobile/signals?limit=\(limit)")
    }

    // MARK: - Trading

    func executeTrade(
        ticker: String,
        asset: String,
        direction: String,
        strike: Double,
        contracts: Int,
        signalId: String? = nil
    ) async throws -> TradeResponse {
        struct TradeRequest: Codable {
            let ticker: String
            let asset: String
            let direction: String
            let strike: Double
            let contracts: Int
            let orderType: String
            let signalId: String?

            enum CodingKeys: String, CodingKey {
                case ticker, asset, direction, strike, contracts
                case orderType = "order_type"
                case signalId = "signal_id"
            }
        }

        let request = TradeRequest(
            ticker: ticker,
            asset: asset,
            direction: direction,
            strike: strike,
            contracts: contracts,
            orderType: "market",
            signalId: signalId
        )

        return try await post("/trade", body: request)
    }

    func executeFromSignal(signalId: Int, contracts: Int) async throws -> TradeResponse {
        struct SignalTradeRequest: Codable {
            let signalId: Int
            let contracts: Int

            enum CodingKeys: String, CodingKey {
                case signalId = "signal_id"
                case contracts
            }
        }

        let request = SignalTradeRequest(signalId: signalId, contracts: contracts)
        return try await post("/trade/signal", body: request)
    }

    // MARK: - Positions

    func getPositions() async throws -> [Position] {
        return try await get("/trade/positions")
    }

    func closePosition(tradeId: Int) async throws -> TradeResponse {
        return try await delete("/trade/positions/\(tradeId)")
    }

    // MARK: - History & P&L

    func getTradeHistory(limit: Int = 50) async throws -> [Trade] {
        return try await get("/trade/history?limit=\(limit)")
    }

    func getPnLSummary(period: String = "today") async throws -> PnLSummary {
        return try await get("/trade/pnl/\(period)")
    }

    // MARK: - Preferences

    func getPreferences() async throws -> UserPreferences {
        return try await get("/mobile/preferences")
    }

    func updatePreferences(_ prefs: UserPreferences) async throws -> UserPreferences {
        return try await patch("/mobile/preferences", body: prefs)
    }

    func registerPushToken(_ token: String) async throws {
        struct RegisterRequest: Codable {
            let deviceToken: String
            let platform: String

            enum CodingKeys: String, CodingKey {
                case deviceToken = "device_token"
                case platform
            }
        }

        let request = RegisterRequest(deviceToken: token, platform: "ios")
        let _: [String: Bool] = try await post("/mobile/register-push", body: request)
    }

    // MARK: - HTTP Methods

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        return try await perform(request)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)

        return try await perform(request)
    }

    private func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)

        return try await perform(request)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)

        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            throw APIError.serverError(httpResponse.statusCode, message)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
