# Network Topology Analysis - Computer "Sensai"

**Date**: December 1, 2025  
**Computer**: Sensai  
**Analysis Type**: Network Traffic Routing from Modem to Computer  

---

## Network Architecture Summary

```
[Internet] 
    ↓
[ATT ISP Network: 99.58.96.1]
    ↓
[ATT Modem/Router: 192.168.23.254 (f8:2d:c0:5b:81:10)]
    ↓ (Wi-Fi 802.11ac)
[Intel Wireless-AC 9560 160MHz: 192.168.23.83 (18:1d:ea:a0:59:dd)]
    ↓
[Computer "Sensai" - Windows]
```

---

## Active Network Interface

### Primary Connection: Wi-Fi (Interface #7)

**Adapter**: Intel(R) Wireless-AC 9560 160MHz  
**Physical Address (MAC)**: `18:1D:EA:A0:59:DD`  
**Status**: Connected (Media Active)  

**IPv4 Configuration**:
- **IP Address**: `192.168.23.83`
- **Subnet Mask**: `255.255.255.0` (255 hosts on network)
- **Default Gateway**: `192.168.23.254` (ATT modem/router)
- **DHCP**: Disabled (Static IP assignment)

**IPv6 Configuration**:
- **Primary Address**: `2600:1700:90e0:7b60::35`
- **Secondary Address**: `2600:1700:90e0:7b60:e06d:96c2:fd5c:631`
- **Temporary Address**: `2600:1700:90e0:7b60:3022:f068:952e:475b`
- **Link-Local**: `fe80::1ae8:e9d7:f26f:a74b%7`
- **Default Gateway (IPv6)**: `fe80::fa2d:c0ff:fe5b:8110%7`

**DNS Servers**:
- **Primary (IPv6)**: `2600:1700:90e0:7b60::1`
- **Secondary**: `68.94.156.11` (ATT DNS)
- **Tertiary**: `68.94.157.11` (ATT DNS)

**DNS Suffix**: `attlocal.net`

---

## Gateway/Modem Details

**Device**: ATT Residential Gateway (Modem/Router combo)  
**IPv4 Address**: `192.168.23.254`  
**MAC Address**: `f8:2d:c0:5b:81:10`  
**Manufacturer**: Likely Arris or Motorola (MAC prefix f8:2d:c0 = Arris)  
**Role**: DHCP server, DNS forwarder, NAT gateway, Wi-Fi access point

---

## Traffic Flow Analysis

### Outbound Traffic Path

1. **Application Layer** (e.g., PostgreSQL client, Discord bot, HTTP requests)
   - Application sends data to socket
   - Windows networking stack processes packet

2. **Transport Layer** (TCP/UDP)
   - Port assignment (e.g., TCP 5432 for PostgreSQL)
   - Segment creation with source/destination ports

3. **Network Layer** (IPv4/IPv6)
   - IP packet creation
   - Source IP: `192.168.23.83`
   - Destination IP: External (e.g., Render PostgreSQL server)
   - Routing decision: Check routing table

4. **Routing Table Lookup**
   ```
   Network Destination    Netmask          Gateway         Interface       Metric
   0.0.0.0               0.0.0.0          192.168.23.254  192.168.23.83   35
   ```
   - **Match**: Default route `0.0.0.0/0` → Send to gateway `192.168.23.254`
   - **Metric**: 35 (lowest metric wins if multiple routes exist)

5. **ARP Resolution** (if needed)
   - Lookup MAC address for `192.168.23.254` in ARP cache
   - **Cached Entry**: `192.168.23.254 → f8:2d:c0:5b:81:10` (dynamic)
   - If not cached: Send ARP request "Who has 192.168.23.254?"

6. **Data Link Layer** (Ethernet frame)
   - Frame creation:
     - Source MAC: `18:1d:ea:a0:59:dd` (this computer)
     - Destination MAC: `f8:2d:c0:5b:81:10` (modem/router)
   - Frame type: 0x0800 (IPv4) or 0x86DD (IPv6)

7. **Physical Layer** (Wi-Fi transmission)
   - **Technology**: 802.11ac (5 GHz band, up to 160 MHz channels)
   - **Adapter**: Intel Wireless-AC 9560
   - Frame transmitted over Wi-Fi to modem/router
   - SSID: (hidden in output, but on `attlocal.net` domain)

8. **Modem/Router Processing** (`192.168.23.254`)
   - Receive frame from Wi-Fi interface
   - NAT (Network Address Translation):
     - Replace source IP `192.168.23.83` → Public IP (e.g., `99.58.96.x`)
     - Track connection in NAT table (for return traffic)
   - Forward packet to WAN interface (DSL/Fiber)

9. **ISP Network** (ATT)
   - First hop: `99.58.96.1` (ISP gateway, ~3-5ms latency)
   - Second hop: `99.167.37.204` (ISP backbone, ~23-44ms)
   - Third hop: `12.242.116.28` (ATT regional router, ~24-25ms)
   - Subsequent hops: Route to destination network

10. **Destination Server** (e.g., Render PostgreSQL)
    - Packet arrives at destination
    - Application processes request

### Inbound Traffic Path (Return Path)

1. **Server Response**
   - Server sends response packet to public IP

2. **ISP Network** (Reverse path through ATT)
   - Packet routed back through ATT network to customer gateway

3. **Modem/Router** (`192.168.23.254`)
   - Receive packet on WAN interface
   - NAT table lookup: Find original internal connection
     - Destination public IP + port → `192.168.23.83` + original port
   - Replace destination IP in packet
   - ARP lookup for `192.168.23.83` (this computer)

4. **Wi-Fi Transmission**
   - Modem/router transmits frame over Wi-Fi
   - Destination MAC: `18:1d:ea:a0:59:dd` (this computer)

5. **Computer "Sensai"**
   - Intel Wireless-AC 9560 adapter receives frame
   - Verify destination MAC matches interface
   - Pass frame to Windows networking stack

6. **Windows Networking Stack**
   - Data Link Layer: Strip Ethernet frame header
   - Network Layer: Process IP packet, verify destination IP
   - Transport Layer: Verify TCP/UDP checksum, deliver to socket
   - Application Layer: Application receives data

---

## Routing Table Analysis

### IPv4 Routing

**Default Route** (Most Important):
```
Network Destination    Netmask          Gateway         Interface       Metric
0.0.0.0               0.0.0.0          192.168.23.254  192.168.23.83   35
```
- **Meaning**: All non-local traffic → Forward to `192.168.23.254` (modem/router)
- **Metric 35**: Relatively low priority (lower = better)

**Local Network Route**:
```
192.168.23.0          255.255.255.0    On-link         192.168.23.83   291
```
- **Meaning**: Traffic to `192.168.23.0/24` → Direct delivery (no gateway)
- **Use Case**: Communication with other devices on local network (e.g., printers, NAS)

**WSL Hyper-V Route**:
```
172.18.160.0          255.255.240.0    On-link         172.18.160.1    5256
```
- **Meaning**: WSL2 virtual network (if using Windows Subsystem for Linux)
- **Metric 5256**: Very low priority (only used for WSL traffic)

### IPv6 Routing

**Default Route**:
```
If  Metric  Network Destination      Gateway
7   291     ::/0                     fe80::fa2d:c0ff:fe5b:8110
```
- **Meaning**: All non-local IPv6 traffic → Forward to `fe80::fa2d:c0ff:fe5b:8110` (modem/router link-local)
- **Interface 7**: Wi-Fi adapter

**ISP Prefix Route**:
```
7   51      2600:1700:90e0:7b60::/60 fe80::fa2d:c0ff:fe5b:8110
```
- **Meaning**: ATT IPv6 prefix (optimized route through modem)
- **Metric 51**: Higher priority than default route for this prefix

---

## Network Performance Characteristics

### Latency Analysis (via traceroute to 8.8.8.8)

| Hop | IP Address      | Role                    | Latency (Avg) | Notes                          |
|-----|-----------------|-------------------------|---------------|--------------------------------|
| 1   | 192.168.23.254  | Local modem/router      | ~4 ms         | Wi-Fi + processing overhead    |
| 2   | 99.58.96.1      | ISP gateway             | ~55 ms        | First ATT network hop          |
| 3   | 99.167.37.204   | ISP backbone            | ~33 ms        | Regional ATT router            |
| 4   | 12.242.116.28   | ISP regional            | ~24 ms        | ATT core network               |
| 5   | 12.255.10.142   | ISP backbone (exit)     | ~31 ms        | Near edge of ATT network       |

**Observations**:
- Local network latency: ~4 ms (Wi-Fi overhead)
- ISP network latency: ~51 ms (Hop 2 - Hop 1)
- Total latency to internet: ~55-111 ms (varies with network congestion)

### Bandwidth Characteristics

**Wi-Fi Specifications** (Intel Wireless-AC 9560 160MHz):
- **Standard**: 802.11ac Wave 2
- **Maximum Theoretical Speed**: 1.73 Gbps (160 MHz channels, 2x2 MIMO)
- **Typical Real-World Speed**: 400-800 Mbps (depending on signal strength, interference)
- **Frequency Bands**: 2.4 GHz + 5 GHz (dual-band)

**Modem/Router Bottleneck**:
- ATT residential gateway typically supports 100 Mbps - 1 Gbps WAN speed
- Actual throughput depends on ATT service tier

---

## Security Considerations

### NAT Protection

**Benefit**: Modem/router performs Network Address Translation
- Internal IP `192.168.23.83` not directly exposed to internet
- Inbound connections blocked unless explicitly forwarded (port forwarding rules)
- Provides basic firewall protection

**NAT Table Example** (conceptual):
```
Internal IP:Port       → Public IP:Port       → Remote IP:Port
192.168.23.83:54321    → 99.58.96.x:54321    → 35.90.247.165:5432 (Render PostgreSQL)
```

### DNS Privacy

**Current Configuration**: Using ATT DNS servers (`68.94.156.11`, `68.94.157.11`)
- **Risk**: ISP can log DNS queries (websites visited)
- **Alternative**: Consider using encrypted DNS (DNS-over-HTTPS) or third-party DNS (1.1.1.1, 8.8.8.8)

### Wi-Fi Security

**Encryption**: (Not shown in ipconfig, but typical for attlocal.net networks)
- Likely WPA2-PSK or WPA3-PSK encryption
- Protects traffic between computer and modem/router
- **Note**: Does not protect traffic beyond modem (use HTTPS/TLS for end-to-end encryption)

---

## Other Network Interfaces (Inactive)

### Ethernet Adapter

**Adapter**: Intel(R) Ethernet Connection (7) I219-LM  
**MAC**: `e4:b9:7a:4d:9e:86`  
**Status**: Media disconnected (cable not connected)  
**Speed**: 1 Gbps capable

### WSL Hyper-V Virtual Adapter

**Adapter**: Hyper-V Virtual Ethernet Adapter  
**IP**: `172.18.160.1/20`  
**Role**: Bridge for WSL2 virtual machines  
**Status**: Active (for WSL use)

### Bluetooth PAN

**Adapter**: Bluetooth Device (Personal Area Network)  
**MAC**: `18:1d:ea:a0:59:e1`  
**Status**: Media disconnected (no Bluetooth network devices paired)

---

## Traffic Routing for Render PostgreSQL (Production Use Case)

### Example: Connecting to `RENDER_DB_EXTERNAL_URL`

1. **DNS Resolution**:
   - Application queries DNS for `oregon-postgres.render.com` (example)
   - DNS request sent to `2600:1700:90e0:7b60::1` (ATT DNS via modem)
   - DNS response returns IP: `35.90.247.165` (example Render server)

2. **Routing Decision**:
   - Destination `35.90.247.165` does not match local network `192.168.23.0/24`
   - Match default route `0.0.0.0/0` → Gateway `192.168.23.254`

3. **TCP Connection Establishment**:
   - TCP SYN packet created (source port: random, destination port: 5432)
   - Packet forwarded to modem via Wi-Fi

4. **NAT Translation**:
   - Modem replaces source IP `192.168.23.83` → Public IP `99.58.96.x`
   - Packet forwarded through ATT network to Render datacenter

5. **PostgreSQL Connection**:
   - Render server receives connection on port 5432
   - TLS handshake (encrypted PostgreSQL connection)
   - Application sends queries, receives results

---

## Network Topology Diagram (ASCII)

```
                         Internet Cloud
                               │
                               │
                    ┌──────────▼──────────┐
                    │   ATT ISP Network   │
                    │   99.58.96.1 (GW)   │
                    └──────────┬──────────┘
                               │ (DSL/Fiber WAN)
                               │
                    ┌──────────▼──────────────────┐
                    │  ATT Modem/Router (Gateway) │
                    │  192.168.23.254             │
                    │  f8:2d:c0:5b:81:10          │
                    │  -------------------------  │
                    │  NAT, DHCP, DNS, Firewall   │
                    └──────────┬──────────────────┘
                               │ (802.11ac Wi-Fi, 5 GHz)
                               │ SSID: attlocal.net
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                │              │              │
     ┌──────────▼──────┐  ┌───▼────────┐  ┌──▼─────────┐
     │ Computer "Sensai"│  │ Other      │  │ IoT        │
     │ 192.168.23.83    │  │ Devices    │  │ Devices    │
     │ 18:1d:ea:a0:59:dd│  │ (Unknown)  │  │ (Unknown)  │
     └──────────────────┘  └────────────┘  └────────────┘
            │
            │ (Internal Virtual Network)
            │
     ┌──────▼───────────┐
     │ WSL2 Hyper-V     │
     │ 172.18.160.1     │
     │ (Linux VMs)      │
     └──────────────────┘
```

---

## Key Findings Summary

1. **Active Connection**: Wi-Fi via Intel Wireless-AC 9560 160MHz adapter
2. **Local IP**: `192.168.23.83` (static assignment, DHCP disabled)
3. **Gateway**: `192.168.23.254` (ATT modem/router, MAC: f8:2d:c0:5b:81:10)
4. **Traffic Flow**: Computer → Wi-Fi (802.11ac) → Modem/Router → NAT → ATT Network → Internet
5. **Latency**: ~4 ms local, ~55-111 ms to internet (via ATT network)
6. **IPv6**: Fully supported (dual-stack configuration)
7. **DNS**: ATT DNS servers (68.94.156.11, 68.94.157.11)
8. **Security**: NAT provides basic firewall protection

---

## Recommendations

### Performance Optimization
1. **Ethernet**: Consider using wired Ethernet for lower latency (~1-2 ms vs 4 ms Wi-Fi)
2. **DNS**: Switch to Cloudflare (1.1.1.1) or Google (8.8.8.8) DNS for faster resolution
3. **QoS**: Configure router QoS to prioritize development traffic (PostgreSQL, SSH, Git)

### Security Hardening
1. **Encrypted DNS**: Enable DNS-over-HTTPS in browser/OS
2. **VPN**: Consider VPN for sensitive development work
3. **Firewall**: Verify Windows Firewall is enabled (defense in depth)

---

**DevOps Specialist**: Network topology analysis complete. All traffic from this computer flows through Wi-Fi adapter → ATT modem/router → NAT → ATT ISP network → Internet. Ready to proceed with POC deployment tasks.
