-- Store raw fastfetch JSON payload for rich hardware/system info.
ALTER TABLE device_sysinfo ADD COLUMN fastfetch_json TEXT;
