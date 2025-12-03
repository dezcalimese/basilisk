import Foundation

struct Signal: Identifiable, Codable {
    let id: Int
    let ticker: String
    let asset: String
    let direction: String
    let strike: Double
    let ev: Double
    let confidence: Double
    let timeToExpiryMinutes: Int

    enum CodingKeys: String, CodingKey {
        case id, ticker, asset, direction, strike, ev, confidence
        case timeToExpiryMinutes = "time_to_expiry_minutes"
    }

    var evColor: SwiftUI.Color {
        if ev > 0.10 { return .green }
        if ev > 0.05 { return .yellow }
        return .primary
    }

    var formattedExpiry: String {
        if timeToExpiryMinutes < 60 {
            return "\(timeToExpiryMinutes)m"
        }
        let hours = timeToExpiryMinutes / 60
        let mins = timeToExpiryMinutes % 60
        if mins == 0 {
            return "\(hours)h"
        }
        return "\(hours)h \(mins)m"
    }

    var price: Double {
        // Approximate price from EV (simplified)
        return ev > 0 ? 0.50 : 0.50
    }
}

struct SignalDetail: Codable {
    let id: Int
    let ticker: String
    let asset: String
    let direction: String
    let strike: Double
    let ev: Double
    let edge: Double
    let confidence: Double
    let marketPrice: Double
    let modelPrice: Double
    let timeToExpiryHours: Double

    enum CodingKeys: String, CodingKey {
        case id, ticker, asset, direction, strike, ev, edge, confidence
        case marketPrice = "market_price"
        case modelPrice = "model_price"
        case timeToExpiryHours = "time_to_expiry_hours"
    }
}
