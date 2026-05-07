import 'package:flutter/material.dart';

class SurgeLegend extends StatelessWidget {
  const SurgeLegend({super.key});

  static const _levels = [
    (color: Color(0xFF4CAF50), label: '< 1.2x', text: '正常'),
    (color: Color(0xFF8BC34A), label: '1.2-1.5x', text: '輕微'),
    (color: Color(0xFFFFEB3B), label: '1.5-1.8x', text: '中等'),
    (color: Color(0xFFFF9800), label: '1.8-2.2x', text: '較高'),
    (color: Color(0xFFF44336), label: '2.2-2.6x', text: '高'),
    (color: Color(0xFF880E4F), label: '> 2.6x', text: '極高'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.80),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '加乘倍數',
            style: TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          ..._levels.map(
            (level) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: level.color,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${level.label}  ${level.text}',
                    style: const TextStyle(color: Colors.white70, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
