import Foundation

struct Trade: Identifiable, Codable {
    let id: Int
    let ticker: String
    let asset: String
    let direction: String
    let strike: Double
    let contracts: Int
    let entryPrice: Double
    let exitPrice: Double?
    let fees: Double?
    let pnl: Double?
    let status: String
    let openedAt: Date
    let closedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, ticker, asset, direction, strike, contracts
        case entryPrice = "entry_price"
        case exitPrice = "exit_price"
        case fees, pnl, status
        case openedAt = "opened_at"
        case closedAt = "closed_at"
    }
}

struct TradeResponse: Codable {
    let success: Bool
    let tradeId: Int?
    let orderId: String?
    let clientOrderId: String?
    let filled: Int
    let price: Double?
    let cost: Double?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case success
        case tradeId = "trade_id"
        case orderId = "order_id"
        case clientOrderId = "client_order_id"
        case filled, price, cost, error
    }
}

struct PnLSummary: Codable {
    let period: String
    let totalPnl: Double
    let totalFees: Double
    let netPnl: Double
    let tradeCount: Int
    let wins: Int
    let losses: Int
    let winRate: Double

    enum CodingKeys: String, CodingKey {
        case period
        case totalPnl = "total_pnl"
        case totalFees = "total_fees"
        case netPnl = "net_pnl"
        case tradeCount = "trade_count"
        case wins, losses
        case winRate = "win_rate"
    }
}
