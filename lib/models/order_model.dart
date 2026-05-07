import 'dart:convert';

enum OrderResult { pending, autoAccepted, manualAccepted, rejected, missed }

class OrderModel {
  final String id;
  final double fare;
  final double tripDistanceKm;
  final double pickupDistanceKm;
  final String pickupAddress;
  final String destinationAddress;
  final DateTime timestamp;
  OrderResult result;

  OrderModel({
    required this.id,
    required this.fare,
    required this.tripDistanceKm,
    required this.pickupDistanceKm,
    required this.pickupAddress,
    required this.destinationAddress,
    required this.timestamp,
    this.result = OrderResult.pending,
  });

  double get farePerKm =>
      tripDistanceKm > 0 ? fare / tripDistanceKm : 0;

  factory OrderModel.fromJson(String jsonStr) {
    final map = json.decode(jsonStr) as Map<String, dynamic>;
    return OrderModel(
      id: '${map['timestamp'] ?? DateTime.now().millisecondsSinceEpoch}',
      fare: (map['fare'] as num?)?.toDouble() ?? 0,
      tripDistanceKm: (map['tripDistanceKm'] as num?)?.toDouble() ?? 0,
      pickupDistanceKm: (map['pickupDistanceKm'] as num?)?.toDouble() ?? 0,
      pickupAddress: map['pickupAddress'] as String? ?? '',
      destinationAddress: map['destinationAddress'] as String? ?? '',
      timestamp: DateTime.fromMillisecondsSinceEpoch(
        (map['timestamp'] as num?)?.toInt() ?? 0,
      ),
      result: map['event'] == 'accepted'
          ? OrderResult.autoAccepted
          : OrderResult.pending,
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'fare': fare,
        'tripDistanceKm': tripDistanceKm,
        'pickupDistanceKm': pickupDistanceKm,
        'pickupAddress': pickupAddress,
        'destinationAddress': destinationAddress,
        'timestamp': timestamp.millisecondsSinceEpoch,
        'result': result.name,
      };

  String get resultLabel {
    switch (result) {
      case OrderResult.autoAccepted:
        return '自動接單';
      case OrderResult.manualAccepted:
        return '手動接單';
      case OrderResult.rejected:
        return '已拒絕';
      case OrderResult.missed:
        return '已錯過';
      case OrderResult.pending:
        return '待處理';
    }
  }
}
