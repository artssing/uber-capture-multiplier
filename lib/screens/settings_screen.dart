import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/filter_rules.dart';
import '../providers/order_provider.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late FilterRules _rules;
  late TextEditingController _minFareCtrl;
  late TextEditingController _maxPickupCtrl;
  late TextEditingController _minTripCtrl;
  late TextEditingController _minFarePerKmCtrl;
  late TextEditingController _blacklistCtrl;
  late TextEditingController _whitelistCtrl;
  late TextEditingController _delayCtrl;
  List<String> _targetPackages = [];
  String _newPackage = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final provider = context.read<OrderProvider>();
    _rules = FilterRules.fromMap(provider.rules.toMap());
    _initControllers();
    _loadPackages(provider);
  }

  void _initControllers() {
    _minFareCtrl = TextEditingController(text: _rules.minFare > 0 ? _rules.minFare.toStringAsFixed(0) : '');
    _maxPickupCtrl = TextEditingController(text: _rules.maxPickupKm.toStringAsFixed(1));
    _minTripCtrl = TextEditingController(text: _rules.minTripKm > 0 ? _rules.minTripKm.toStringAsFixed(1) : '');
    _minFarePerKmCtrl = TextEditingController(text: _rules.minFarePerKm > 0 ? _rules.minFarePerKm.toStringAsFixed(0) : '');
    _blacklistCtrl = TextEditingController(text: _rules.blacklistKeywords);
    _whitelistCtrl = TextEditingController(text: _rules.whitelistKeywords);
    _delayCtrl = TextEditingController(text: _rules.acceptDelayMs.toString());
  }

  Future<void> _loadPackages(OrderProvider provider) async {
    final pkgs = await provider.getTargetPackages();
    if (mounted) setState(() { _targetPackages = pkgs; _loading = false; });
  }

  @override
  void dispose() {
    _minFareCtrl.dispose();
    _maxPickupCtrl.dispose();
    _minTripCtrl.dispose();
    _minFarePerKmCtrl.dispose();
    _blacklistCtrl.dispose();
    _whitelistCtrl.dispose();
    _delayCtrl.dispose();
    super.dispose();
  }

  void _save() {
    _rules.minFare = double.tryParse(_minFareCtrl.text) ?? 0;
    _rules.maxPickupKm = double.tryParse(_maxPickupCtrl.text) ?? 5;
    _rules.minTripKm = double.tryParse(_minTripCtrl.text) ?? 0;
    _rules.minFarePerKm = double.tryParse(_minFarePerKmCtrl.text) ?? 0;
    _rules.blacklistKeywords = _blacklistCtrl.text.trim();
    _rules.whitelistKeywords = _whitelistCtrl.text.trim();
    _rules.acceptDelayMs = int.tryParse(_delayCtrl.text) ?? 800;

    context.read<OrderProvider>().saveRules(_rules);
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('設定已儲存'), backgroundColor: Color(0xFF34C759)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('搶單規則設定', style: TextStyle(color: Colors.white, fontSize: 17)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, color: Colors.white, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          TextButton(
            onPressed: _save,
            child: const Text('儲存', style: TextStyle(color: Color(0xFF276EF1), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF276EF1)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SectionHeader(title: '車費條件'),
                _RuleField(
                  controller: _minFareCtrl,
                  label: '最低車費 (HK\$)',
                  hint: '例：60 (不填則不限制)',
                  icon: Icons.payments_outlined,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                _RuleField(
                  controller: _minFarePerKmCtrl,
                  label: '最低每公里車費 (HK\$/km)',
                  hint: '例：8 (不填則不限制)',
                  icon: Icons.speed_outlined,
                  keyboardType: TextInputType.number,
                ),

                const SizedBox(height: 20),
                _SectionHeader(title: '距離條件'),
                _RuleField(
                  controller: _maxPickupCtrl,
                  label: '最遠接客距離 (km)',
                  hint: '例：3 (預設5公里)',
                  icon: Icons.near_me_outlined,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),
                const SizedBox(height: 12),
                _RuleField(
                  controller: _minTripCtrl,
                  label: '最短行程距離 (km)',
                  hint: '例：2 (不填則不限制)',
                  icon: Icons.route_outlined,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                ),

                const SizedBox(height: 20),
                _SectionHeader(title: '地區過濾'),
                _RuleField(
                  controller: _blacklistCtrl,
                  label: '黑名單地區 (逗號分隔)',
                  hint: '例：元朗,天水圍,屯門',
                  icon: Icons.block_outlined,
                ),
                const SizedBox(height: 12),
                _RuleField(
                  controller: _whitelistCtrl,
                  label: '白名單地區 (逗號分隔)',
                  hint: '例：中環,灣仔,銅鑼灣 (不填則接受所有)',
                  icon: Icons.check_circle_outline,
                ),

                const SizedBox(height: 20),
                _SectionHeader(title: '自動搶單設定'),
                _RuleField(
                  controller: _delayCtrl,
                  label: '搶單延遲 (毫秒)',
                  hint: '例：800 (建議600-1200)',
                  icon: Icons.timer_outlined,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1C1C1E),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text(
                    '延遲時間：彈單後多少毫秒自動點擊接單。設定太快可能被App偵測，建議800-1200ms。',
                    style: TextStyle(color: Colors.white38, fontSize: 12),
                  ),
                ),

                const SizedBox(height: 20),
                _SectionHeader(title: '監控的司機App套件名'),
                ..._targetPackages.map((pkg) => _PackageChip(
                  package: pkg,
                  onRemove: () {
                    setState(() => _targetPackages.remove(pkg));
                    context.read<OrderProvider>().setTargetPackages(_targetPackages);
                  },
                )),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        decoration: _inputDecoration('新增套件名 (如 com.xxx.driver)'),
                        onChanged: (v) => _newPackage = v,
                        onSubmitted: (_) => _addPackage(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: _addPackage,
                      icon: const Icon(Icons.add_circle, color: Color(0xFF276EF1)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1C1C1E),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('常見套件名：', style: TextStyle(color: Colors.white38, fontSize: 11)),
                      SizedBox(height: 4),
                      Text('高德司機版: com.autonavi.amap.driver', style: TextStyle(color: Colors.white38, fontSize: 11)),
                      Text('滴滴司機版: com.didi.driver', style: TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ),
                ),

                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF276EF1),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('儲存設定', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ),
                const SizedBox(height: 40),
              ],
            ),
    );
  }

  void _addPackage() {
    final pkg = _newPackage.trim();
    if (pkg.isNotEmpty && !_targetPackages.contains(pkg)) {
      setState(() => _targetPackages.add(pkg));
      context.read<OrderProvider>().setTargetPackages(_targetPackages);
    }
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
        filled: true,
        fillColor: const Color(0xFF1C1C1E),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
      );
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        title,
        style: const TextStyle(
          color: Colors.white54,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _RuleField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType keyboardType;

  const _RuleField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white38, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: keyboardType,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              inputFormatters: keyboardType == TextInputType.number ||
                      keyboardType == const TextInputType.numberWithOptions(decimal: true)
                  ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
                  : null,
              decoration: InputDecoration(
                labelText: label,
                labelStyle: const TextStyle(color: Colors.white38, fontSize: 12),
                hintText: hint,
                hintStyle: const TextStyle(color: Colors.white18, fontSize: 12),
                border: InputBorder.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PackageChip extends StatelessWidget {
  final String package;
  final VoidCallback onRemove;

  const _PackageChip({required this.package, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF276EF1).withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.apps, color: Colors.white38, size: 14),
          const SizedBox(width: 8),
          Expanded(
            child: Text(package, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.remove_circle_outline, color: Color(0xFFFF453A), size: 16),
          ),
        ],
      ),
    );
  }
}
