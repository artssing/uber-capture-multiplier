import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/order_model.dart';
import '../models/filter_rules.dart';
import '../services/accessibility_channel.dart';

class OrderProvider extends ChangeNotifier {
  final AccessibilityChannel _channel = AccessibilityChannel();

  // Service state
  bool _accessibilityEnabled = false;
  bool _overlayPermissionGranted = false;

  // Current live order (shown in popup)
  OrderModel? _liveOrder;

  // Order history (most recent first)
  final List<OrderModel> _history = [];

  // Filter rules
  FilterRules _rules = FilterRules();

  // Stats
  int _totalDetected = 0;
  int _totalAutoAccepted = 0;

  StreamSubscription<OrderModel>? _orderSub;
  StreamSubscription<bool>? _statusSub;

  bool get accessibilityEnabled => _accessibilityEnabled;
  bool get overlayPermissionGranted => _overlayPermissionGranted;
  OrderModel? get liveOrder => _liveOrder;
  List<OrderModel> get history => List.unmodifiable(_history);
  FilterRules get rules => _rules;
  int get totalDetected => _totalDetected;
  int get totalAutoAccepted => _totalAutoAccepted;
  bool get isReady => _accessibilityEnabled;

  OrderProvider() {
    _init();
  }

  Future<void> _init() async {
    await _checkPermissions();
    await _loadRules();
    _subscribeToEvents();
  }

  Future<void> _checkPermissions() async {
    _accessibilityEnabled = await _channel.isAccessibilityEnabled();
    _overlayPermissionGranted = await _channel.isOverlayPermissionGranted();
    notifyListeners();
  }

  Future<void> _loadRules() async {
    _rules = await _channel.getFilterRules();
    notifyListeners();
  }

  void _subscribeToEvents() {
    _orderSub?.cancel();
    _statusSub?.cancel();

    _orderSub = _channel.orderStream.listen(_onOrderEvent, onError: (_) {});
    _statusSub = _channel.serviceStatusStream.listen((enabled) {
      _accessibilityEnabled = enabled;
      notifyListeners();
    }, onError: (_) {});
  }

  void _onOrderEvent(OrderModel order) {
    _totalDetected++;

    if (order.result == OrderResult.autoAccepted) {
      _totalAutoAccepted++;
      // Update existing live order if same timestamp window
      if (_liveOrder?.id == order.id) {
        _liveOrder = order;
      }
      _addToHistory(order);
    } else {
      // New detected order - show as live
      _liveOrder = order;
      _addToHistory(order);
    }

    notifyListeners();
  }

  void _addToHistory(OrderModel order) {
    // Remove duplicate by id
    _history.removeWhere((o) => o.id == order.id);
    _history.insert(0, order);
    if (_history.length > 200) _history.removeLast();
  }

  void dismissLiveOrder() {
    if (_liveOrder != null && _liveOrder!.result == OrderResult.pending) {
      _liveOrder!.result = OrderResult.missed;
    }
    _liveOrder = null;
    notifyListeners();
  }

  Future<void> saveRules(FilterRules rules) async {
    _rules = rules;
    await _channel.updateFilterRules(rules);
    notifyListeners();
  }

  Future<void> setAutoAcceptEnabled(bool enabled) async {
    _rules.autoAcceptEnabled = enabled;
    await _channel.setAutoAcceptEnabled(enabled);
    notifyListeners();
  }

  Future<void> openAccessibilitySettings() =>
      _channel.openAccessibilitySettings();

  Future<void> requestOverlayPermission() =>
      _channel.requestOverlayPermission();

  Future<void> refreshPermissions() => _checkPermissions();

  Future<List<String>> getTargetPackages() => _channel.getTargetPackages();

  Future<void> setTargetPackages(List<String> packages) =>
      _channel.setTargetPackages(packages);

  Future<List<String>> getInstalledDriverApps() =>
      _channel.getInstalledDriverApps();

  void clearHistory() {
    _history.clear();
    _totalDetected = 0;
    _totalAutoAccepted = 0;
    notifyListeners();
  }

  @override
  void dispose() {
    _orderSub?.cancel();
    _statusSub?.cancel();
    super.dispose();
  }
}
