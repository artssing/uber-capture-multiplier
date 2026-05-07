import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

class SurgeZone {
  final String id;
  final String nameEn;
  final String nameCn;
  final LatLng center;
  final List<LatLng> polygon;
  double multiplier;
  DateTime lastUpdated;

  SurgeZone({
    required this.id,
    required this.nameEn,
    required this.nameCn,
    required this.center,
    required this.polygon,
    this.multiplier = 1.0,
    DateTime? lastUpdated,
  }) : lastUpdated = lastUpdated ?? DateTime.now();

  SurgeZone copyWith({double? multiplier, DateTime? lastUpdated}) {
    return SurgeZone(
      id: id,
      nameEn: nameEn,
      nameCn: nameCn,
      center: center,
      polygon: polygon,
      multiplier: multiplier ?? this.multiplier,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }

  Color get surgeColor {
    if (multiplier < 1.2) return const Color(0xFF4CAF50); // green
    if (multiplier < 1.5) return const Color(0xFF8BC34A); // light green
    if (multiplier < 1.8) return const Color(0xFFFFEB3B); // yellow
    if (multiplier < 2.2) return const Color(0xFFFF9800); // orange
    if (multiplier < 2.6) return const Color(0xFFF44336); // red
    return const Color(0xFF880E4F); // deep red
  }

  double get surgeOpacity {
    if (multiplier <= 1.0) return 0.15;
    final normalized = ((multiplier - 1.0) / 2.0).clamp(0.0, 1.0);
    return 0.2 + normalized * 0.45;
  }

  String get multiplierLabel => '${multiplier.toStringAsFixed(1)}x';

  String get surgeLevel {
    if (multiplier < 1.2) return '正常';
    if (multiplier < 1.5) return '輕微';
    if (multiplier < 1.8) return '中等';
    if (multiplier < 2.2) return '較高';
    if (multiplier < 2.6) return '高';
    return '極高';
  }
}
