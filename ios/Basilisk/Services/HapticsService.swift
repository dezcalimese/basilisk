import UIKit

enum HapticsService {
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }

    static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(type)
    }

    static func selection() {
        let generator = UISelectionFeedbackGenerator()
        generator.selectionChanged()
    }

    // Trade-specific haptics
    static func tradeExecuted() {
        notification(.success)
    }

    static func tradeFailed() {
        notification(.error)
    }

    static func tradeConfirm() {
        impact(.heavy)
    }
}
