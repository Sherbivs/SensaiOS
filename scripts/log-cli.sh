#!/usr/bin/env bash

# ============================================================================
# Intelligent Logging System - SSH CLI Tools
# ============================================================================
#
# Comprehensive command-line tools for querying, filtering, and analyzing
# logs via SSH. Designed for AI consumption and human debugging.
#
# Commands:
#   log-query     - Search and filter logs
#   log-report    - Generate AI-optimized summaries
#   log-pattern   - Detect anomalies and trends
#   log-context   - Reconstruct session context
#
# Usage: Run without arguments for help
# Example: ./log-cli.sh query --level error --since "1h ago"
#
# ============================================================================

set -euo pipefail

# Configuration
STORE_DIR="${STORE_DIR:-/Store/logs}"
CURRENT_LOG="${STORE_DIR}/current.jsonl"
HOURLY_DIR="${STORE_DIR}/hourly"
DAILY_DIR="${STORE_DIR}/daily"
INDEX_DB="${STORE_DIR}/index.db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Utility Functions
# ============================================================================

print_header() {
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1" >&2
}

print_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# Parse relative time expressions (e.g., "1h ago", "30m ago", "7d ago")
parse_time() {
  local time_expr="$1"
  
  if [[ "$time_expr" == "now" ]]; then
    date -u +"%Y-%m-%dT%H:%M:%S"
    return
  fi
  
  # Match pattern: "Nd ago", "Nh ago", "Nm ago"
  if [[ "$time_expr" =~ ^([0-9]+)([dhms])\ ago$ ]]; then
    local num="${BASH_REMATCH[1]}"
    local unit="${BASH_REMATCH[2]}"
    
    case "$unit" in
      d) date -u -d "-${num} days" +"%Y-%m-%dT%H:%M:%S" ;;
      h) date -u -d "-${num} hours" +"%Y-%m-%dT%H:%M:%S" ;;
      m) date -u -d "-${num} minutes" +"%Y-%m-%dT%H:%M:%S" ;;
      s) date -u -d "-${num} seconds" +"%Y-%m-%dT%H:%M:%S" ;;
      *) echo "Invalid time unit: $unit" >&2; return 1 ;;
    esac
  else
    # Try to parse as ISO 8601
    date -u -d "$time_expr" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || {
      echo "Invalid time expression: $time_expr" >&2
      return 1
    }
  fi
}

# Find all relevant log files in time range
find_log_files() {
  local since="${1:-}"
  local until="${2:-}"
  
  local files=()
  
  # Always include current log
  if [[ -f "$CURRENT_LOG" ]]; then
    files+=("$CURRENT_LOG")
  fi
  
  # Include hourly logs (last 24 hours)
  if [[ -d "$HOURLY_DIR" ]]; then
    while IFS= read -r -d '' file; do
      files+=("$file")
    done < <(find "$HOURLY_DIR" -name "*.jsonl.gz" -print0 | sort -rz)
  fi
  
  # Include daily logs (last 30 days) if time range requires it
  if [[ -d "$DAILY_DIR" ]]; then
    while IFS= read -r -d '' file; do
      files+=("$file")
    done < <(find "$DAILY_DIR" -name "*.jsonl.gz" -print0 | sort -rz)
  fi
  
  printf '%s\n' "${files[@]}"
}

# Read logs from file (handles .gz compression)
read_logs() {
  local file="$1"
  
  if [[ "$file" == *.gz ]]; then
    zcat "$file"
  else
    cat "$file"
  fi
}

# ============================================================================
# Command: log-query
# ============================================================================

cmd_query() {
  local level=""
  local category=""
  local since=""
  local until=""
  local limit=""
  local pattern=""
  local filter=""
  local user_id=""
  local guild_id=""
  local fingerprint=""
  local output="text"
  local search_text=""
  
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --level)
        level="$2"
        shift 2
        ;;
      --category)
        category="$2"
        shift 2
        ;;
      --since)
        since=$(parse_time "$2")
        shift 2
        ;;
      --until)
        until=$(parse_time "$2")
        shift 2
        ;;
      --limit)
        limit="$2"
        shift 2
        ;;
      --pattern)
        pattern="$2"
        shift 2
        ;;
      --filter)
        filter="$2"
        shift 2
        ;;
      --user-id)
        user_id="$2"
        shift 2
        ;;
      --guild-id)
        guild_id="$2"
        shift 2
        ;;
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      --output)
        output="$2"
        shift 2
        ;;
      *)
        search_text="$1"
        shift
        ;;
    esac
  done
  
  print_header "📊 LOG QUERY"
  
  # Build jq filter
  local jq_filter="."
  
  # Level filter
  if [[ -n "$level" ]]; then
    local level_filter="("
    IFS=',' read -ra levels <<< "$level"
    for i in "${!levels[@]}"; do
      if [[ $i -gt 0 ]]; then level_filter+=") or ("; fi
      level_filter+=".level == \"${levels[$i]}\""
    done
    level_filter+=")"
    jq_filter="$jq_filter | select($level_filter)"
  fi
  
  # Category filter
  if [[ -n "$category" ]]; then
    local cat_filter="("
    IFS=',' read -ra categories <<< "$category"
    for i in "${!categories[@]}"; do
      if [[ $i -gt 0 ]]; then cat_filter+=") or ("; fi
      cat_filter+=".category == \"${categories[$i]}\""
    done
    cat_filter+=")"
    jq_filter="$jq_filter | select($cat_filter)"
  fi
  
  # Time range filter
  if [[ -n "$since" ]]; then
    jq_filter="$jq_filter | select(.timestamp >= \"$since\")"
  fi
  
  if [[ -n "$until" ]]; then
    jq_filter="$jq_filter | select(.timestamp <= \"$until\")"
  fi
  
  # User filter
  if [[ -n "$user_id" ]]; then
    jq_filter="$jq_filter | select(.context.user.id == \"$user_id\")"
  fi
  
  # Guild filter
  if [[ -n "$guild_id" ]]; then
    jq_filter="$jq_filter | select(.context.guild.id == \"$guild_id\")"
  fi
  
  # Fingerprint filter
  if [[ -n "$fingerprint" ]]; then
    jq_filter="$jq_filter | select(.context.error.fingerprint == \"$fingerprint\")"
  fi
  
  # Pattern filter (regex on message)
  if [[ -n "$pattern" ]]; then
    jq_filter="$jq_filter | select(.message | test(\"$pattern\"; \"i\"))"
  fi
  
  # Custom filter (raw jq expression)
  if [[ -n "$filter" ]]; then
    jq_filter="$jq_filter | select($filter)"
  fi
  
  # Text search
  if [[ -n "$search_text" ]]; then
    jq_filter="$jq_filter | select(.message | test(\"$search_text\"; \"i\"))"
  fi
  
  # Find log files
  local files
  mapfile -t files < <(find_log_files "$since" "$until")
  
  print_info "Searching ${#files[@]} log files..."
  
  # Process logs
  local count=0
  local results=()
  
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      if [[ -n "$line" ]]; then
        results+=("$line")
        ((count++))
        
        # Apply limit
        if [[ -n "$limit" ]] && [[ $count -ge $limit ]]; then
          break 2
        fi
      fi
    done < <(read_logs "$file" | jq -c "$jq_filter")
  done
  
  # Output results
  echo ""
  print_success "Found $count log entries"
  echo ""
  
  if [[ "$output" == "json" ]]; then
    # JSON output (for AI consumption)
    printf '%s\n' "${results[@]}" | jq -s '.'
  else
    # Human-readable text output
    for result in "${results[@]}"; do
      local timestamp=$(echo "$result" | jq -r '.timestamp')
      local level=$(echo "$result" | jq -r '.level')
      local category=$(echo "$result" | jq -r '.category')
      local message=$(echo "$result" | jq -r '.message')
      local entry_id=$(echo "$result" | jq -r '.id')
      
      # Color-code by level
      local level_color="$NC"
      case "$level" in
        fatal) level_color="$RED" ;;
        error) level_color="$RED" ;;
        warn)  level_color="$YELLOW" ;;
        info)  level_color="$GREEN" ;;
        debug) level_color="$BLUE" ;;
        trace) level_color="$MAGENTA" ;;
      esac
      
      echo -e "${level_color}[$timestamp]${NC} ${level_color}${level^^}${NC} [$category] $message"
      
      # Show error details if present
      local error_name=$(echo "$result" | jq -r '.context.error.name // empty')
      if [[ -n "$error_name" ]]; then
        local error_msg=$(echo "$result" | jq -r '.context.error.message // empty')
        echo -e "  ${RED}├─${NC} ${RED}$error_name${NC}: $error_msg"
        
        local fingerprint=$(echo "$result" | jq -r '.context.error.fingerprint // empty')
        if [[ -n "$fingerprint" ]]; then
          echo -e "  ${RED}└─${NC} Fingerprint: ${fingerprint:0:16}..."
        fi
      fi
      
      # Show operation details if present
      local op_name=$(echo "$result" | jq -r '.context.operation.name // empty')
      if [[ -n "$op_name" ]]; then
        local duration=$(echo "$result" | jq -r '.context.operation.duration // empty')
        local success=$(echo "$result" | jq -r '.context.operation.success // empty')
        
        if [[ -n "$duration" ]]; then
          echo -e "  ${BLUE}└─${NC} Operation: $op_name (${duration}ms, success=$success)"
        fi
      fi
      
      echo -e "  ${CYAN}ID:${NC} $entry_id"
      echo ""
    done
  fi
}

# ============================================================================
# Command: log-report
# ============================================================================

cmd_report() {
  local report_type="${1:-session}"
  shift || true
  
  case "$report_type" in
    session)
      report_session "$@"
      ;;
    errors)
      report_errors "$@"
      ;;
    performance)
      report_performance "$@"
      ;;
    continuity)
      report_continuity "$@"
      ;;
    *)
      echo "Unknown report type: $report_type"
      echo "Available types: session, errors, performance, continuity"
      return 1
      ;;
  esac
}

report_session() {
  local since="1d ago"
  local output="text"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since="$2"; shift 2 ;;
      --output) output="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  since=$(parse_time "$since")
  
  print_header "📈 SESSION SUMMARY (since $since)"
  
  # Find all logs in time range
  local files
  mapfile -t files < <(find_log_files "$since")
  
  # Collect statistics
  local total_logs=0
  local by_level=()
  local by_category=()
  local anomaly_count=0
  local actionable_count=0
  local total_duration=0
  local duration_count=0
  
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      if [[ -z "$line" ]]; then continue; fi
      
      ((total_logs++))
      
      local level=$(echo "$line" | jq -r '.level')
      local category=$(echo "$line" | jq -r '.category')
      local anomaly=$(echo "$line" | jq -r '.ai.anomaly')
      local actionable=$(echo "$line" | jq -r '.ai.actionable')
      local duration=$(echo "$line" | jq -r '.context.operation.duration // 0')
      
      # Count by level
      by_level[$level]=$((${by_level[$level]:-0} + 1))
      
      # Count by category
      by_category[$category]=$((${by_category[$category]:-0} + 1))
      
      # Count anomalies
      if [[ "$anomaly" == "true" ]]; then
        ((anomaly_count++))
      fi
      
      # Count actionable items
      if [[ "$actionable" == "true" ]]; then
        ((actionable_count++))
      fi
      
      # Sum durations
      if [[ "$duration" != "0" ]]; then
        total_duration=$((total_duration + duration))
        ((duration_count++))
      fi
    done < <(read_logs "$file" | jq -c "select(.timestamp >= \"$since\")")
  done
  
  echo ""
  print_success "Total logs: $total_logs"
  
  # Errors breakdown
  echo ""
  echo -e "${YELLOW}Errors:${NC}"
  local error_count=$((${by_level[error]:-0} + ${by_level[fatal]:-0}))
  local error_percent=$(awk "BEGIN {printf \"%.2f\", ($error_count / $total_logs) * 100}")
  echo "  Errors: $error_count ($error_percent%)"
  
  # Top categories
  echo ""
  echo -e "${BLUE}Top Categories:${NC}"
  for category in "${!by_category[@]}"; do
    local count="${by_category[$category]}"
    local percent=$(awk "BEGIN {printf \"%.0f\", ($count / $total_logs) * 100}")
    echo "  $category: $count ($percent%)"
  done | sort -t: -k2 -nr | head -5
  
  # Anomalies
  echo ""
  echo -e "${MAGENTA}Anomalies detected:${NC} $anomaly_count"
  
  # Actionable items
  echo -e "${RED}Actionable items:${NC} $actionable_count"
  
  # Performance
  if [[ $duration_count -gt 0 ]]; then
    local avg_duration=$((total_duration / duration_count))
    echo ""
    echo -e "${GREEN}Performance:${NC}"
    echo "  Avg operation duration: ${avg_duration}ms"
  fi
}

report_errors() {
  local since="7d ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  since=$(parse_time "$since")
  
  print_header "❌ ERROR ANALYSIS (since $since)"
  
  # Find all error logs
  local files
  mapfile -t files < <(find_log_files "$since")
  
  # Group by fingerprint
  declare -A fingerprints
  declare -A error_names
  declare -A error_msgs
  declare -A last_seen
  
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      if [[ -z "$line" ]]; then continue; fi
      
      local fp=$(echo "$line" | jq -r '.context.error.fingerprint // empty')
      if [[ -z "$fp" ]]; then continue; fi
      
      fingerprints[$fp]=$((${fingerprints[$fp]:-0} + 1))
      
      if [[ -z "${error_names[$fp]:-}" ]]; then
        error_names[$fp]=$(echo "$line" | jq -r '.context.error.name')
        error_msgs[$fp]=$(echo "$line" | jq -r '.context.error.message')
      fi
      
      last_seen[$fp]=$(echo "$line" | jq -r '.timestamp')
    done < <(read_logs "$file" | jq -c "select(.timestamp >= \"$since\") | select(.level == \"error\" or .level == \"fatal\")")
  done
  
  echo ""
  print_success "Unique errors: ${#fingerprints[@]}"
  
  # Sort by occurrence count
  echo ""
  echo -e "${RED}Most Frequent Errors:${NC}"
  
  for fp in "${!fingerprints[@]}"; do
    echo "${fingerprints[$fp]} ${error_names[$fp]} ${error_msgs[$fp]} ${last_seen[$fp]} $fp"
  done | sort -rn | head -10 | while read -r count name msg timestamp fp; do
    echo ""
    echo -e "  ${RED}▪${NC} $name (x$count, last: $timestamp)"
    echo -e "    ${name}: ${msg:0:80}..."
    echo -e "    Fingerprint: ${fp:0:16}..."
  done
}

report_performance() {
  local category="BATTLE"
  local since="24h ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --category) category="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  since=$(parse_time "$since")
  
  print_header "⚡ PERFORMANCE REPORT (category: $category, since: $since)"
  
  # Find all performance logs
  local files
  mapfile -t files < <(find_log_files "$since")
  
  local durations=()
  local operation_count=0
  
  for file in "${files[@]}"; do
    while IFS= read -r duration; do
      if [[ -n "$duration" && "$duration" != "null" ]]; then
        durations+=("$duration")
        ((operation_count++))
      fi
    done < <(read_logs "$file" | jq -r "select(.timestamp >= \"$since\") | select(.category == \"$category\") | .context.operation.duration // empty")
  done
  
  if [[ ${#durations[@]} -eq 0 ]]; then
    print_warn "No performance data found for category: $category"
    return
  fi
  
  # Calculate statistics
  local sorted_durations=($(printf '%s\n' "${durations[@]}" | sort -n))
  local total=0
  for d in "${durations[@]}"; do
    total=$((total + d))
  done
  
  local avg=$((total / ${#durations[@]}))
  local p50_idx=$((${#sorted_durations[@]} / 2))
  local p95_idx=$((${#sorted_durations[@]} * 95 / 100))
  local p99_idx=$((${#sorted_durations[@]} * 99 / 100))
  
  local p50=${sorted_durations[$p50_idx]}
  local p95=${sorted_durations[$p95_idx]}
  local p99=${sorted_durations[$p99_idx]}
  
  echo ""
  print_success "Total operations: $operation_count"
  echo ""
  echo -e "${GREEN}Duration Statistics:${NC}"
  echo "  Average: ${avg}ms"
  echo "  P50 (median): ${p50}ms"
  echo "  P95: ${p95}ms"
  echo "  P99: ${p99}ms"
  
  # Optimization opportunities
  local slow_count=0
  for d in "${durations[@]}"; do
    if [[ $d -gt 500 ]]; then
      ((slow_count++))
    fi
  done
  
  if [[ $slow_count -gt 0 ]]; then
    echo ""
    print_warn "Optimization opportunities: $slow_count operations exceed 500ms threshold"
  fi
}

report_continuity() {
  local user_id=""
  local since="7d ago"
  local output="text"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user-id) user_id="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      --output) output="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [[ -z "$user_id" ]]; then
    print_error "User ID required for continuity report"
    echo "Usage: log-report continuity --user-id <id> [--since <time>]"
    return 1
  fi
  
  since=$(parse_time "$since")
  
  print_header "🧠 AI CONTINUITY REPORT (user: $user_id, since: $since)"
  
  # Find all logs for user
  local files
  mapfile -t files < <(find_log_files "$since")
  
  local user_logs=()
  
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      if [[ -n "$line" ]]; then
        user_logs+=("$line")
      fi
    done < <(read_logs "$file" | jq -c "select(.timestamp >= \"$since\") | select(.context.user.id == \"$user_id\")")
  done
  
  echo ""
  print_success "Found ${#user_logs[@]} logs for user $user_id"
  
  # Count activities
  local commands=0
  local battles=0
  local errors=0
  
  for log in "${user_logs[@]}"; do
    local category=$(echo "$log" | jq -r '.category')
    local level=$(echo "$log" | jq -r '.level')
    
    case "$category" in
      COMMAND) ((commands++)) ;;
      BATTLE) ((battles++)) ;;
    esac
    
    if [[ "$level" == "error" || "$level" == "fatal" ]]; then
      ((errors++))
    fi
  done
  
  echo ""
  echo -e "${BLUE}User Activity:${NC}"
  echo "  Commands: $commands"
  echo "  Battles: $battles"
  echo "  Errors encountered: $errors"
  
  # Timeline (last 10 events)
  echo ""
  echo -e "${MAGENTA}Recent Timeline:${NC}"
  printf '%s\n' "${user_logs[@]}" | jq -r '. | "\(.timestamp) [\(.category)] \(.message)"' | tail -10
  
  # Output full JSON if requested
  if [[ "$output" == "json" ]]; then
    echo ""
    echo -e "${CYAN}Full session context (JSON):${NC}"
    printf '%s\n' "${user_logs[@]}" | jq -s '.'
  fi
}

# ============================================================================
# Command: log-pattern
# ============================================================================

cmd_pattern() {
  local pattern_type="${1:-anomaly}"
  shift || true
  
  case "$pattern_type" in
    anomaly)
      pattern_anomaly "$@"
      ;;
    trends)
      pattern_trends "$@"
      ;;
    correlate)
      pattern_correlate "$@"
      ;;
    *)
      echo "Unknown pattern type: $pattern_type"
      echo "Available types: anomaly, trends, correlate"
      return 1
      ;;
  esac
}

pattern_anomaly() {
  local since="24h ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  since=$(parse_time "$since")
  
  print_header "🔍 ANOMALY DETECTION (since $since)"
  
  # Find all logs marked as anomalies
  local files
  mapfile -t files < <(find_log_files "$since")
  
  local anomalies=()
  
  for file in "${files[@]}"; do
    while IFS= read -r line; do
      if [[ -n "$line" ]]; then
        anomalies+=("$line")
      fi
    done < <(read_logs "$file" | jq -c "select(.timestamp >= \"$since\") | select(.ai.anomaly == true)")
  done
  
  echo ""
  print_success "${#anomalies[@]} anomalies detected"
  echo ""
  
  for anomaly in "${anomalies[@]}"; do
    local timestamp=$(echo "$anomaly" | jq -r '.timestamp')
    local category=$(echo "$anomaly" | jq -r '.category')
    local message=$(echo "$anomaly" | jq -r '.message')
    
    echo -e "${RED}▪${NC} [$timestamp] [$category] $message"
  done
}

pattern_trends() {
  local since="7d ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  since=$(parse_time "$since")
  
  print_header "📊 TREND ANALYSIS (since $since)"
  
  print_warn "Trend analysis not yet implemented"
  print_info "Coming soon: Week-over-week comparison, growth rates, and predictions"
}

pattern_correlate() {
  local fingerprint=""
  local since="7d ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint) fingerprint="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]]; then
    print_error "Fingerprint required for correlation analysis"
    echo "Usage: log-pattern correlate --fingerprint <fp> [--since <time>]"
    return 1
  fi
  
  since=$(parse_time "$since")
  
  print_header "🔗 CORRELATION ANALYSIS (fingerprint: ${fingerprint:0:16}..., since: $since)"
  
  print_warn "Correlation analysis not yet implemented"
  print_info "Coming soon: Time-based correlation, cascade detection, and recommendations"
}

# ============================================================================
# Command: log-context
# ============================================================================

cmd_context() {
  local context_type="${1:-session}"
  shift || true
  
  case "$context_type" in
    session)
      context_session "$@"
      ;;
    user)
      context_user "$@"
      ;;
    error)
      context_error "$@"
      ;;
    *)
      echo "Unknown context type: $context_type"
      echo "Available types: session, user, error"
      return 1
      ;;
  esac
}

context_session() {
  local session_id=""
  local output="json"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --session-id) session_id="$2"; shift 2 ;;
      --output) output="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [[ -z "$session_id" ]]; then
    print_error "Session ID required"
    echo "Usage: log-context session --session-id <id>"
    return 1
  fi
  
  print_header "🧩 SESSION CONTEXT (session: $session_id)"
  
  print_warn "Session context reconstruction not yet implemented"
  print_info "Coming soon: Full session timeline with state changes"
}

context_user() {
  local user_id=""
  local since="24h ago"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user-id) user_id="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [[ -z "$user_id" ]]; then
    print_error "User ID required"
    echo "Usage: log-context user --user-id <id> [--since <time>]"
    return 1
  fi
  
  since=$(parse_time "$since")
  
  print_header "👤 USER JOURNEY (user: $user_id, since: $since)"
  
  # Delegate to continuity report
  report_continuity --user-id "$user_id" --since "$since"
}

context_error() {
  local fingerprint=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint) fingerprint="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]]; then
    print_error "Fingerprint required"
    echo "Usage: log-context error --fingerprint <fp>"
    return 1
  fi
  
  print_header "🐛 ERROR CONTEXT (fingerprint: ${fingerprint:0:16}...)"
  
  # Find all occurrences of this error
  cmd_query --fingerprint "$fingerprint" --limit 5
}

# ============================================================================
# Error Analysis Commands
# ============================================================================

cmd_error() {
  local subcommand="${1:-}"
  
  if [[ -z "$subcommand" ]] || [[ "$subcommand" == "--help" ]]; then
    cat <<EOF
${CYAN}Error Analysis Commands${NC}

Usage: log-cli.sh error <subcommand> [options]

Subcommands:
  trace       Reconstruct full error flow (error → logs → system state)
  context     Get system state at error time
  suggest     AI-generated fix suggestions
  similar     Find similar errors by fingerprint or pattern
  timeline    Build timeline of events leading to error

Examples:
  log-cli.sh error trace --fingerprint a1b2c3d4e5f6
  log-cli.sh error context --fingerprint a1b2c3d4e5f6
  log-cli.sh error suggest --fingerprint a1b2c3d4e5f6
  log-cli.sh error similar --fingerprint a1b2c3d4e5f6
  log-cli.sh error timeline --fingerprint a1b2c3d4e5f6 --window 5m

EOF
    return 0
  fi
  
  shift
  
  case "$subcommand" in
    trace)
      cmd_error_trace "$@"
      ;;
    context)
      cmd_error_context "$@"
      ;;
    suggest)
      cmd_error_suggest "$@"
      ;;
    similar)
      cmd_error_similar "$@"
      ;;
    timeline)
      cmd_error_timeline "$@"
      ;;
    *)
      echo "Unknown error subcommand: $subcommand"
      echo "Run 'log-cli.sh error --help' for usage information"
      return 1
      ;;
  esac
}

# Reconstruct full error flow
cmd_error_trace() {
  local fingerprint=""
  local error_id=""
  local output_format="text"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      --error-id)
        error_id="$2"
        shift 2
        ;;
      --format)
        output_format="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]] && [[ -z "$error_id" ]]; then
    echo "Error: --fingerprint or --error-id required" >&2
    return 1
  fi
  
  print_header "🔍 ERROR TRACE RECONSTRUCTION"
  
  # Step 1: Find AI report
  echo -e "${BLUE}Step 1: Loading AI Report...${NC}"
  local report_dir="/Store/error-reports"
  local report_file=""
  
  if [[ -n "$fingerprint" ]]; then
    report_file=$(ls -t "$report_dir" | grep "$fingerprint" | head -n 1)
  fi
  
  if [[ -n "$report_file" ]]; then
    echo -e "${GREEN}✓${NC} Found AI Report: $report_file"
    echo ""
    cat "$report_dir/$report_file"
    echo ""
  else
    echo -e "${YELLOW}⚠${NC} No AI report found"
  fi
  
  # Step 2: Query related logs
  echo -e "${BLUE}Step 2: Querying Related Logs...${NC}"
  
  local filter=""
  if [[ -n "$fingerprint" ]]; then
    filter="data.fingerprint=\"$fingerprint\""
  elif [[ -n "$error_id" ]]; then
    filter="data.errorId=\"$error_id\""
  fi
  
  # Find all logs with this error
  local related_logs=$(find_log_files "" "" | xargs zcat -f 2>/dev/null | \
    jq -c "select($filter)" 2>/dev/null || true)
  
  local log_count=$(echo "$related_logs" | grep -c . || echo "0")
  echo -e "${GREEN}✓${NC} Found $log_count related log entries"
  
  if [[ "$log_count" -gt 0 ]]; then
    echo ""
    echo -e "${CYAN}Recent Error Occurrences:${NC}"
    echo "$related_logs" | head -n 5 | jq -r '[.timestamp, .level, .message] | @tsv' | \
      while IFS=$'\t' read -r ts level msg; do
        echo "  [$ts] $level: $msg"
      done
  fi
  
  # Step 3: Get stack trace metadata
  echo ""
  echo -e "${BLUE}Step 3: Stack Trace Metadata...${NC}"
  
  local stack_metadata=$(echo "$related_logs" | head -n 1 | \
    jq -r '.data.stackMetadata // empty' 2>/dev/null)
  
  if [[ -n "$stack_metadata" ]] && [[ "$stack_metadata" != "null" ]]; then
    echo -e "${GREEN}✓${NC} Stack metadata available"
    echo ""
    echo "$stack_metadata" | jq -r '
      "  Depth: \(.depth // "unknown")",
      "  Top Frame: \(.topFrame.file // "unknown"):\(.topFrame.line // "?")",
      "  Function: \(.topFrame.function // "anonymous")",
      "  Call Chain: \(.callChain | join(" → "))",
      "  User Code Frames: \(.userCodeFrames // 0)"
    '
  else
    echo -e "${YELLOW}⚠${NC} No stack metadata available"
  fi
  
  # Step 4: Emergency logs check
  echo ""
  echo -e "${BLUE}Step 4: Checking Emergency Logs...${NC}"
  
  local emergency_dir="/Store/emergency-error-logs"
  if [[ -d "$emergency_dir" ]]; then
    local emergency_files=$(ls -t "$emergency_dir" 2>/dev/null | head -n 5)
    if [[ -n "$emergency_files" ]]; then
      echo -e "${YELLOW}⚠${NC} Found emergency fallback logs (database may have been unavailable)"
      echo "$emergency_files" | head -n 3 | while read -r file; do
        echo "  - $file"
      done
    else
      echo -e "${GREEN}✓${NC} No emergency fallback logs (normal operation)"
    fi
  fi
  
  echo ""
  print_success "Trace reconstruction complete"
}

# Get system state at error time
cmd_error_context() {
  local fingerprint=""
  local error_id=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      --error-id)
        error_id="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]] && [[ -z "$error_id" ]]; then
    echo "Error: --fingerprint or --error-id required" >&2
    return 1
  fi
  
  print_header "🖥️  SYSTEM STATE AT ERROR TIME"
  
  # Find the error log entry
  local filter=""
  if [[ -n "$fingerprint" ]]; then
    filter="data.fingerprint=\"$fingerprint\""
  elif [[ -n "$error_id" ]]; then
    filter="data.errorId=\"$error_id\""
  fi
  
  local error_entry=$(find_log_files "" "" | xargs zcat -f 2>/dev/null | \
    jq -c "select($filter)" 2>/dev/null | head -n 1)
  
  if [[ -z "$error_entry" ]]; then
    print_error "Error not found in logs"
    return 1
  fi
  
  echo -e "${GREEN}✓${NC} Found error entry"
  echo ""
  
  # Extract context
  echo -e "${CYAN}Error Details:${NC}"
  echo "$error_entry" | jq -r '
    "  Timestamp: \(.timestamp)",
    "  Level: \(.level)",
    "  Category: \(.category)",
    "  Message: \(.message)"
  '
  
  echo ""
  echo -e "${CYAN}System State:${NC}"
  echo "$error_entry" | jq -r '.context.process // empty | 
    "  PID: \(.pid)",
    "  Uptime: \(.uptime)s",
    "  Memory RSS: \(.memory.rss | tonumber / 1024 / 1024 | floor)MB",
    "  Memory Heap: \(.memory.heapUsed | tonumber / 1024 / 1024 | floor)MB / \(.memory.heapTotal | tonumber / 1024 / 1024 | floor)MB"
  '
  
  echo ""
  echo -e "${CYAN}Error Context:${NC}"
  echo "$error_entry" | jq -r '.data.errorContext // .context.error // empty |
    "  Service: \(.service // "unknown")",
    "  Operation: \(.operation // "unknown")",
    "  Severity: \(.severity // "unknown")",
    "  Category: \(.category // "unknown")"
  '
  
  echo ""
  echo -e "${CYAN}Source Location:${NC}"
  echo "$error_entry" | jq -r '.data.sourceLocation // empty |
    "  File: \(.file)",
    "  Line: \(.line)",
    "  Column: \(.column // "unknown")"
  '
  
  echo ""
  print_success "System state extraction complete"
}

# Generate AI fix suggestions
cmd_error_suggest() {
  local fingerprint=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]]; then
    echo "Error: --fingerprint required" >&2
    return 1
  fi
  
  print_header "💡 AI FIX SUGGESTIONS"
  
  # Find AI report
  local report_dir="/Store/error-reports"
  local report_file=$(ls -t "$report_dir" 2>/dev/null | grep "$fingerprint" | head -n 1)
  
  if [[ -z "$report_file" ]]; then
    print_error "No AI report found for fingerprint: $fingerprint"
    return 1
  fi
  
  echo -e "${GREEN}✓${NC} Found AI Report: $report_file"
  echo ""
  
  # Extract troubleshooting hints section
  echo -e "${CYAN}Troubleshooting Hints:${NC}"
  sed -n '/## 💡 Troubleshooting Hints/,/## /p' "$report_dir/$report_file" | \
    sed '1d;$d' | \
    grep -v '^$'
  
  echo ""
  echo -e "${CYAN}Suggested Actions:${NC}"
  
  # Generate suggestions based on error type
  local error_type=$(grep "^\*\*Error:\*\*" "$report_dir/$report_file" | \
    sed 's/.*Error:\*\* \([^:]*\):.*/\1/')
  
  case "$error_type" in
    TypeError)
      echo "  1. Check for null/undefined values before property access"
      echo "  2. Add type guards and null checks"
      echo "  3. Verify object initialization before use"
      echo "  4. Review function return types"
      ;;
    ReferenceError)
      echo "  1. Check for missing imports or typos in variable names"
      echo "  2. Verify scope and hoisting issues"
      echo "  3. Check for missing module exports"
      echo "  4. Review variable declarations"
      ;;
    *Prisma*)
      echo "  1. Verify database connection string"
      echo "  2. Check Prisma schema matches database"
      echo "  3. Review query syntax and relations"
      echo "  4. Check for missing migrations"
      ;;
    *Discord*)
      echo "  1. Verify bot permissions in guild"
      echo "  2. Check for API rate limits"
      echo "  3. Review Discord API changes"
      echo "  4. Verify token validity"
      ;;
    *)
      echo "  1. Review error message and stack trace"
      echo "  2. Check recent code changes"
      echo "  3. Verify environment configuration"
      echo "  4. Check for external service issues"
      ;;
  esac
  
  echo ""
  echo -e "${CYAN}Debugging Commands:${NC}"
  echo "  # View full AI report"
  echo "  cat $report_dir/$report_file"
  echo ""
  echo "  # Query related logs"
  echo "  log-cli.sh query --filter 'data.fingerprint=\"$fingerprint\"'"
  echo ""
  echo "  # View error timeline"
  echo "  log-cli.sh error timeline --fingerprint $fingerprint"
  
  echo ""
  print_success "Suggestions generated"
}

# Find similar errors
cmd_error_similar() {
  local fingerprint=""
  local pattern=""
  local limit=10
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      --pattern)
        pattern="$2"
        shift 2
        ;;
      --limit)
        limit="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]] && [[ -z "$pattern" ]]; then
    echo "Error: --fingerprint or --pattern required" >&2
    return 1
  fi
  
  print_header "🔎 SIMILAR ERRORS"
  
  if [[ -n "$fingerprint" ]]; then
    # Find error with this fingerprint
    local base_error=$(find_log_files "" "" | xargs zcat -f 2>/dev/null | \
      jq -c "select(.data.fingerprint == \"$fingerprint\")" 2>/dev/null | head -n 1)
    
    if [[ -z "$base_error" ]]; then
      print_error "Error not found with fingerprint: $fingerprint"
      return 1
    fi
    
    local error_name=$(echo "$base_error" | jq -r '.data.errorContext.errorName // .context.error.name // "unknown"')
    local category=$(echo "$base_error" | jq -r '.data.errorContext.category // .category // "unknown"')
    
    echo -e "${CYAN}Base Error:${NC}"
    echo "  Type: $error_name"
    echo "  Category: $category"
    echo "  Fingerprint: $fingerprint"
    echo ""
    
    echo -e "${CYAN}Finding similar errors (same type, different fingerprints)...${NC}"
    
    # Find errors with same type but different fingerprints
    find_log_files "" "" | xargs zcat -f 2>/dev/null | \
      jq -c "select(.category == \"ERROR\" and 
                    (.data.errorContext.errorName // .context.error.name) == \"$error_name\" and
                    .data.fingerprint != \"$fingerprint\")" 2>/dev/null | \
      head -n "$limit" | \
      jq -r '[.timestamp, .data.fingerprint[0:12], .message] | @tsv' | \
      while IFS=$'\t' read -r ts fp msg; do
        echo "  [$ts] fp:$fp - $msg"
      done
    
  else
    # Pattern-based search
    echo -e "${CYAN}Searching for pattern: $pattern${NC}"
    echo ""
    
    find_log_files "" "" | xargs zcat -f 2>/dev/null | \
      jq -c "select(.category == \"ERROR\" and (.message | test(\"$pattern\"; \"i\")))" 2>/dev/null | \
      head -n "$limit" | \
      jq -r '[.timestamp, .data.fingerprint[0:12] // "no-fp", .message] | @tsv' | \
      while IFS=$'\t' read -r ts fp msg; do
        echo "  [$ts] fp:$fp - $msg"
      done
  fi
  
  echo ""
  print_success "Similar errors search complete"
}

# Build error timeline
cmd_error_timeline() {
  local fingerprint=""
  local window="5m"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fingerprint)
        fingerprint="$2"
        shift 2
        ;;
      --window)
        window="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 1
        ;;
    esac
  done
  
  if [[ -z "$fingerprint" ]]; then
    echo "Error: --fingerprint required" >&2
    return 1
  fi
  
  print_header "📅 ERROR TIMELINE"
  
  # Find first occurrence of this error
  local first_error=$(find_log_files "" "" | xargs zcat -f 2>/dev/null | \
    jq -c "select(.data.fingerprint == \"$fingerprint\")" 2>/dev/null | head -n 1)
  
  if [[ -z "$first_error" ]]; then
    print_error "Error not found with fingerprint: $fingerprint"
    return 1
  fi
  
  local error_time=$(echo "$first_error" | jq -r '.timestamp')
  local error_msg=$(echo "$first_error" | jq -r '.message')
  
  echo -e "${CYAN}Error Occurred:${NC} $error_time"
  echo -e "${CYAN}Message:${NC} $error_msg"
  echo ""
  
  # Calculate time window
  local since=$(date -u -d "$error_time - $window" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "$error_time")
  local until=$(date -u -d "$error_time + $window" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "$error_time")
  
  echo -e "${CYAN}Timeline Window:${NC} $since to $until"
  echo ""
  
  echo -e "${CYAN}Events Leading Up To Error:${NC}"
  
  # Get all logs in time window
  find_log_files "$since" "$until" | xargs zcat -f 2>/dev/null | \
    jq -c "select(.timestamp < \"$error_time\")" 2>/dev/null | \
    sort -t: -k2 | \
    tail -n 10 | \
    jq -r '[.timestamp, .level, .category, .message[0:60]] | @tsv' | \
    while IFS=$'\t' read -r ts level cat msg; do
      local color="${NC}"
      case "$level" in
        error|fatal) color="${RED}" ;;
        warn) color="${YELLOW}" ;;
        info) color="${GREEN}" ;;
      esac
      echo -e "  ${color}[$ts]${NC} $level/$cat: $msg"
    done
  
  echo ""
  echo -e "${RED}>>> ERROR OCCURRED HERE <<<${NC}"
  echo ""
  
  echo -e "${CYAN}Events After Error:${NC}"
  
  find_log_files "$since" "$until" | xargs zcat -f 2>/dev/null | \
    jq -c "select(.timestamp > \"$error_time\")" 2>/dev/null | \
    sort -t: -k2 | \
    head -n 10 | \
    jq -r '[.timestamp, .level, .category, .message[0:60]] | @tsv' | \
    while IFS=$'\t' read -r ts level cat msg; do
      local color="${NC}"
      case "$level" in
        error|fatal) color="${RED}" ;;
        warn) color="${YELLOW}" ;;
        info) color="${GREEN}" ;;
      esac
      echo -e "  ${color}[$ts]${NC} $level/$cat: $msg"
    done
  
  echo ""
  print_success "Timeline reconstruction complete"
}

# ============================================================================
# Main Entry Point
# ============================================================================

main() {
  if [[ $# -eq 0 ]]; then
    cat << 'EOF'
Intelligent Logging System - SSH CLI Tools

Usage: log-cli.sh <command> [options]

Commands:
  query       Search and filter logs
  report      Generate AI-optimized summaries
  pattern     Detect anomalies and trends
  context     Reconstruct session context
  error       Error analysis and troubleshooting (NEW)

Examples:
  log-cli.sh query --level error --since "1h ago"
  log-cli.sh report session --since "24h ago"
  log-cli.sh pattern anomaly --since "24h ago"
  log-cli.sh context user --user-id "123456789"
  log-cli.sh error trace --fingerprint a1b2c3d4e5f6
  log-cli.sh error suggest --fingerprint a1b2c3d4e5f6

For detailed help on a command:
  log-cli.sh <command> --help

EOF
    return 0
  fi
  
  local command="$1"
  shift
  
  case "$command" in
    query)
      cmd_query "$@"
      ;;
    report)
      cmd_report "$@"
      ;;
    pattern)
      cmd_pattern "$@"
      ;;
    context)
      cmd_context "$@"
      ;;
    error)
      cmd_error "$@"
      ;;
    *)
      echo "Unknown command: $command"
      echo "Run 'log-cli.sh' for usage information"
      return 1
      ;;
  esac
}

main "$@"
