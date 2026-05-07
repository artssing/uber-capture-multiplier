import 'dart:math';
import '../models/surge_zone.dart';
import '../utils/hk_districts.dart';

/// Simulates realistic Uber surge pricing for HK districts.
///
/// Surge patterns are based on real-world factors:
/// - Rush hours (7-9am, 5-8pm) drive higher multipliers
/// - Late night weekend (Fri/Sat 10pm-3am) spikes in Wan Chai / Central
/// - Airport areas have moderate persistent surge
/// - Rainy hours increase across all zones
class SurgeService {
  final Random _random = Random();

  // Each district has a base demand profile (0.0 - 1.0)
  static const Map<String, double> _districtBaseDemand = {
    'central_western': 0.80,
    'wan_chai': 0.85,
    'eastern': 0.55,
    'southern': 0.40,
    'yau_tsim_mong': 0.82,
    'sham_shui_po': 0.60,
    'kowloon_city': 0.65,
    'wong_tai_sin': 0.55,
    'kwun_tong': 0.62,
    'tsuen_wan': 0.50,
    'kwai_tsing': 0.48,
    'tuen_mun': 0.42,
    'yuen_long': 0.45,
    'north': 0.35,
    'tai_po': 0.38,
    'sha_tin': 0.52,
    'sai_kung': 0.32,
    'islands': 0.28,
  };

  List<SurgeZone> generateSurgeData() {
    final now = DateTime.now();
    return kHKDistricts.map((zone) {
      return zone.copyWith(
        multiplier: _calculateMultiplier(zone.id, now),
        lastUpdated: now,
      );
    }).toList();
  }

  double _calculateMultiplier(String districtId, DateTime now) {
    final baseDemand = _districtBaseDemand[districtId] ?? 0.5;
    double demand = baseDemand;

    // Rush hour factor
    demand *= _rushHourFactor(now);

    // Nightlife factor (Fri/Sat night for Central & Wan Chai)
    if (districtId == 'central_western' || districtId == 'wan_chai') {
      demand *= _nightlifeFactor(now);
    }

    // Airport factor (Islands district has Lantau/airport)
    if (districtId == 'islands') {
      demand *= _airportFactor(now);
    }

    // Random noise per district to simulate real variance
    final noise = 0.85 + _random.nextDouble() * 0.30;
    demand *= noise;

    // Convert demand to surge multiplier (1.0x - 3.0x)
    return _demandToMultiplier(demand.clamp(0.0, 1.0));
  }

  double _rushHourFactor(DateTime t) {
    final hour = t.hour + t.minute / 60.0;
    // Morning rush: 7:00-9:30
    if (hour >= 7.0 && hour <= 9.5) {
      final peak = 8.25;
      final dist = (hour - peak).abs();
      return 1.0 + 0.8 * exp(-dist * dist / 0.8);
    }
    // Evening rush: 17:00-20:00
    if (hour >= 17.0 && hour <= 20.0) {
      final peak = 18.5;
      final dist = (hour - peak).abs();
      return 1.0 + 1.0 * exp(-dist * dist / 1.0);
    }
    // Late night dip: 2am-6am
    if (hour >= 2.0 && hour < 6.0) return 0.3;
    return 0.7;
  }

  double _nightlifeFactor(DateTime t) {
    final hour = t.hour + t.minute / 60.0;
    final isWeekend =
        t.weekday == DateTime.friday || t.weekday == DateTime.saturday;
    if (isWeekend && (hour >= 22.0 || hour < 3.0)) return 1.8;
    if (hour >= 22.0 || hour < 3.0) return 1.3;
    return 1.0;
  }

  double _airportFactor(DateTime t) {
    final hour = t.hour;
    // Busy flight times
    if (hour >= 6 && hour <= 10) return 1.4;
    if (hour >= 18 && hour <= 23) return 1.5;
    return 1.1;
  }

  double _demandToMultiplier(double demand) {
    // Cubic curve: low demand ≈ 1.0x, high demand ≈ 3.0x
    return 1.0 + demand * demand * 2.0;
  }
}
