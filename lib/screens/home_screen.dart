import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/surge_provider.dart';
import '../widgets/surge_map_widget.dart';
import '../widgets/surge_legend.dart';
import '../widgets/zone_detail_card.dart';
import '../widgets/settings_panel.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  void _showSettings(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const SettingsPanel(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Full-screen map
          const SurgeMapWidget(),

          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  // App title chip
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.80),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF276EF1),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'HK Surge Map',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  // Refresh status + button
                  Consumer<SurgeProvider>(
                    builder: (context, provider, _) {
                      return GestureDetector(
                        onTap: provider.forceRefresh,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.80),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (provider.isLoading)
                                const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Color(0xFF276EF1),
                                  ),
                                )
                              else
                                const Icon(
                                  Icons.refresh,
                                  color: Colors.white70,
                                  size: 16,
                                ),
                              const SizedBox(width: 6),
                              Text(
                                '每${provider.refreshIntervalSeconds}秒更新',
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(width: 8),
                  // Settings button
                  GestureDetector(
                    onTap: () => _showSettings(context),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.80),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.tune,
                        color: Colors.white70,
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Legend (bottom-left)
          Positioned(
            left: 16,
            bottom: 100,
            child: const SurgeLegend(),
          ),

          // Last updated timestamp (bottom center)
          Positioned(
            bottom: 60,
            left: 0,
            right: 0,
            child: Consumer<SurgeProvider>(
              builder: (context, provider, _) {
                final t = provider.lastRefreshed;
                if (t == null) return const SizedBox.shrink();
                final timeStr =
                    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}:${t.second.toString().padLeft(2, '0')}';
                return Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.65),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '上次更新: $timeStr',
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 11,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Zone detail card (bottom)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: const ZoneDetailCard(),
          ),
        ],
      ),
    );
  }
}
