//! Embedded PHP bridge script for pfSense interaction.
//!
//! This script is uploaded to pfSense via SSH and executed with php-cgi.
//! It uses pfSense's internal PHP functions to read/write configuration.
//!
//! ## ID strategy
//! - Firewall rules: `tracker` field (pfSense-native, unique per rule)
//! - NAT port-forward rules: `tracker` field (same as firewall)
//! - DHCP static mappings: SHA-256(mac + ip + interface), truncated to 16 hex chars
//! - DNS host overrides: SHA-256(host + domain + ip), truncated to 16 hex chars
//! - Aliases: `name` (natural unique key)
//!
//! ## Payload transport
//! Action name is passed as argv[1]. JSON payload is read from stdin.

pub const BRIDGE_PHP: &str = r#"<?php
error_reporting(0);
ini_set('display_errors', 0);
ob_start();

require_once('/etc/inc/config.inc');
require_once('/etc/inc/config.lib.inc');
require_once('/etc/inc/filter.inc');
require_once('/etc/inc/gwlb.inc');
require_once('/etc/inc/interfaces.inc');
require_once('/etc/inc/services.inc');
require_once('/etc/inc/system.inc');
require_once('/etc/inc/util.inc');
require_once('/etc/inc/pfsense-utils.inc');

ob_end_clean();

function respond($success, $data = null, $error = null) {
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'error' => $error,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit(0);
}

$action = isset($argv[1]) ? $argv[1] : '';
$payload = json_decode(file_get_contents('php://stdin'), true);
if (!is_array($payload)) $payload = [];

try {
    switch ($action) {

    case 'status':
        $sys = config_get_path('system');
        $version = @file_get_contents('/etc/version');
        $boottime = shell_exec('sysctl -n kern.boottime 2>/dev/null');
        $uptime_sec = 0;
        if (preg_match('/sec\s*=\s*(\d+)/', $boottime, $m)) {
            $uptime_sec = time() - intval($m[1]);
        }
        $days = intval($uptime_sec / 86400);
        $hours = intval(($uptime_sec % 86400) / 3600);
        $mins = intval(($uptime_sec % 3600) / 60);
        $uptime_str = "${days}d ${hours}h ${mins}m";

        $mem_total = intval(shell_exec('sysctl -n hw.physmem 2>/dev/null'));
        $mem_info = shell_exec('sysctl -n vm.stats.vm.v_inactive_count vm.stats.vm.v_cache_count vm.stats.vm.v_free_count hw.pagesize 2>/dev/null');
        $mem_parts = preg_split('/\s+/', trim($mem_info));
        $mem_free = 0;
        if (count($mem_parts) >= 4) {
            $pagesize = intval($mem_parts[3]);
            $mem_free = (intval($mem_parts[0]) + intval($mem_parts[1]) + intval($mem_parts[2])) * $pagesize;
        }
        $mem_used = $mem_total - $mem_free;

        $t1 = preg_split('/\s+/', trim(shell_exec('sysctl -n kern.cp_time 2>/dev/null')));
        usleep(200000); // 200 ms
        $t2 = preg_split('/\s+/', trim(shell_exec('sysctl -n kern.cp_time 2>/dev/null')));
        $cpu_usage = 0.0;
        if (count($t1) >= 5 && count($t2) >= 5) {
            $dtotal = array_sum($t2) - array_sum($t1);
            $didle = intval($t2[4]) - intval($t1[4]);
            if ($dtotal > 0) {
                $cpu_usage = round((($dtotal - $didle) / $dtotal) * 100, 2);
            }
        }

        respond(true, [
            'hostname' => isset($sys['hostname']) ? $sys['hostname'] : null,
            'domain' => isset($sys['domain']) ? $sys['domain'] : null,
            'version' => trim($version),
            'uptime' => $uptime_str,
            'cpu_usage' => $cpu_usage,
            'memory_total' => $mem_total,
            'memory_used' => $mem_used,
            'platform' => php_uname('m'),
        ]);

    case 'interfaces':
        $ifaces = config_get_path('interfaces');
        $result = [];
        if (is_array($ifaces)) {
            foreach ($ifaces as $ifname => $ifcfg) {
                $info = get_interface_info($ifname);
                $result[] = [
                    'name' => $ifname,
                    'descr' => isset($ifcfg['descr']) ? $ifcfg['descr'] : $ifname,
                    'iface_type' => isset($ifcfg['if']) ? (strpos($ifcfg['if'], 'vlan') !== false ? 'vlan' : (strpos($ifcfg['if'], 'bridge') !== false ? 'bridge' : (strpos($ifcfg['if'], 'lagg') !== false ? 'lagg' : 'physical'))) : 'unknown',
                    'status' => isset($info['status']) ? $info['status'] : 'unknown',
                    'ip_address' => isset($info['ipaddr']) ? $info['ipaddr'] : null,
                    'subnet' => isset($info['subnet']) ? $info['subnet'] : null,
                    'mac' => isset($info['macaddr']) ? $info['macaddr'] : null,
                    'mtu' => isset($ifcfg['mtu']) ? $ifcfg['mtu'] : null,
                    'media' => isset($info['media']) ? $info['media'] : null,
                ];
            }
        }
        respond(true, $result);

    case 'interface_toggle':
        $iface = isset($payload['interface']) ? $payload['interface'] : null;
        $enable = isset($payload['enable']) ? $payload['enable'] : true;
        if (!$iface) respond(false, null, 'Missing interface parameter');
        $path = "interfaces/{$iface}";
        $cfg = config_get_path($path);
        if (!$cfg) respond(false, null, "Interface {$iface} not found");
        if ($enable) {
            unset($cfg['disabled']);
        } else {
            $cfg['disabled'] = true;
        }
        config_set_path($path, $cfg);
        write_config("Panoptikon: toggled interface {$iface}");
        interface_configure($iface);
        respond(true, ['interface' => $iface, 'enabled' => $enable]);

    case 'gateways':
        $gws = return_gateways_array(true, true);
        $result = [];
        if (is_array($gws)) {
            foreach ($gws as $gw) {
                $result[] = [
                    'name' => isset($gw['name']) ? $gw['name'] : null,
                    'interface' => isset($gw['friendlyiface']) ? $gw['friendlyiface'] : null,
                    'gateway_ip' => isset($gw['gateway']) ? $gw['gateway'] : null,
                    'monitor_ip' => isset($gw['monitor']) ? $gw['monitor'] : null,
                    'status' => isset($gw['status']) ? $gw['status'] : 'unknown',
                    'delay' => isset($gw['delay']) ? $gw['delay'] : null,
                    'stddev' => isset($gw['stddev']) ? $gw['stddev'] : null,
                    'loss' => isset($gw['loss']) ? $gw['loss'] : null,
                ];
            }
        }
        respond(true, $result);

    case 'routes':
        $routes = config_get_path('staticroutes/route');
        $result = [];
        if (is_array($routes)) {
            foreach ($routes as $r) {
                $result[] = [
                    'network' => isset($r['network']) ? $r['network'] : null,
                    'gateway' => isset($r['gateway']) ? $r['gateway'] : null,
                    'interface' => isset($r['interface']) ? $r['interface'] : null,
                    'flags' => isset($r['disabled']) ? 'disabled' : 'active',
                ];
            }
        }
        respond(true, $result);

    case 'route_create':
        $network = isset($payload['network']) ? $payload['network'] : null;
        $gateway = isset($payload['gateway']) ? $payload['gateway'] : null;
        if (!$network || !$gateway) respond(false, null, 'Missing network or gateway');
        $routes = config_get_path('staticroutes/route');
        if (!is_array($routes)) $routes = [];
        $route = [
            'network' => $network,
            'gateway' => $gateway,
        ];
        if (isset($payload['interface'])) $route['interface'] = $payload['interface'];
        $routes[] = $route;
        config_set_path('staticroutes/route', $routes);
        write_config("Panoptikon: added static route {$network}");
        system_routing_configure();
        respond(true, ['network' => $network]);

    case 'route_delete':
        $network = isset($payload['network']) ? $payload['network'] : null;
        if (!$network) respond(false, null, 'Missing network parameter');
        $routes = config_get_path('staticroutes/route');
        if (is_array($routes)) {
            $routes = array_values(array_filter($routes, function($r) use ($network) {
                return !isset($r['network']) || $r['network'] !== $network;
            }));
            config_set_path('staticroutes/route', $routes);
            write_config("Panoptikon: deleted static route {$network}");
            system_routing_configure();
        }
        respond(true, ['deleted' => $network]);

    case 'dhcp_leases':
        $leases = system_get_dhcpleases();
        $result = [];
        if (isset($leases['lease']) && is_array($leases['lease'])) {
            foreach ($leases['lease'] as $l) {
                $result[] = [
                    'ip' => isset($l['ip']) ? $l['ip'] : null,
                    'mac' => isset($l['mac']) ? $l['mac'] : null,
                    'hostname' => isset($l['hostname']) ? $l['hostname'] : null,
                    'start' => isset($l['start']) ? $l['start'] : null,
                    'end' => isset($l['end']) ? $l['end'] : null,
                    'status' => isset($l['act']) ? $l['act'] : null,
                    'interface' => isset($l['if']) ? $l['if'] : null,
                ];
            }
        }
        respond(true, $result);

    case 'dhcp_static_mappings':
        $dhcpd = config_get_path('dhcpd');
        $result = [];
        if (is_array($dhcpd)) {
            foreach ($dhcpd as $ifname => $ifcfg) {
                if (isset($ifcfg['staticmap']) && is_array($ifcfg['staticmap'])) {
                    foreach ($ifcfg['staticmap'] as $map) {
                        $mac = isset($map['mac']) ? $map['mac'] : '';
                        $ip = isset($map['ipaddr']) ? $map['ipaddr'] : '';
                        $id = substr(hash('sha256', $mac . $ip . $ifname), 0, 16);
                        $result[] = [
                            'id' => $id,
                            'mac' => $mac ?: null,
                            'ip' => $ip ?: null,
                            'hostname' => isset($map['hostname']) ? $map['hostname'] : null,
                            'description' => isset($map['descr']) ? $map['descr'] : null,
                            'interface' => $ifname,
                        ];
                    }
                }
            }
        }
        respond(true, $result);

    case 'dhcp_static_create':
        $iface = isset($payload['interface']) ? $payload['interface'] : 'lan';
        $mac = isset($payload['mac']) ? $payload['mac'] : null;
        $ip = isset($payload['ip']) ? $payload['ip'] : null;
        if (!$mac || !$ip) respond(false, null, 'Missing mac or ip');
        $path = "dhcpd/{$iface}/staticmap";
        $maps = config_get_path($path);
        if (!is_array($maps)) $maps = [];
        $entry = ['mac' => $mac, 'ipaddr' => $ip];
        if (isset($payload['hostname'])) $entry['hostname'] = $payload['hostname'];
        if (isset($payload['description'])) $entry['descr'] = $payload['description'];
        $maps[] = $entry;
        config_set_path($path, $maps);
        write_config("Panoptikon: added DHCP static mapping {$mac} -> {$ip}");
        services_dhcpd_configure();
        $id = substr(hash('sha256', $mac . $ip . $iface), 0, 16);
        respond(true, ['id' => $id, 'mac' => $mac, 'ip' => $ip]);

    case 'dhcp_static_delete':
        $id = isset($payload['id']) ? $payload['id'] : null;
        if (!$id) respond(false, null, 'Missing id parameter');
        $dhcpd = config_get_path('dhcpd');
        if (!is_array($dhcpd)) respond(false, null, 'No DHCP config found');
        $deleted = false;
        foreach ($dhcpd as $ifname => &$ifcfg) {
            if (!isset($ifcfg['staticmap']) || !is_array($ifcfg['staticmap'])) continue;
            foreach ($ifcfg['staticmap'] as $idx => $map) {
                $mac = isset($map['mac']) ? $map['mac'] : '';
                $ip = isset($map['ipaddr']) ? $map['ipaddr'] : '';
                $check_id = substr(hash('sha256', $mac . $ip . $ifname), 0, 16);
                if ($check_id === $id) {
                    array_splice($ifcfg['staticmap'], $idx, 1);
                    $deleted = true;
                    break 2;
                }
            }
        }
        unset($ifcfg);
        if (!$deleted) respond(false, null, "DHCP static mapping {$id} not found");
        config_set_path('dhcpd', $dhcpd);
        write_config("Panoptikon: deleted DHCP static mapping {$id}");
        services_dhcpd_configure();
        respond(true, ['deleted' => $id]);

    case 'firewall_rules':
        $rules = config_get_path('filter/rule');
        $result = [];
        if (is_array($rules)) {
            foreach ($rules as $r) {
                $tracker = isset($r['tracker']) ? strval($r['tracker']) : null;
                $result[] = [
                    'id' => $tracker,
                    'action' => isset($r['type']) ? $r['type'] : 'pass',
                    'interface' => isset($r['interface']) ? $r['interface'] : null,
                    'protocol' => isset($r['protocol']) ? $r['protocol'] : null,
                    'source' => isset($r['source']['address']) ? $r['source']['address'] : (isset($r['source']['any']) ? 'any' : null),
                    'destination' => isset($r['destination']['address']) ? $r['destination']['address'] : (isset($r['destination']['any']) ? 'any' : null),
                    'port' => isset($r['destination']['port']) ? $r['destination']['port'] : null,
                    'description' => isset($r['descr']) ? $r['descr'] : null,
                    'disabled' => isset($r['disabled']),
                    'log' => isset($r['log']),
                    'tracker' => $tracker,
                ];
            }
        }
        respond(true, $result);

    case 'firewall_rule_create':
        $rules = config_get_path('filter/rule');
        if (!is_array($rules)) $rules = [];
        $rule = [];
        $rule['type'] = isset($payload['type']) ? $payload['type'] : 'pass';
        if (isset($payload['interface'])) $rule['interface'] = $payload['interface'];
        if (isset($payload['protocol'])) $rule['protocol'] = $payload['protocol'];
        if (isset($payload['source'])) {
            $rule['source'] = ($payload['source'] === 'any') ? ['any' => ''] : ['address' => $payload['source']];
        } else {
            $rule['source'] = ['any' => ''];
        }
        if (isset($payload['destination'])) {
            $rule['destination'] = ($payload['destination'] === 'any') ? ['any' => ''] : ['address' => $payload['destination']];
        } else {
            $rule['destination'] = ['any' => ''];
        }
        if (isset($payload['port'])) $rule['destination']['port'] = $payload['port'];
        if (isset($payload['description'])) $rule['descr'] = $payload['description'];
        if (isset($payload['disabled']) && $payload['disabled']) $rule['disabled'] = '';
        if (isset($payload['log']) && $payload['log']) $rule['log'] = '';
        $rule['tracker'] = strval(intval(microtime(true) * 1000000));
        $rules[] = $rule;
        config_set_path('filter/rule', $rules);
        write_config("Panoptikon: added firewall rule");
        filter_configure_sync();
        respond(true, ['id' => $rule['tracker']]);

    case 'firewall_rule_update':
        $tracker = isset($payload['id']) ? $payload['id'] : null;
        if (!$tracker) respond(false, null, 'Missing rule id (tracker)');
        $rules = config_get_path('filter/rule');
        if (!is_array($rules)) respond(false, null, 'No rules found');
        $found_idx = -1;
        foreach ($rules as $idx => $r) {
            if (isset($r['tracker']) && strval($r['tracker']) === $tracker) {
                $found_idx = $idx;
                break;
            }
        }
        if ($found_idx < 0) respond(false, null, "Rule with tracker {$tracker} not found");
        $rule = $rules[$found_idx];
        if (isset($payload['type'])) $rule['type'] = $payload['type'];
        if (isset($payload['interface'])) $rule['interface'] = $payload['interface'];
        if (isset($payload['protocol'])) $rule['protocol'] = $payload['protocol'];
        if (isset($payload['source'])) {
            $rule['source'] = ($payload['source'] === 'any') ? ['any' => ''] : ['address' => $payload['source']];
        }
        if (isset($payload['destination'])) {
            $rule['destination'] = ($payload['destination'] === 'any') ? ['any' => ''] : ['address' => $payload['destination']];
        }
        if (isset($payload['port'])) $rule['destination']['port'] = $payload['port'];
        if (isset($payload['description'])) $rule['descr'] = $payload['description'];
        if (isset($payload['disabled'])) {
            if ($payload['disabled']) { $rule['disabled'] = ''; } else { unset($rule['disabled']); }
        }
        if (isset($payload['log'])) {
            if ($payload['log']) { $rule['log'] = ''; } else { unset($rule['log']); }
        }
        $rules[$found_idx] = $rule;
        config_set_path('filter/rule', $rules);
        write_config("Panoptikon: updated firewall rule {$tracker}");
        filter_configure_sync();
        respond(true, ['id' => $tracker]);

    case 'firewall_rule_delete':
        $tracker = isset($payload['id']) ? $payload['id'] : null;
        if (!$tracker) respond(false, null, 'Missing rule id (tracker)');
        $rules = config_get_path('filter/rule');
        if (!is_array($rules)) respond(false, null, 'No rules found');
        $found_idx = -1;
        foreach ($rules as $idx => $r) {
            if (isset($r['tracker']) && strval($r['tracker']) === $tracker) {
                $found_idx = $idx;
                break;
            }
        }
        if ($found_idx < 0) respond(false, null, "Rule with tracker {$tracker} not found");
        array_splice($rules, $found_idx, 1);
        config_set_path('filter/rule', $rules);
        write_config("Panoptikon: deleted firewall rule {$tracker}");
        filter_configure_sync();
        respond(true, ['deleted' => $tracker]);

    case 'nat_rules':
        $rules = config_get_path('nat/rule');
        $result = [];
        if (is_array($rules)) {
            foreach ($rules as $r) {
                $tracker = isset($r['tracker']) ? strval($r['tracker']) : null;
                $result[] = [
                    'id' => $tracker,
                    'interface' => isset($r['interface']) ? $r['interface'] : null,
                    'protocol' => isset($r['protocol']) ? $r['protocol'] : null,
                    'source' => isset($r['source']['address']) ? $r['source']['address'] : (isset($r['source']['any']) ? 'any' : null),
                    'destination' => isset($r['destination']['address']) ? $r['destination']['address'] : (isset($r['destination']['any']) ? 'any' : null),
                    'target' => isset($r['target']) ? $r['target'] : null,
                    'local_port' => isset($r['local-port']) ? $r['local-port'] : null,
                    'description' => isset($r['descr']) ? $r['descr'] : null,
                    'disabled' => isset($r['disabled']),
                    'tracker' => $tracker,
                ];
            }
        }
        respond(true, $result);

    case 'nat_rule_create':
        $rules = config_get_path('nat/rule');
        if (!is_array($rules)) $rules = [];
        $rule = [];
        if (isset($payload['interface'])) $rule['interface'] = $payload['interface'];
        if (isset($payload['protocol'])) $rule['protocol'] = $payload['protocol'];
        if (isset($payload['source'])) {
            $rule['source'] = ($payload['source'] === 'any') ? ['any' => ''] : ['address' => $payload['source']];
        } else {
            $rule['source'] = ['any' => ''];
        }
        if (isset($payload['destination'])) {
            $rule['destination'] = ($payload['destination'] === 'any') ? ['any' => ''] : ['address' => $payload['destination']];
        } else {
            $rule['destination'] = ['any' => ''];
        }
        if (isset($payload['target'])) $rule['target'] = $payload['target'];
        if (isset($payload['local_port'])) $rule['local-port'] = $payload['local_port'];
        if (isset($payload['description'])) $rule['descr'] = $payload['description'];
        if (isset($payload['disabled']) && $payload['disabled']) $rule['disabled'] = '';
        $rule['tracker'] = strval(intval(microtime(true) * 1000000));
        $rules[] = $rule;
        config_set_path('nat/rule', $rules);
        write_config("Panoptikon: added NAT port-forward rule");
        filter_configure_sync();
        respond(true, ['id' => $rule['tracker']]);

    case 'nat_rule_update':
        $tracker = isset($payload['id']) ? $payload['id'] : null;
        if (!$tracker) respond(false, null, 'Missing rule id (tracker)');
        $rules = config_get_path('nat/rule');
        if (!is_array($rules)) respond(false, null, 'No NAT rules found');
        $found_idx = -1;
        foreach ($rules as $idx => $r) {
            if (isset($r['tracker']) && strval($r['tracker']) === $tracker) {
                $found_idx = $idx;
                break;
            }
        }
        if ($found_idx < 0) respond(false, null, "NAT rule with tracker {$tracker} not found");
        $rule = $rules[$found_idx];
        if (isset($payload['interface'])) $rule['interface'] = $payload['interface'];
        if (isset($payload['protocol'])) $rule['protocol'] = $payload['protocol'];
        if (isset($payload['source'])) {
            $rule['source'] = ($payload['source'] === 'any') ? ['any' => ''] : ['address' => $payload['source']];
        }
        if (isset($payload['destination'])) {
            $rule['destination'] = ($payload['destination'] === 'any') ? ['any' => ''] : ['address' => $payload['destination']];
        }
        if (isset($payload['target'])) $rule['target'] = $payload['target'];
        if (isset($payload['local_port'])) $rule['local-port'] = $payload['local_port'];
        if (isset($payload['description'])) $rule['descr'] = $payload['description'];
        if (isset($payload['disabled'])) {
            if ($payload['disabled']) { $rule['disabled'] = ''; } else { unset($rule['disabled']); }
        }
        $rules[$found_idx] = $rule;
        config_set_path('nat/rule', $rules);
        write_config("Panoptikon: updated NAT rule {$tracker}");
        filter_configure_sync();
        respond(true, ['id' => $tracker]);

    case 'nat_rule_delete':
        $tracker = isset($payload['id']) ? $payload['id'] : null;
        if (!$tracker) respond(false, null, 'Missing rule id (tracker)');
        $rules = config_get_path('nat/rule');
        if (!is_array($rules)) respond(false, null, 'No NAT rules found');
        $found_idx = -1;
        foreach ($rules as $idx => $r) {
            if (isset($r['tracker']) && strval($r['tracker']) === $tracker) {
                $found_idx = $idx;
                break;
            }
        }
        if ($found_idx < 0) respond(false, null, "NAT rule with tracker {$tracker} not found");
        array_splice($rules, $found_idx, 1);
        config_set_path('nat/rule', $rules);
        write_config("Panoptikon: deleted NAT rule {$tracker}");
        filter_configure_sync();
        respond(true, ['deleted' => $tracker]);

    case 'aliases':
        $aliases = config_get_path('aliases/alias');
        $result = [];
        if (is_array($aliases)) {
            foreach ($aliases as $a) {
                $result[] = [
                    'name' => isset($a['name']) ? $a['name'] : null,
                    'alias_type' => isset($a['type']) ? $a['type'] : null,
                    'address' => isset($a['address']) ? $a['address'] : null,
                    'description' => isset($a['descr']) ? $a['descr'] : null,
                    'detail' => isset($a['detail']) ? $a['detail'] : null,
                ];
            }
        }
        respond(true, $result);

    case 'alias_create':
        $name = isset($payload['name']) ? $payload['name'] : null;
        if (!$name) respond(false, null, 'Missing alias name');
        $aliases = config_get_path('aliases/alias');
        if (!is_array($aliases)) $aliases = [];
        $entry = ['name' => $name];
        if (isset($payload['type'])) $entry['type'] = $payload['type'];
        if (isset($payload['address'])) $entry['address'] = $payload['address'];
        if (isset($payload['description'])) $entry['descr'] = $payload['description'];
        if (isset($payload['detail'])) $entry['detail'] = $payload['detail'];
        $aliases[] = $entry;
        config_set_path('aliases/alias', $aliases);
        write_config("Panoptikon: created alias {$name}");
        filter_configure_sync();
        respond(true, ['name' => $name]);

    case 'alias_update':
        $name = isset($payload['name']) ? $payload['name'] : null;
        if (!$name) respond(false, null, 'Missing alias name');
        $aliases = config_get_path('aliases/alias');
        if (!is_array($aliases)) respond(false, null, 'No aliases found');
        $found = false;
        foreach ($aliases as &$a) {
            if (isset($a['name']) && $a['name'] === $name) {
                if (isset($payload['type'])) $a['type'] = $payload['type'];
                if (isset($payload['address'])) $a['address'] = $payload['address'];
                if (isset($payload['description'])) $a['descr'] = $payload['description'];
                if (isset($payload['detail'])) $a['detail'] = $payload['detail'];
                $found = true;
                break;
            }
        }
        unset($a);
        if (!$found) respond(false, null, "Alias {$name} not found");
        config_set_path('aliases/alias', $aliases);
        write_config("Panoptikon: updated alias {$name}");
        filter_configure_sync();
        respond(true, ['name' => $name]);

    case 'alias_delete':
        $name = isset($payload['name']) ? $payload['name'] : null;
        if (!$name) respond(false, null, 'Missing alias name');
        $aliases = config_get_path('aliases/alias');
        if (is_array($aliases)) {
            $aliases = array_values(array_filter($aliases, function($a) use ($name) {
                return !isset($a['name']) || $a['name'] !== $name;
            }));
            config_set_path('aliases/alias', $aliases);
            write_config("Panoptikon: deleted alias {$name}");
            filter_configure_sync();
        }
        respond(true, ['deleted' => $name]);

    case 'dns_config':
        $unbound = config_get_path('unbound');
        $sys = config_get_path('system');
        $servers = [];
        if (isset($sys['dnsserver']) && is_array($sys['dnsserver'])) {
            $servers = $sys['dnsserver'];
        }
        respond(true, [
            'resolver_enabled' => isset($unbound['enable']),
            'servers' => $servers,
        ]);

    case 'dns_overrides':
        $hosts = config_get_path('unbound/hosts');
        $result = [];
        if (is_array($hosts)) {
            foreach ($hosts as $h) {
                $host = isset($h['host']) ? $h['host'] : '';
                $domain = isset($h['domain']) ? $h['domain'] : '';
                $ip = isset($h['ip']) ? $h['ip'] : '';
                $id = substr(hash('sha256', $host . $domain . $ip), 0, 16);
                $result[] = [
                    'id' => $id,
                    'host' => $host ?: null,
                    'domain' => $domain ?: null,
                    'ip' => $ip ?: null,
                    'description' => isset($h['descr']) ? $h['descr'] : null,
                ];
            }
        }
        respond(true, $result);

    case 'dns_override_create':
        $host = isset($payload['host']) ? $payload['host'] : null;
        $domain = isset($payload['domain']) ? $payload['domain'] : null;
        $ip = isset($payload['ip']) ? $payload['ip'] : null;
        if (!$host || !$domain || !$ip) respond(false, null, 'Missing host, domain, or ip');
        $hosts = config_get_path('unbound/hosts');
        if (!is_array($hosts)) $hosts = [];
        $entry = ['host' => $host, 'domain' => $domain, 'ip' => $ip];
        if (isset($payload['description'])) $entry['descr'] = $payload['description'];
        $hosts[] = $entry;
        config_set_path('unbound/hosts', $hosts);
        write_config("Panoptikon: added DNS override {$host}.{$domain}");
        services_unbound_configure();
        $id = substr(hash('sha256', $host . $domain . $ip), 0, 16);
        respond(true, ['id' => $id]);

    case 'dns_override_delete':
        $id = isset($payload['id']) ? $payload['id'] : null;
        if (!$id) respond(false, null, 'Missing id parameter');
        $hosts = config_get_path('unbound/hosts');
        if (!is_array($hosts)) respond(false, null, 'No DNS overrides found');
        $found_idx = -1;
        foreach ($hosts as $idx => $h) {
            $host = isset($h['host']) ? $h['host'] : '';
            $domain = isset($h['domain']) ? $h['domain'] : '';
            $ip = isset($h['ip']) ? $h['ip'] : '';
            $check_id = substr(hash('sha256', $host . $domain . $ip), 0, 16);
            if ($check_id === $id) {
                $found_idx = $idx;
                break;
            }
        }
        if ($found_idx < 0) respond(false, null, "DNS override {$id} not found");
        array_splice($hosts, $found_idx, 1);
        config_set_path('unbound/hosts', $hosts);
        write_config("Panoptikon: deleted DNS override {$id}");
        services_unbound_configure();
        respond(true, ['deleted' => $id]);

    case 'config_snapshot':
        $config_xml = @file_get_contents('/cf/conf/config.xml');
        if ($config_xml === false) respond(false, null, 'Cannot read config.xml');
        $hash = sha1($config_xml);
        respond(true, [
            'id' => $hash,
            'timestamp' => date('c'),
            'description' => 'Manual snapshot via Panoptikon',
            'size_bytes' => strlen($config_xml),
            'content' => base64_encode($config_xml),
        ]);

    case 'config_current':
        $config_xml = @file_get_contents('/cf/conf/config.xml');
        if ($config_xml === false) respond(false, null, 'Cannot read config.xml');
        respond(true, [
            'hash' => sha1($config_xml),
            'size_bytes' => strlen($config_xml),
            'timestamp' => date('c'),
        ]);

    case 'config_diff':
        $old_b64 = isset($payload['old']) ? $payload['old'] : null;
        $new_b64 = isset($payload['new']) ? $payload['new'] : null;
        if (!$old_b64) respond(false, null, 'Missing old config');
        $old = base64_decode($old_b64);
        if ($new_b64) {
            $new = base64_decode($new_b64);
        } else {
            $new = @file_get_contents('/cf/conf/config.xml');
        }
        $tmp_old = tempnam('/tmp', 'pf_diff_old_');
        $tmp_new = tempnam('/tmp', 'pf_diff_new_');
        if ($tmp_old === false || $tmp_new === false) {
            respond(false, null, 'Failed to create temp files for diff');
        }
        file_put_contents($tmp_old, $old);
        file_put_contents($tmp_new, $new);
        $diff = shell_exec("diff -u " . escapeshellarg($tmp_old) . " " . escapeshellarg($tmp_new) . " 2>&1");
        unlink($tmp_old);
        unlink($tmp_new);
        // Semantic summary: compare XML sections
        $old_xml = @simplexml_load_string($old);
        $new_xml = @simplexml_load_string($new);
        $changes = [];
        if ($old_xml && $new_xml) {
            $sections = [
                'filter' => 'firewall rules', 'nat' => 'NAT rules',
                'aliases' => 'aliases', 'dhcpd' => 'DHCP config',
                'unbound' => 'DNS resolver', 'interfaces' => 'interfaces',
                'staticroutes' => 'static routes', 'system' => 'system config',
            ];
            foreach ($sections as $key => $label) {
                $o = isset($old_xml->$key) ? $old_xml->$key->asXML() : '';
                $n = isset($new_xml->$key) ? $new_xml->$key->asXML() : '';
                if ($o !== $n) $changes[] = "modified {$label}";
            }
        }
        $summary = empty($changes) ? 'No changes detected' : implode(', ', $changes);
        respond(true, ['summary' => $summary, 'diff' => $diff]);

    case 'config_restore':
        $content_b64 = isset($payload['content']) ? $payload['content'] : null;
        if (!$content_b64) respond(false, null, 'Missing config content');
        $config_xml = base64_decode($content_b64);
        // Validate XML before writing
        $parsed = @simplexml_load_string($config_xml);
        if ($parsed === false) respond(false, null, 'Invalid XML config');
        if ($parsed->getName() !== 'pfsense') respond(false, null, 'Invalid XML config: root element must be <pfsense>');
        // Backup current config first
        $backup_path = '/cf/conf/backup/config-' . date('YmdHis') . '.xml';
        @mkdir('/cf/conf/backup', 0755, true);
        @copy('/cf/conf/config.xml', $backup_path);
        if (file_put_contents('/cf/conf/config.xml', $config_xml) === false) {
            respond(false, null, 'Failed to write config.xml');
        }
        // Reload config
        if (function_exists('config_read')) {
            config_read();
        }
        write_config("Panoptikon: config restored from snapshot");
        filter_configure_sync();
        system_routing_configure();
        services_unbound_configure();
        respond(true, ['restored' => true, 'backup' => $backup_path]);

    case 'arp_table':
        $output = shell_exec('arp -an 2>/dev/null');
        $result = [];
        if ($output) {
            foreach (explode("\n", trim($output)) as $line) {
                if (preg_match('/\(([^)]+)\)\s+at\s+([0-9a-f:]+)\s.*on\s+(\S+)/', $line, $m)) {
                    $result[] = [
                        'ip' => $m[1],
                        'mac' => $m[2],
                        'interface' => $m[3],
                    ];
                }
            }
        }
        respond(true, $result);

    case 'config_list_backups':
        $backup_dir = '/cf/conf/backup/';
        $result = [];
        if (is_dir($backup_dir)) {
            $files = glob($backup_dir . 'config-*.xml');
            rsort($files); // newest first
            foreach (array_slice($files, 0, 20) as $f) {
                $result[] = [
                    'id' => basename($f, '.xml'),
                    'timestamp' => date('c', filemtime($f)),
                    'description' => basename($f),
                    'size_bytes' => filesize($f),
                ];
            }
        }
        respond(true, $result);

    default:
        respond(false, null, "Unknown action: {$action}");
    }
} catch (Exception $e) {
    respond(false, null, $e->getMessage());
}
"#;
