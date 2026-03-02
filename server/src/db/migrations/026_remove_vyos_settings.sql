-- Migration 026: Remove VyOS settings (VyOS integration fully removed).
DELETE FROM settings WHERE key LIKE 'vyos%';
DELETE FROM settings WHERE key = 'show_legacy_routers';
