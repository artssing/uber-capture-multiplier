import 'dart:async';
import 'package:flutter/services.dart';
import '../models/order_model.dart';
import '../models/filter_rules.dart';

class AccessibilityChannel {
  static const _control = MethodChannel('order_assistant/control');
  static const _orderEvents = EventChannel('order_assistant/orders');
  static const _statusEvents = EventChannel('order_assistant/status');

  Stream<OrderModel> get orderStream => _orderEvents
      .receiveBroadcastStream()
      .where((e) => e is String)
      .map((e) => OrderModel.fromJson(e as String));

  Stream<bool> get serviceStatusStream => _statusEvents
      .receiveBroadcastStream()
      .where((e) => e is bool)
      .map((e) => e as bool);

  Future<bool> isAccessibilityEnabled() async {
    try {
      return await _control.invokeMethod<bool>('isAccessibilityEnabled') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<void> openAccessibilitySettings() =>
      _control.invokeMethod('openAccessibilitySettings');

  Future<bool> isOverlayPermissionGranted() async {
    try {
      return await _control.invokeMethod<bool>('isOverlayPermissionGranted') ?? true;
    } catch (_) {
      return true;
    }
  }

  Future<void> requestOverlayPermission() =>
      _control.invokeMethod('requestOverlayPermission');

  Future<FilterRules> getFilterRules() async {
    try {
      final map = await _control.invokeMapMethod<dynamic, dynamic>('getFilterRules');
      if (map != null) return FilterRules.fromMap(map);
    } catch (_) {}
    return FilterRules();
  }

  Future<void> updateFilterRules(FilterRules rules) =>
      _control.invokeMethod('updateFilterRules', rules.toMap());

  Future<void> setAutoAcceptEnabled(bool enabled) =>
      _control.invokeMethod('setAutoAcceptEnabled', {'enabled': enabled});

  Future<bool> isAutoAcceptEnabled() async {
    try {
      return await _control.invokeMethod<bool>('isAutoAcceptEnabled') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<List<String>> getTargetPackages() async {
    try {
      final list = await _control.invokeListMethod<String>('getTargetPackages');
      return list ?? [];
    } catch (_) {
      return [];
    }
  }

  Future<void> setTargetPackages(List<String> packages) =>
      _control.invokeMethod('setTargetPackages', {'packages': packages});

  Future<List<String>> getInstalledDriverApps() async {
    try {
      final list = await _control.invokeListMethod<String>('getInstalledDriverApps');
      return list ?? [];
    } catch (_) {
      return [];
    }
  }
}
