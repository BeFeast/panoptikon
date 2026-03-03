-- Add motherboard, BIOS, and collector source fields to device_sysinfo
-- for fastfetch-enriched hardware inventory.

ALTER TABLE device_sysinfo ADD COLUMN motherboard_name TEXT;
ALTER TABLE device_sysinfo ADD COLUMN bios_version TEXT;
ALTER TABLE device_sysinfo ADD COLUMN bios_vendor TEXT;
ALTER TABLE device_sysinfo ADD COLUMN gpu_type TEXT;
ALTER TABLE device_sysinfo ADD COLUMN collector_source TEXT;
