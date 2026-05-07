import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/order_provider.dart';
import '../widgets/order_card.dart';
import '../widgets/permission_card.dart';
import 'settings_screen.dart';
import 'history_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Refresh permissions when returning from Settings app
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<OrderProvider>().refreshPermissions();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: _tab == 0 ? _buildDashboard() : const HistoryScreen(),
            ),
            _buildBottomNav(),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Consumer<OrderProvider>(
      builder: (context, provider, _) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
          child: Row(
            children: [
              // App logo + name
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFF276EF1).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.flash_on, color: Color(0xFF276EF1), size: 20),
              ),
              const SizedBox(width: 10),
              const Text(
                '搶單助手',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
              ),
              const SizedBox(width: 8),
              // Service status badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: provider.accessibilityEnabled
                      ? const Color(0xFF34C759).withOpacity(0.15)
                      : const Color(0xFFFF453A).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: provider.accessibilityEnabled
                            ? const Color(0xFF34C759)
                            : const Color(0xFFFF453A),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      provider.accessibilityEnabled ? '監控中' : '未開啟',
                      style: TextStyle(
                        color: provider.accessibilityEnabled
                            ? const Color(0xFF34C759)
                            : const Color(0xFFFF453A),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              // Auto-accept toggle
              GestureDetector(
                onTap: () => provider.setAutoAcceptEnabled(!provider.rules.autoAcceptEnabled),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: provider.rules.autoAcceptEnabled
                        ? const Color(0xFF276EF1).withOpacity(0.2)
                        : const Color(0xFF1C1C1E),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: provider.rules.autoAcceptEnabled
                          ? const Color(0xFF276EF1).withOpacity(0.5)
                          : Colors.white12,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        provider.rules.autoAcceptEnabled ? Icons.smart_toy : Icons.smart_toy_outlined,
                        color: provider.rules.autoAcceptEnabled
                            ? const Color(0xFF276EF1)
                            : Colors.white38,
                        size: 15,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        provider.rules.autoAcceptEnabled ? '自動搶單' : '手動模式',
                        style: TextStyle(
                          color: provider.rules.autoAcceptEnabled
                              ? const Color(0xFF276EF1)
                              : Colors.white38,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // Settings button
              IconButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const SettingsScreen()),
                ),
                icon: const Icon(Icons.tune, color: Colors.white54, size: 20),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDashboard() {
    return Consumer<OrderProvider>(
      builder: (context, provider, _) {
        return ListView(
          padding: EdgeInsets.zero,
          children: [
            // Permission setup cards
            if (!provider.accessibilityEnabled || !provider.overlayPermissionGranted)
              _buildPermissionSection(provider),

            // Live order card
            if (provider.liveOrder != null) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Color(0xFF34C759),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text(
                      '最新訂單',
                      style: TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ],
                ),
              ),
              LiveOrderCard(
                order: provider.liveOrder!,
                onDismiss: provider.dismissLiveOrder,
              ),
            ],

            // Rules summary
            if (provider.accessibilityEnabled)
              _buildRulesSummary(provider),

            // Quick stats
            if (provider.totalDetected > 0)
              _buildQuickStats(provider),

            // Setup guide if no accessibility
            if (!provider.accessibilityEnabled)
              _buildSetupGuide(),
          ],
        );
      },
    );
  }

  Widget _buildPermissionSection(OrderProvider provider) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
          child: Text(
            '需要以下權限才能開始搶單',
            style: const TextStyle(color: Colors.white38, fontSize: 12),
          ),
        ),
        PermissionCard(
          title: '無障礙服務',
          description: '用於偵測司機App訂單彈窗並自動點擊接單',
          granted: provider.accessibilityEnabled,
          onTap: provider.openAccessibilitySettings,
        ),
        PermissionCard(
          title: '懸浮視窗權限',
          description: '在司機App上方顯示訂單資訊浮層（可選）',
          granted: provider.overlayPermissionGranted,
          onTap: provider.requestOverlayPermission,
        ),
      ],
    );
  }

  Widget _buildRulesSummary(OrderProvider provider) {
    final r = provider.rules;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.filter_alt_outlined, color: Colors.white38, size: 15),
              const SizedBox(width: 6),
              const Text(
                '當前搶單規則',
                style: TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const SettingsScreen()),
                ),
                child: const Text(
                  '編輯',
                  style: TextStyle(color: Color(0xFF276EF1), fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (r.minFare > 0)
                _RuleChip(label: '最低 HK\$${r.minFare.toStringAsFixed(0)}'),
              _RuleChip(label: '接客≤ ${r.maxPickupKm.toStringAsFixed(1)}km'),
              if (r.minTripKm > 0)
                _RuleChip(label: '行程≥ ${r.minTripKm.toStringAsFixed(1)}km'),
              if (r.minFarePerKm > 0)
                _RuleChip(label: '≥HK\$${r.minFarePerKm.toStringAsFixed(0)}/km'),
              if (r.blacklistList.isNotEmpty)
                _RuleChip(
                  label: '黑: ${r.blacklistList.take(2).join(",")}${r.blacklistList.length > 2 ? "..." : ""}',
                  isBlacklist: true,
                ),
              if (r.whitelistList.isNotEmpty)
                _RuleChip(
                  label: '白: ${r.whitelistList.take(2).join(",")}${r.whitelistList.length > 2 ? "..." : ""}',
                  isWhitelist: true,
                ),
            ],
          ),
          if (!r.autoAcceptEnabled) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFFF9F0A).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Color(0xFFFF9F0A), size: 14),
                  SizedBox(width: 6),
                  Text(
                    '自動搶單已關閉 - 只顯示訂單資訊，不會自動接單',
                    style: TextStyle(color: Color(0xFFFF9F0A), fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQuickStats(OrderProvider provider) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _DashStat(
            icon: Icons.visibility_outlined,
            label: '偵測訂單',
            value: '${provider.totalDetected}',
            color: const Color(0xFF64D2FF),
          ),
          _DashStat(
            icon: Icons.flash_on,
            label: '自動接單',
            value: '${provider.totalAutoAccepted}',
            color: const Color(0xFF34C759),
          ),
          _DashStat(
            icon: Icons.timer_outlined,
            label: '延遲',
            value: '${provider.rules.acceptDelayMs}ms',
            color: const Color(0xFFFF9F0A),
          ),
        ],
      ),
    );
  }

  Widget _buildSetupGuide() {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.lightbulb_outline, color: Color(0xFFFFCC00), size: 16),
              SizedBox(width: 6),
              Text(
                '使用步驟',
                style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...[
            ('1', '點擊上方「開啟」按鈕，進入無障礙設定'),
            ('2', '找到「搶單助手」並開啟服務'),
            ('3', '返回本App，狀態將變為「監控中」'),
            ('4', '設定搶單規則（最低車費、距離等）'),
            ('5', '開啟高德司機App，等待訂單自動彈出並搶單'),
          ].map((step) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: const Color(0xFF276EF1).withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          step.$1,
                          style: const TextStyle(color: Color(0xFF276EF1), fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        step.$2,
                        style: const TextStyle(color: Colors.white60, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildBottomNav() {
    return Container(
      height: 56,
      decoration: const BoxDecoration(
        color: Color(0xFF111111),
        border: Border(top: BorderSide(color: Colors.white12)),
      ),
      child: Row(
        children: [
          _NavItem(
            icon: Icons.home_outlined,
            activeIcon: Icons.home,
            label: '主頁',
            selected: _tab == 0,
            onTap: () => setState(() => _tab = 0),
          ),
          _NavItem(
            icon: Icons.history_outlined,
            activeIcon: Icons.history,
            label: '記錄',
            selected: _tab == 1,
            onTap: () => setState(() => _tab = 1),
          ),
        ],
      ),
    );
  }
}

class _RuleChip extends StatelessWidget {
  final String label;
  final bool isBlacklist;
  final bool isWhitelist;

  const _RuleChip({
    required this.label,
    this.isBlacklist = false,
    this.isWhitelist = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = isBlacklist
        ? const Color(0xFFFF453A)
        : isWhitelist
            ? const Color(0xFF34C759)
            : const Color(0xFF276EF1);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 11)),
    );
  }
}

class _DashStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _DashStat({required this.icon, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10)),
      ],
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              selected ? activeIcon : icon,
              color: selected ? const Color(0xFF276EF1) : Colors.white38,
              size: 22,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: selected ? const Color(0xFF276EF1) : Colors.white38,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
