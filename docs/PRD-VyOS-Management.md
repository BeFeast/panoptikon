# Panoptikon — VyOS Management GUI (PRD Addendum)

**Версия:** 0.1.0-draft  
**Дата:** 2026-02-22  
**Статус:** Draft  
**Родительский документ:** [PRD.md](./PRD.md)

---

## Vision

Panoptikon должен стать полноценным web GUI для управления VyOS — не просто viewer, а инструмент, через который homelab-инженер делает 80% повседневных задач: открыть порт, заблокировать IP, добавить WireGuard peer, поднять статический маршрут. SSH остаётся для edge-cases и initial setup.

**Целевое состояние (v1.0):** Открываешь Panoptikon — и можешь управлять firewall, NAT, DNS, WireGuard и маршрутами без единой SSH-сессии.

**Принцип "show, then write":** Сначала реализуем read-only просмотр всего, затем добавляем write-операции с diff-preview и подтверждением. Никаких "тихих" изменений конфига.

---

## Что уже реализовано

| Раздел | Статус | Детали |
|--------|--------|--------|
| VyOS HTTP client | ✅ Готово | `VyosClient` с методами `retrieve`, `show`, `configure_set`, `configure_delete` |
| Interfaces — просмотр | ✅ Готово | Таблица с admin/link state, IP, MAC, MTU, description |
| Interfaces — toggle enable/disable | ✅ Готово | Switch с AlertDialog + config diff preview |
| Routing table — просмотр | ✅ Готово | Парсинг `show ip route`, таблица с protocol badges |
| DHCP leases — просмотр | ✅ Готово | Таблица с IP, MAC, hostname, pool, state |
| DHCP static mappings — CRUD | ✅ Готово | Add/delete с config diff preview |
| Firewall — просмотр | ✅ Готово | Read-only viewer цепочек (chains) и правил |
| Speed Test | ✅ Готово | Ookla speedtest CLI через сервер |
| Config save | ❌ Нет | После любого изменения нет `POST /config-file {"op":"save"}` |
| Firewall CRUD | ❌ Нет | Только просмотр |
| NAT / Port forwarding | ❌ Нет | Не реализовано |
| Static routes — write | ❌ Нет | Только просмотр |
| DNS management | ❌ Нет | Не реализовано |
| WireGuard | ❌ Нет | Не реализовано |
| Audit log | ❌ Нет | Не реализовано |
| Config backup/rollback | ❌ Нет | Не реализовано |
| Address-groups / port-groups | ❌ Нет | Не реализовано |

---

## Feature Milestones

### M1: Firewall Rules Management (P1)

**Почему P1:** Это самая частая причина идти в SSH — заблокировать IP, разрешить порт, добавить правило. Без CRUD firewall GUI бесполезен для security-задач.

#### M1.1: CRUD правил в существующих цепочках

**UI:** В текущем `FirewallChainCard` добавляем кнопки "Add Rule", "Edit Rule", "Delete Rule".

**Порядок полей в диалоге создания правила:**
1. Rule number (автогенерация: max existing + 10)
2. Description (optional)
3. Action: `accept` / `drop` / `reject`
4. Protocol: `tcp` / `udp` / `tcp_udp` / `icmp` / `any`
5. Source: address / address-group / prefix
6. Source port (если tcp/udp): одиночный или диапазон
7. Destination: address / address-group / prefix
8. Destination port (если tcp/udp)
9. State: `new`, `established`, `related`, `invalid` (чекбоксы)
10. Disable rule (toggle)

**VyOS API calls — создание правила:**
```
POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "WAN_IN", "rule", "100", "action"],
  "value": "drop"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "WAN_IN", "rule", "100", "source", "address"],
  "value": "1.2.3.4"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "WAN_IN", "rule", "100", "protocol"],
  "value": "tcp"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "WAN_IN", "rule", "100", "description"],
  "value": "Block bad actor"
}

# После всех set — обязательно сохранить:
POST /config-file
{"op": "save"}
```

**VyOS API calls — удаление правила:**
```
POST /configure
{
  "op": "delete",
  "path": ["firewall", "name", "WAN_IN", "rule", "100"]
}

POST /config-file
{"op": "save"}
```

**VyOS API calls — disable правила (не удаление, а отключение):**
```
POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "WAN_IN", "rule", "100", "disable"]
}
```

**Diff preview** — перед применением показываем список VyOS команд (как уже реализовано в DHCP static mappings):
```
set firewall name WAN_IN rule 100 action drop
set firewall name WAN_IN rule 100 source address 1.2.3.4
set firewall name WAN_IN rule 100 protocol tcp
set firewall name WAN_IN rule 100 description "Block bad actor"
```

#### M1.2: Address-groups и port-groups

Address-group — именованный список IP/подсетей, используется вместо конкретного IP в правилах. Гораздо удобнее чем дублировать правила для каждого IP.

**UI:** Отдельная вкладка "Groups" в Firewall section. Две таблицы: address-groups и port-groups. CRUD.

**VyOS API — создание address-group:**
```
# Создать группу
POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "address-group", "BLOCKED_IPS", "description"],
  "value": "Malicious IPs"
}

# Добавить адрес в группу
POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "address-group", "BLOCKED_IPS", "address"],
  "value": "1.2.3.4"
}

# Добавить подсеть в группу
POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "network-group", "TRUSTED_NETS", "network"],
  "value": "10.10.0.0/24"
}
```

**VyOS API — чтение групп:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["firewall", "group"]
}
```

**VyOS API — создание port-group:**
```
POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "port-group", "COMMON_PORTS", "port"],
  "value": "80"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "port-group", "COMMON_PORTS", "port"],
  "value": "443"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "group", "port-group", "COMMON_PORTS", "port"],
  "value": "8080-8090"  # диапазон
}
```

Когда group существует, в диалоге создания firewall rule в поле Source/Destination появляется выпадающий список существующих групп.

#### M1.3: Новые цепочки и zone policies

**UI:** Кнопка "Add Chain" — создаёт новую firewall chain с именем и default action.

**VyOS API:**
```
POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "LAN_IN", "default-action"],
  "value": "accept"
}

POST /configure
{
  "op": "set",
  "path": ["firewall", "name", "LAN_IN", "description"],
  "value": "LAN inbound traffic"
}
```

**Zone policies** — отдельная вкладка "Zones". Показываем текущие зоны и их политики (zone → interface mapping, zone → firewall chain mapping).

```
# Получить zone config
POST /retrieve
{
  "op": "showConfig",
  "path": ["zone-policy"]
}

# Создать зону
POST /configure
{
  "op": "set",
  "path": ["zone-policy", "zone", "LAN", "interface"],
  "value": "eth1"
}

POST /configure
{
  "op": "set",
  "path": ["zone-policy", "zone", "LAN", "from", "WAN", "firewall", "name"],
  "value": "WAN_IN"
}
```

**MVP zone UI:** только просмотр + assign chain to zone pair. Создание зон — P2.

---

### M2: NAT & Port Forwarding (P1)

**Почему P1:** Port forwarding — ежедневная задача в homelab. Пробросить SSH, веб-сервер, игровой сервер. Сейчас это SSH + `set nat destination rule N ...` вручную.

#### M2.1: DNAT (Destination NAT) — Port Forwarding

**UI:** Вкладка "NAT" → подвкладка "Port Forwarding". Таблица активных DNAT правил + кнопка "Add Port Forward".

**Поля формы Add Port Forward:**
- Описание (обязательное — помогает разобраться через месяц)
- Входящий интерфейс (dropdown из существующих interfaces)
- Внешний порт (или диапазон)
- Протокол: TCP / UDP / TCP+UDP
- Внутренний IP (куда форвардить)
- Внутренний порт (по умолчанию = внешний порт)

**VyOS API calls — создание DNAT правила:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["nat", "destination", "rule"]
}
# → получаем существующие rule numbers, выбираем следующий

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "description"],
  "value": "Port forward — Home Assistant"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "inbound-interface", "name"],
  "value": "eth0"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "destination", "port"],
  "value": "8123"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "translation", "address"],
  "value": "192.168.1.10"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "translation", "port"],
  "value": "8123"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "destination", "rule", "10", "protocol"],
  "value": "tcp"
}

POST /config-file
{"op": "save"}
```

**Чтение существующих DNAT правил:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["nat", "destination"]
}
```

**Удаление DNAT правила:**
```
POST /configure
{
  "op": "delete",
  "path": ["nat", "destination", "rule", "10"]
}

POST /config-file
{"op": "save"}
```

**UI отображение:** Красивая таблица:
```
| # | Описание              | Интерфейс | Внешний порт | → | Внутренний адрес:порт | Протокол | Активно |
|---|-----------------------|-----------|--------------|---|-----------------------|----------|---------|
| 10 | Port forward — HA    | eth0      | 8123         | → | 192.168.1.10:8123     | TCP      | ✓       |
| 20 | Port forward — SSH   | eth0      | 2222         | → | 192.168.1.5:22        | TCP      | ✓       |
```

#### M2.2: SNAT — Source NAT / Masquerade

**UI:** Подвкладка "Source NAT". Таблица SNAT правил. Самый частый случай — masquerade (NAT для выхода в интернет).

**VyOS API — создание masquerade:**
```
POST /configure
{
  "op": "set",
  "path": ["nat", "source", "rule", "100", "outbound-interface", "name"],
  "value": "eth0"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "source", "rule", "100", "translation", "address"],
  "value": "masquerade"
}

POST /configure
{
  "op": "set",
  "path": ["nat", "source", "rule", "100", "source", "address"],
  "value": "192.168.1.0/24"
}
```

**Чтение SNAT:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["nat", "source"]
}
```

#### M2.3: Просмотр активных NAT-сессий

**Read-only.** Показываем текущие conntrack NAT-сессии (полезно для debugging — "куда пошёл этот пакет?").

**VyOS API:**
```
POST /show
{
  "op": "show",
  "path": ["nat", "translations", "detail"]
}
```

Parсим output и показываем таблицу: source IP:port → NAT IP:port → destination. Фильтрация по IP.

---

### M3: Static Routes (P2)

**Почему P2:** Маршруты редко меняются. Viewer уже есть. Write-операции нужны, но не срочно.

#### M3.1: Добавление статических маршрутов

Routing table уже есть (read-only). Добавляем кнопку "Add Static Route".

**Форма:** destination CIDR + next-hop IP + (optional) interface + (optional) distance.

**VyOS API:**
```
POST /configure
{
  "op": "set",
  "path": ["protocols", "static", "route", "10.0.0.0/8", "next-hop", "192.168.1.1"]
}

# С distance (admin distance, для предпочтения маршрутов):
POST /configure
{
  "op": "set",
  "path": ["protocols", "static", "route", "10.0.0.0/8", "next-hop", "192.168.1.1", "distance"],
  "value": "10"
}

# Blackhole (null route):
POST /configure
{
  "op": "set",
  "path": ["protocols", "static", "route", "192.0.2.0/24", "blackhole"]
}

POST /config-file
{"op": "save"}
```

**Удаление:**
```
POST /configure
{
  "op": "delete",
  "path": ["protocols", "static", "route", "10.0.0.0/8"]
}
```

**UI:** В таблице Routes для `protocol: S` (Static) добавляем кнопку Delete. Статические маршруты отличаются от Kernel/Connected — только их можно удалять через UI.

#### M3.2: IPv6 static routes

Аналогично IPv4 но через `ipv6`:
```
POST /configure
{
  "op": "set",
  "path": ["protocols", "static", "route6", "2001:db8::/32", "next-hop", "fe80::1"]
}
```

---

### M4: DNS Management (P2)

**Почему P2:** DNS forwarding — частая задача, но не критичная. Local DNS overrides позволяют обращаться к серверам по имени без внешнего DNS.

#### M4.1: DNS Forwarding Upstreams

**UI:** Вкладка "DNS" → подвкладка "Upstreams". Список серверов пересылки + кнопка "Add".

**Чтение:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["service", "dns", "forwarding"]
}
```

**Добавление global nameserver:**
```
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "nameserver"],
  "value": "8.8.8.8"
}

POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "nameserver"],
  "value": "1.1.1.1"
}
```

**Domain-specific forwarding (conditional forwarding):**
```
# Запросы для example.com → 192.168.1.53
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "domain", "example.com", "server"],
  "value": "192.168.1.53"
}

# Локальный домен ok.labs → внутренний DNS
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "domain", "ok.labs", "server"],
  "value": "10.10.0.10"
}
```

**UI для domain-forwarding:** Таблица domain → server с возможностью добавить/удалить. Ключевой use case: разрешать `*.ok.labs` через внутренний DNS, всё остальное — через 1.1.1.1.

#### M4.2: Local DNS Overrides (Static Hosts)

Задать имя → IP без внешнего DNS. Аналог `/etc/hosts` но через VyOS DNS forwarding.

```
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "alias-name", "nas.ok.labs", "target"],
  "value": "10.10.0.15"
}
```

**Альтернативно через hosts (VyOS 1.4+):**
```
POST /configure
{
  "op": "set",
  "path": ["system", "static-host-mapping", "host-name", "nas.ok.labs", "inet"],
  "value": "10.10.0.15"
}
```

**UI:** Таблица hostname → IP с Add/Delete. Просто как `/etc/hosts` но через GUI.

#### M4.3: DNS Resolver Settings

Базовые настройки DNS forwarder:

```
# Listen интерфейс
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "listen-address"],
  "value": "10.10.0.1"
}

# Cache size (records)
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "cache-size"],
  "value": "10000"
}

# DNSSEC
POST /configure
{
  "op": "set",
  "path": ["service", "dns", "forwarding", "dnssec"],
  "value": "off"
}
```

**UI:** Форма настроек с полями listen-address, cache-size, DNSSEC toggle. Save с confirmation.

**DNS query log** (operational):
```
POST /show
{
  "op": "show",
  "path": ["dns", "forwarding", "statistics"]
}
```

Показываем cache hits/misses, total queries.

---

### M5: WireGuard VPN (P2)

**Почему P2:** WireGuard — killer feature для homelab. Но это сложная фича с генерацией ключей и QR-кодами. Требует осторожной реализации.

#### M5.1: Просмотр WireGuard интерфейсов

**Чтение конфигурации:**
```
POST /retrieve
{
  "op": "showConfig",
  "path": ["interfaces", "wireguard"]
}
```

**Оперативное состояние (кто подключён):**
```
POST /show
{
  "op": "show",
  "path": ["interfaces", "wireguard"]
}
```

**UI:** Карточки для каждого WG-интерфейса: адрес, порт, количество пиров, статус подключения каждого пира (last handshake, transfer).

#### M5.2: Создание WireGuard интерфейса

**Форма:** interface name (wg0, wg1, ...), listen port, address/prefix.

**VyOS API:**
```
POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "address"],
  "value": "10.10.20.1/24"
}

POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "port"],
  "value": "51820"
}

POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "description"],
  "value": "VPN clients"
}
```

**Генерация ключевой пары:** VyOS умеет генерировать ключи:
```
POST /show
{
  "op": "generate",
  "path": ["pki", "wireguard", "key-pair"]
}
# → {"private": "...", "public": "..."}
```

Panoptikon генерирует key pair через VyOS API, показывает public key роутера — его нужно вставить в конфиг клиента. Private key роутера сразу записывается в конфиг и больше не показывается.

```
POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "private-key"],
  "value": "<private_key>"
}
```

#### M5.3: Peer management

**Добавление пира:**

Форма: peer name, public key, allowed-ips, (optional) endpoint, (optional) keepalive.

```
POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "peer", "CLIENT1", "public-key"],
  "value": "abc123..."
}

POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "peer", "CLIENT1", "allowed-ips"],
  "value": "10.10.20.2/32"
}

# Persistent keepalive (для клиентов за NAT):
POST /configure
{
  "op": "set",
  "path": ["interfaces", "wireguard", "wg0", "peer", "CLIENT1", "persistent-keepalive"],
  "value": "25"
}

POST /config-file
{"op": "save"}
```

**Удаление пира:**
```
POST /configure
{
  "op": "delete",
  "path": ["interfaces", "wireguard", "wg0", "peer", "CLIENT1"]
}
```

#### M5.4: Генерация клиентского конфига и QR-кода

**UI:** Кнопка "Generate Client Config" для каждого пира. 

Panoptikon генерирует WireGuard client config:
1. Генерируем client key pair через `POST /show {"op":"generate","path":["pki","wireguard","key-pair"]}`
2. Записываем client public key в конфиг роутера для этого пира
3. Генерируем `.conf` файл для клиента:

```ini
[Interface]
PrivateKey = <client_private_key>
Address = 10.10.20.2/32
DNS = 10.10.0.1

[Peer]
PublicKey = <router_public_key>
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = <router_public_ip>:51820
PersistentKeepalive = 25
```

4. Показываем QR-код через библиотеку `qrcode` (JavaScript, client-side генерация) — сканируется WireGuard mobile app

**Важно:** Private key клиента генерируется и показывается **один раз**. После закрытия диалога — недоступен (не хранится на сервере). Пользователь должен сохранить конфиг или отсканировать QR сразу.

**Определение публичного IP роутера:**
```
POST /show
{
  "op": "show",
  "path": ["interfaces", "ethernet", "eth0"]
}
# → парсим ip-address для WAN интерфейса
```

---

### M6: System & Config Safety (P1 — cross-cutting)

Это не отдельная страница, а набор механизмов безопасности пронизывающих все write-операции.

#### M6.1: Auto-save после каждого изменения

**КРИТИЧЕСКИ ВАЖНО.** VyOS хранит конфиг в памяти. После `POST /configure` изменение применяется, но при перезагрузке — **теряется** если не вызвать `POST /config-file {"op":"save"}`.

**Правило:** Каждый Panoptikon endpoint, который делает `configure_set` или `configure_delete`, ОБЯЗАН вызвать `config_save()` после успешного apply.

**Rust реализация** — добавить в `VyosClient`:
```rust
pub async fn config_save(&self) -> Result<Value> {
    let data = serde_json::json!({ "op": "save" });
    self.post_form("/config-file", &data).await
}
```

**Panoptikon server pattern:**
```rust
async fn apply_and_save(client: &VyosClient, ops: &[ConfigOp]) -> Result<()> {
    for op in ops {
        match op.kind {
            OpKind::Set => client.configure_set(&op.path, op.value.as_deref()).await?,
            OpKind::Delete => client.configure_delete(&op.path).await?,
        };
    }
    client.config_save().await?;
    // Log to audit_log table
    Ok(())
}
```

#### M6.2: Diff Preview перед apply

Каждый write-диалог в UI показывает preview VyOS-команд до их выполнения. Это уже реализовано в DHCP static mappings и interface toggle — нужно применить везде.

**Стандартный компонент `<ConfigDiffPreview>`:**
```tsx
// Показывает список команд которые будут выполнены
<ConfigDiffPreview commands={[
  "set firewall name WAN_IN rule 100 action drop",
  "set firewall name WAN_IN rule 100 source address 1.2.3.4",
  // ...
]} />
```

Команды выводятся в стиле VyOS CLI (`set` — синим, `delete` — красным).

#### M6.3: Config Backup / Download

**UI:** В Settings → Router section, кнопка "Download Config Backup".

**VyOS API:**
```
POST /config-file
{
  "op": "save",
  "file": "/tmp/backup-2026-02-22.conf"
}

POST /show
{
  "op": "show",
  "path": ["configuration"]  // показывает весь running-config в текстовом виде
}
```

Panoptikon получает полный конфиг и отдаёт как `.conf` файл для скачивания. Также можно хранить snapshot в SQLite с timestamp.

**SQLite таблица для backups:**
```sql
CREATE TABLE vyos_config_backups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    label       TEXT,           -- "before firewall rule 100", "manual backup", etc.
    config_text TEXT NOT NULL,  -- full VyOS config dump
    created_by  TEXT DEFAULT 'user'  -- 'user' или 'auto' (перед каждым изменением)
);
```

**Автоматический backup перед изменениями** (опциональная настройка): перед каждым apply сохранять текущий конфиг в `vyos_config_backups` с label "before: <description>".

#### M6.4: Rollback

**VyOS нативный rollback:**
```
POST /show
{
  "op": "show",
  "path": ["system", "commit-archive"]
}
# → список сохранённых конфигов (если настроен commit-archive)
```

**Panoptikon rollback из своих backups:**
```
POST /configure (multiple ops to delete recent changes)
+ POST /config-file {"op": "save"}
```

**UI:** В Settings → Router → Config History. Таблица backups с кнопкой "Restore". Restoration требует двойное подтверждение ("Вы уверены? Это перезапишет текущий конфиг").

**Реализация restore:**
1. Получить backup из SQLite
2. Показать diff: текущий конфиг vs backup (unified diff формат)
3. После подтверждения: через `POST /configure` применить необходимые изменения

*Примечание:* Full restore сложен — нужно вычислить diff между конфигами и применить только изменения. MVP реализация: просто скачать backup файл и показать инструкцию по ручному restore через SSH.

#### M6.5: Audit Log

Все write-операции через Panoptikon должны логироваться.

**SQLite таблица:**
```sql
CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    action      TEXT NOT NULL,   -- "firewall_rule_create", "nat_rule_delete", etc.
    description TEXT NOT NULL,   -- human-readable: "Created firewall rule WAN_IN/100: DROP 1.2.3.4"
    vyos_commands TEXT NOT NULL, -- JSON array of VyOS CLI commands that were executed
    success     INTEGER NOT NULL DEFAULT 1,
    error_msg   TEXT             -- если success=0
);
```

**UI:** Settings → Audit Log. Таблица с пагинацией, фильтрация по action type, поиск. Каждая строка раскрывается с деталями выполненных команд.

---

## API Design (новые Panoptikon endpoints)

| Frontend Action | Panoptikon API | VyOS API | Notes |
|-----------------|---------------|----------|-------|
| Список firewall правил | `GET /api/v1/router/firewall` | `POST /retrieve {"op":"showConfig","path":["firewall"]}` | Уже есть |
| Создать правило | `POST /api/v1/router/firewall/chains/:name/rules` | `POST /configure` (set x N) + `/config-file save` | Body: `{number, action, protocol, source, destination, description}` |
| Обновить правило | `PUT /api/v1/router/firewall/chains/:name/rules/:number` | Delete old + Set new + save | Atomicity: delete all rule paths, re-set |
| Удалить правило | `DELETE /api/v1/router/firewall/chains/:name/rules/:number` | `POST /configure {"op":"delete","path":["firewall","name",N,"rule",R]}` + save | |
| Toggle правило (enable/disable) | `PATCH /api/v1/router/firewall/chains/:name/rules/:number/enabled` | set/delete `disable` + save | Body: `{enabled: bool}` |
| Список address-groups | `GET /api/v1/router/firewall/groups` | `POST /retrieve {"path":["firewall","group"]}` | |
| Создать address-group | `POST /api/v1/router/firewall/groups/address` | set group + members + save | |
| Добавить адрес в group | `POST /api/v1/router/firewall/groups/address/:name/members` | set address + save | |
| Удалить address-group | `DELETE /api/v1/router/firewall/groups/address/:name` | delete group + save | |
| Список DNAT правил | `GET /api/v1/router/nat/destination` | `POST /retrieve {"path":["nat","destination"]}` | |
| Создать DNAT правило | `POST /api/v1/router/nat/destination` | set rule (N ops) + save | Auto-assign rule number |
| Удалить DNAT правило | `DELETE /api/v1/router/nat/destination/:rule` | delete rule + save | |
| Список SNAT правил | `GET /api/v1/router/nat/source` | `POST /retrieve {"path":["nat","source"]}` | |
| Создать SNAT правило | `POST /api/v1/router/nat/source` | set rule + save | |
| NAT сессии | `GET /api/v1/router/nat/sessions` | `POST /show {"path":["nat","translations","detail"]}` | Read-only, operational data |
| Добавить статический маршрут | `POST /api/v1/router/routes/static` | set static route + save | Body: `{destination, next_hop, distance?}` |
| Удалить статический маршрут | `DELETE /api/v1/router/routes/static` | delete static route + save | Body: `{destination, next_hop}` |
| DNS конфиг | `GET /api/v1/router/dns` | `POST /retrieve {"path":["service","dns","forwarding"]}` | |
| Добавить nameserver | `POST /api/v1/router/dns/nameservers` | set nameserver + save | Body: `{address}` |
| Удалить nameserver | `DELETE /api/v1/router/dns/nameservers/:address` | delete nameserver + save | |
| Добавить domain forwarding | `POST /api/v1/router/dns/domains` | set domain + server + save | Body: `{domain, server}` |
| Добавить host override | `POST /api/v1/router/dns/hosts` | set static-host-mapping + save | Body: `{hostname, ip}` |
| Список WG интерфейсов | `GET /api/v1/router/wireguard` | `POST /retrieve {"path":["interfaces","wireguard"]}` | |
| Статус WG интерфейсов | `GET /api/v1/router/wireguard/status` | `POST /show {"path":["interfaces","wireguard"]}` | Operational state |
| Создать WG интерфейс | `POST /api/v1/router/wireguard` | generate keys + set interface + save | Server generates keypair |
| Добавить WG peer | `POST /api/v1/router/wireguard/:iface/peers` | set peer (N ops) + save | Body: `{name, public_key, allowed_ips, keepalive?}` |
| Удалить WG peer | `DELETE /api/v1/router/wireguard/:iface/peers/:name` | delete peer + save | |
| Сгенерировать client config | `POST /api/v1/router/wireguard/:iface/peers/:name/client-config` | generate keypair + set public key в peer + return client .conf | One-time operation |
| Config backup | `GET /api/v1/router/config/backup` | `POST /show {"path":["configuration"]}` | Returns text/plain config |
| Список backups | `GET /api/v1/router/config/backups` | SQLite only | |
| Audit log | `GET /api/v1/router/audit-log` | SQLite only | Query params: limit, offset, action |
| Config save (manual) | `POST /api/v1/router/config/save` | `POST /config-file {"op":"save"}` | |

### Структура тела ответа для write-операций

Все write-эндпоинты возвращают:
```json
{
  "success": true,
  "message": "Firewall rule WAN_IN/100 created",
  "vyos_commands": [
    "set firewall name WAN_IN rule 100 action drop",
    "set firewall name WAN_IN rule 100 source address 1.2.3.4"
  ],
  "saved": true,
  "audit_id": 42
}
```

При ошибке:
```json
{
  "success": false,
  "message": "VyOS API error: invalid path",
  "vyos_error": "...",
  "rolled_back": false
}
```

---

## UI/UX Principles

### 1. Всегда confirmation dialog для write-операций

Любое действие, которое меняет конфиг VyOS, требует явного подтверждения через `AlertDialog` (shadcn/ui). Никаких тихих изменений.

**Исключения:** не нужно подтверждать read-only операции (refresh, download backup).

### 2. Diff Preview для изменений

Каждый диалог создания/изменения должен показывать preview VyOS-команд, которые будут выполнены. Цветовая схема:
- **Синий** (`text-blue-400`) — `set` команды
- **Красный** (`text-rose-400`) — `delete` команды

```tsx
// Стандартный компонент diff preview (уже используется в DHCP static mappings)
<div className="rounded-md border border-slate-800 bg-slate-950 p-3">
  <p className="text-xs font-medium text-slate-500">Config changes:</p>
  {commands.map((cmd, i) => (
    <code key={i} className={`mt-1 block text-xs ${
      cmd.startsWith('delete') ? 'text-rose-400' : 'text-blue-400'
    }`}>
      {cmd}
    </code>
  ))}
</div>
```

### 3. Toast success/error

Все результаты операций — через `toast` (sonner, уже используется). Не модальные алерты, не browser `alert()`.

- Успех: `toast.success("Firewall rule created and saved")`
- Ошибка: `toast.error("VyOS error: " + message)`
- Предупреждение: `toast.warning("Rule created but config save failed — reboot may lose changes")`

### 4. Optimistic UI с rollback при ошибке

Для list view: при нажатии Delete — сразу убираем элемент из UI, параллельно делаем API call. Если API вернул ошибку — добавляем элемент обратно + показываем error toast.

Для создания: показываем skeleton/placeholder сразу, заменяем на реальные данные после ответа API.

### 5. Loading state для всех кнопок

Все кнопки действий при нажатии переходят в `disabled` + spinner state. Никаких двойных кликов.

```tsx
<Button disabled={isSubmitting} onClick={handleCreate}>
  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying…</> : "Create Rule"}
</Button>
```

### 6. "Unsaved changes" в VyOS warning

Если config save упал (VyOS вернул ошибку при `/config-file save`), показываем persistent warning banner:

```tsx
<div className="border border-amber-500/30 bg-amber-500/10 px-4 py-2">
  <AlertTriangle className="inline h-4 w-4 text-amber-400 mr-2" />
  <span className="text-amber-400 text-sm">
    Config changes applied but not saved. VyOS reboot will lose these changes.{" "}
    <button onClick={handleSave} className="underline">Save now</button>
  </span>
</div>
```

### 7. Firewall-специфичное UX

**Rule priority через drag & drop** (P3): правила выполняются по номеру. Показываем номера, даём возможность ввести нужный номер вручную. Drag & drop — хотелось бы, но сложно в MVP.

**Quick block IP:** Кнопка "Block IP" прямо в device card на странице Devices. Открывает упрощённый диалог: выбор chain + IP предзаполнен → одно нажатие создаёт правило `DROP` для этого IP.

**Rule search / filter:** В Firewall таблице — поле поиска по source IP, destination IP, description. Быстро найти "где правило для 1.2.3.4".

---

## Implementation Order

| Milestone | Feature | Effort | Dependencies | Priority |
|-----------|---------|--------|-------------|---------|
| **M6 (частично)** | Config auto-save после каждого изменения | 0.5 дня | Текущий VyOS client | P0 — блокирует всё остальное |
| **M6** | Audit log table + middleware | 1 день | SQLite migration | P1 |
| **M1.1** | Firewall rule DELETE | 0.5 дня | Текущий firewall viewer | P1 |
| **M1.1** | Firewall rule CREATE (basic: action + source IP) | 2 дня | Config save | P1 |
| **M2.1** | NAT DNAT read | 0.5 дня | — | P1 |
| **M2.1** | NAT DNAT create/delete | 2 дня | Config save | P1 |
| **M6** | Config backup download | 1 день | — | P1 |
| **M1.1** | Firewall rule EDIT (полная форма) | 1 день | Rule CREATE | P1 |
| **M1.2** | Address-groups CRUD | 2 дня | — | P2 |
| **M2.2** | NAT SNAT | 1.5 дня | DNAT implementation | P2 |
| **M2.3** | NAT active sessions | 0.5 дня | — | P2 |
| **M3.1** | Static routes write | 1 день | — | P2 |
| **M4.1** | DNS forwarding upstreams | 1.5 дня | — | P2 |
| **M4.2** | DNS local hosts | 1 день | DNS read | P2 |
| **M5.1** | WireGuard read | 0.5 дня | — | P2 |
| **M5.2** | WireGuard interface create | 1.5 дня | WG read | P2 |
| **M5.3** | WireGuard peer management | 1.5 дня | WG create | P2 |
| **M5.4** | WireGuard client config + QR | 1.5 дня | Peer management | P2 |
| **M1.3** | Zone policies | 2 дня | Chain CRUD | P2 |
| **M6** | Config rollback (из backups) | 2 дня | Config backup | P3 |
| **M6** | Auto-backup перед изменениями | 0.5 дня | Config backup | P3 |

**Итого оценка:**
- P1 фичи (M6 core + M1.1 + M2.1): ~7–8 дней
- P2 фичи (всё остальное): ~15–17 дней
- P3 (rollback, auto-backup): ~3 дня

**Рекомендуемый первый спринт (неделя):**
1. Config auto-save (0.5 дня) — prerequisite для всего
2. Audit log (1 день)
3. Firewall rule DELETE (0.5 дня) — легко, сразу видна польза
4. Firewall rule CREATE basic (2 дня)
5. NAT DNAT read + create (3 дня)

---

## Open Questions

| # | Вопрос | Контекст | Решение |
|---|--------|---------|---------|
| Q1 | **Транзакционность multi-set операций** | VyOS применяет каждый `POST /configure` независимо. Если при создании правила (5 set вызовов) упадёт 3-й — первые 2 уже применены. Частично созданное правило. | Вариант A: откат (delete partial) при ошибке. Вариант B: VyOS 1.4+ поддерживает batch configure — несколько операций в одном запросе (нужно проверить). Реализовать cleanup в error handler. |
| Q2 | **Версии VyOS** | API немного отличается между VyOS 1.3 (LTS) и 1.4 (sagitta). Особенно firewall — в 1.4 nftables вместо iptables, другие пути конфига. | Определять версию при подключении (`show version`) и использовать соответствующие пути. Минимум поддержки: VyOS 1.3+. |
| Q3 | **WireGuard private key хранение** | При создании WG интерфейса Panoptikon должен записать private key в VyOS конфиг. Нужно ли его где-то хранить в Panoptikon? | Нет. Private key роутера никогда не хранится в Panoptikon DB. Записывается в VyOS конфиг через API и всё. Client private keys при генерации — показываются единожды, не хранятся. |
| Q4 | **Firewall rule реорганизация** | Правила выполняются по номеру. Если добавить правило 100, потом хочется вставить правило между 90 и 100 — нужен номер 95. Но если правил уже 90, 95, 100 — некуда вставить 92. | Реализовать "renumber" операцию: пересчитать все номера с шагом 10 (90→100, 95→110, 100→120). Показывать пользователю, что будет renumber. |
| Q5 | **Concurrent modifications** | Если два пользователя (маловероятно в single-user, но возможно: два браузера) одновременно меняют конфиг? | Single-user продукт — игнорируем. Можно добавить advisory lock в SQLite при необходимости. |
| Q6 | **VyOS config-file save failure** | Что если save упал (VyOS перегружен, timeout)? Изменение применено но не сохранено. | Retry с exponential backoff (3 попытки). Если всё равно failed — показываем persistent warning в UI. Не откатывать изменение (уже применено). |
| Q7 | **Firewall в VyOS 1.4 (nftables)** | В VyOS 1.4 firewall конфиг организован иначе: `firewall ipv4 input filter rule N` вместо `firewall name CHAIN rule N`. Нужна абстракция. | Реализовать версия-специфичные пути в VyOS client. Feature flag `vyos_version` в settings. |
| Q8 | **Большие конфиги** | У пользователей с большим количеством правил (100+ firewall rules, 50+ NAT rules) — pagination в UI? | Виртуализация таблиц через `@tanstack/react-virtual` если > 100 строк. В большинстве homelab случаев правил < 30. |

---

## Appendix A: VyOS Config Paths Reference

```bash
# ── Firewall ─────────────────────────────────────────────
firewall name <CHAIN> default-action <action>
firewall name <CHAIN> rule <N> action <accept|drop|reject>
firewall name <CHAIN> rule <N> source address <ip|cidr>
firewall name <CHAIN> rule <N> source group address-group <name>
firewall name <CHAIN> rule <N> source group port-group <name>
firewall name <CHAIN> rule <N> destination address <ip|cidr>
firewall name <CHAIN> rule <N> destination port <port|range>
firewall name <CHAIN> rule <N> protocol <tcp|udp|tcp_udp|icmp>
firewall name <CHAIN> rule <N> state <new|established|related|invalid>
firewall name <CHAIN> rule <N> description <text>
firewall name <CHAIN> rule <N> disable
firewall group address-group <name> address <ip>
firewall group address-group <name> description <text>
firewall group network-group <name> network <cidr>
firewall group port-group <name> port <port|range>

# ── NAT ──────────────────────────────────────────────────
nat destination rule <N> description <text>
nat destination rule <N> inbound-interface name <iface>
nat destination rule <N> destination port <port>
nat destination rule <N> translation address <ip>
nat destination rule <N> translation port <port>
nat destination rule <N> protocol <tcp|udp>
nat source rule <N> outbound-interface name <iface>
nat source rule <N> source address <cidr>
nat source rule <N> translation address masquerade
nat source rule <N> translation address <ip>

# ── Static Routes ─────────────────────────────────────────
protocols static route <cidr> next-hop <ip>
protocols static route <cidr> next-hop <ip> distance <n>
protocols static route <cidr> blackhole
protocols static route6 <cidr> next-hop <ip>

# ── DNS ──────────────────────────────────────────────────
service dns forwarding nameserver <ip>
service dns forwarding domain <domain> server <ip>
service dns forwarding listen-address <ip>
service dns forwarding cache-size <n>
service dns forwarding dnssec <off|process|log-fail|strict>
system static-host-mapping host-name <fqdn> inet <ip>

# ── WireGuard ────────────────────────────────────────────
interfaces wireguard <wg0> address <cidr>
interfaces wireguard <wg0> port <n>
interfaces wireguard <wg0> private-key <key>
interfaces wireguard <wg0> description <text>
interfaces wireguard <wg0> peer <name> public-key <key>
interfaces wireguard <wg0> peer <name> allowed-ips <cidr>
interfaces wireguard <wg0> peer <name> endpoint <ip:port>
interfaces wireguard <wg0> peer <name> persistent-keepalive <n>
```

---

*Документ обновляется по мере разработки. Нерешённые вопросы закрываются решениями в момент начала реализации соответствующего milestone.*
