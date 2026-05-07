import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../widgets/order_card.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<OrderProvider>(
      builder: (context, provider, _) {
        final history = provider.history;

        return Column(
          children: [
            // Stats bar
            if (history.isNotEmpty)
              Container(
                margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF1C1C1E),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _StatItem(
                      label: '偵測',
                      value: '${provider.totalDetected}',
                      color: const Color(0xFF64D2FF),
                    ),
                    _StatItem(
                      label: '自動接單',
                      value: '${provider.totalAutoAccepted}',
                      color: const Color(0xFF34C759),
                    ),
                    _StatItem(
                      label: '接單率',
                      value: provider.totalDetected > 0
                          ? '${(provider.totalAutoAccepted / provider.totalDetected * 100).toStringAsFixed(0)}%'
                          : '0%',
                      color: const Color(0xFFFFCC00),
                    ),
                    _StatItem(
                      label: '今日收入估算',
                      value: 'HK\$${_estimateEarnings(history)}',
                      color: const Color(0xFFFF9F0A),
                    ),
                  ],
                ),
              ),

            // History list
            Expanded(
              child: history.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.history, color: Colors.white12, size: 64),
                          SizedBox(height: 12),
                          Text(
                            '暫無訂單記錄',
                            style: TextStyle(color: Colors.white38, fontSize: 14),
                          ),
                          SizedBox(height: 4),
                          Text(
                            '開啟無障礙服務後將自動記錄所有訂單',
                            style: TextStyle(color: Colors.white24, fontSize: 12),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.only(bottom: 20),
                      itemCount: history.length,
                      itemBuilder: (context, i) => OrderHistoryTile(order: history[i]),
                    ),
            ),

            // Clear button
            if (history.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => _confirmClear(context, provider),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: const Color(0xFFFF453A).withOpacity(0.4)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text(
                      '清除所有記錄',
                      style: TextStyle(color: Color(0xFFFF453A), fontSize: 13),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  String _estimateEarnings(List<OrderModel> history) {
    final accepted = history.where((o) =>
        o.result == OrderResult.autoAccepted ||
        o.result == OrderResult.manualAccepted);
    final total = accepted.fold<double>(0, (sum, o) => sum + o.fare);
    return total.toStringAsFixed(0);
  }

  void _confirmClear(BuildContext context, OrderProvider provider) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1C1C1E),
        title: const Text('清除記錄', style: TextStyle(color: Colors.white)),
        content: const Text('確定要清除所有訂單記錄嗎？', style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消', style: TextStyle(color: Colors.white54)),
          ),
          TextButton(
            onPressed: () {
              provider.clearHistory();
              Navigator.pop(context);
            },
            child: const Text('清除', style: TextStyle(color: Color(0xFFFF453A))),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatItem({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10)),
      ],
    );
  }
}
