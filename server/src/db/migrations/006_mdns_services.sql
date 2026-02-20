-- Migration 006: add mdns_services column to devices table
-- Stores mDNS/Bonjour discovered service types as comma-separated values
-- e.g. "_airplay._tcp,_smb._tcp,_http._tcp"

ALTER TABLE devices ADD COLUMN mdns_services TEXT;
