import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/surge_zone.dart';
import '../services/surge_service.dart';

class SurgeProvider extends ChangeNotifier {
  final SurgeService _service = SurgeService();

  List<SurgeZone> _zones = [];
  int _refreshIntervalSeconds = 15;
  bool _isLoading = false;
  DateTime? _lastRefreshed;
  Timer? _timer;
  SurgeZone? _selectedZone;

  List<SurgeZone> get zones => _zones;
  int get refreshIntervalSeconds => _refreshIntervalSeconds;
  bool get isLoading => _isLoading;
  DateTime? get lastRefreshed => _lastRefreshed;
  SurgeZone? get selectedZone => _selectedZone;

  SurgeProvider() {
    _refresh();
    _startTimer();
  }

  void setRefreshInterval(int seconds) {
    _refreshIntervalSeconds = seconds;
    _startTimer();
    notifyListeners();
  }

  void selectZone(SurgeZone? zone) {
    _selectedZone = zone;
    notifyListeners();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(
      Duration(seconds: _refreshIntervalSeconds),
      (_) => _refresh(),
    );
  }

  Future<void> _refresh() async {
    _isLoading = true;
    notifyListeners();

    // Small async delay to simulate network feel
    await Future.delayed(const Duration(milliseconds: 300));

    _zones = _service.generateSurgeData();
    _lastRefreshed = DateTime.now();
    _isLoading = false;
    notifyListeners();
  }

  Future<void> forceRefresh() => _refresh();

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
