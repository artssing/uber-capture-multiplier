import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/surge_provider.dart';

class ZoneDetailCard extends StatelessWidget {
  const ZoneDetailCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<SurgeProvider>(
      builder: (context, provider, _) {
        final zone = provider.selectedZone;
        if (zone == null) return const SizedBox.shrink();

        return AnimatedSlide(
          offset: Offset.zero,
          duration: const Duration(milliseconds: 250),
          child: Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[900],
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: zone.surgeColor.withOpacity(0.6),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: zone.surgeColor.withOpacity(0.2),
                  blurRadius: 16,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Row(
              children: [
                // Surge circle indicator
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: zone.surgeColor.withOpacity(0.15),
                    border: Border.all(color: zone.surgeColor, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      zone.multiplierLabel,
                      style: TextStyle(
                        color: zone.surgeColor,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        zone.nameCn,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        zone.nameEn,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.5),
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: zone.surgeColor.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              zone.surgeLevel,
                              style: TextStyle(
                                color: zone.surgeColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white54, size: 20),
                  onPressed: () => provider.selectZone(null),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
