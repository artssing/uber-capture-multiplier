class FilterRules {
  bool autoAcceptEnabled;
  double minFare;
  double maxPickupKm;
  double minTripKm;
  double minFarePerKm;
  String blacklistKeywords; // comma separated
  String whitelistKeywords; // comma separated
  int acceptDelayMs;

  FilterRules({
    this.autoAcceptEnabled = false,
    this.minFare = 0,
    this.maxPickupKm = 5,
    this.minTripKm = 0,
    this.minFarePerKm = 0,
    this.blacklistKeywords = '',
    this.whitelistKeywords = '',
    this.acceptDelayMs = 800,
  });

  factory FilterRules.fromMap(Map<dynamic, dynamic> map) {
    return FilterRules(
      autoAcceptEnabled: map['autoAcceptEnabled'] as bool? ?? false,
      minFare: (map['minFare'] as num?)?.toDouble() ?? 0,
      maxPickupKm: (map['maxPickupKm'] as num?)?.toDouble() ?? 5,
      minTripKm: (map['minTripKm'] as num?)?.toDouble() ?? 0,
      minFarePerKm: (map['minFarePerKm'] as num?)?.toDouble() ?? 0,
      blacklistKeywords: map['blacklistKeywords'] as String? ?? '',
      whitelistKeywords: map['whitelistKeywords'] as String? ?? '',
      acceptDelayMs: (map['acceptDelayMs'] as int?) ?? 800,
    );
  }

  Map<String, dynamic> toMap() => {
        'autoAcceptEnabled': autoAcceptEnabled,
        'minFare': minFare,
        'maxPickupKm': maxPickupKm,
        'minTripKm': minTripKm,
        'minFarePerKm': minFarePerKm,
        'blacklistKeywords': blacklistKeywords,
        'whitelistKeywords': whitelistKeywords,
        'acceptDelayMs': acceptDelayMs,
      };

  List<String> get blacklistList =>
      blacklistKeywords.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

  List<String> get whitelistList =>
      whitelistKeywords.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
}
