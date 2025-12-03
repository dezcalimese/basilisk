import Foundation

struct UserPreferences: Codable {
    var telegramChatId: String?
    var apnsDeviceToken: String?
    var minEvThreshold: Double
    var alertAssets: [String]
    var alertsEnabled: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?

    enum CodingKeys: String, CodingKey {
        case telegramChatId = "telegram_chat_id"
        case apnsDeviceToken = "apns_device_token"
        case minEvThreshold = "min_ev_threshold"
        case alertAssets = "alert_assets"
        case alertsEnabled = "alerts_enabled"
        case quietHoursStart = "quiet_hours_start"
        case quietHoursEnd = "quiet_hours_end"
    }
}
