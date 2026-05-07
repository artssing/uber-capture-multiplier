import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/surge_provider.dart';

class SettingsPanel extends StatelessWidget {
  const SettingsPanel({super.key});

  static const _intervalOptions = [5, 10, 15, 30, 60];

  @override
  Widget build(BuildContext context) {
    return Consumer<SurgeProvider>(
      builder: (context, provider, _) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: const BoxDecoration(
            color: Color(0xFF1A1A1A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text(
                    '設定',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white54),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Text(
                '更新頻率',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _intervalOptions.map((secs) {
                  final isSelected =
                      provider.refreshIntervalSeconds == secs;
                  return GestureDetector(
                    onTap: () {
                      provider.setRefreshInterval(secs);
                      Navigator.pop(context);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF276EF1)
                            : const Color(0xFF2C2C2C),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: isSelected
                              ? const Color(0xFF276EF1)
                              : Colors.white12,
                        ),
                      ),
                      child: Text(
                        secs < 60 ? '${secs}秒' : '1分鐘',
                        style: TextStyle(
                          color: isSelected ? Colors.white : Colors.white60,
                          fontSize: 14,
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
              const Divider(color: Colors.white12),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.info_outline, color: Colors.white30, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '數據為模擬數據，基於香港各區時段需求規律生成。',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.3),
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}
