import Foundation

struct Position: Identifiable, Codable {
    let tradeId: Int
    let ticker: String
    let asset: String
    let direction: String
    let strike: Double
    let contracts: Int
    let entryPrice: Double
    let currentPrice: Double?
    let unrealizedPnl: Double?
    let status: String
    let expiryAt: Date?
    let openedAt: Date

    var id: Int { tradeId }

    enum CodingKeys: String, CodingKey {
        case tradeId = "trade_id"
        case ticker, asset, direction, strike, contracts
        case entryPrice = "entry_price"
        case currentPrice = "current_price"
        case unrealizedPnl = "unrealized_pnl"
        case status
        case expiryAt = "expiry_at"
        case openedAt = "opened_at"
    }

    var pnlColor: SwiftUI.Color {
        guard let pnl = unrealizedPnl else { return .secondary }
        if pnl > 0 { return .green }
        if pnl < 0 { return .red }
        return .secondary
    }
}
