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

Examples:
  log-cli.sh query --level error --since "1h ago"
  log-cli.sh report session --since "24h ago"
  log-cli.sh pattern anomaly --since "24h ago"
  log-cli.sh context user --user-id "123456789"

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
    *)
      echo "Unknown command: $command"
      echo "Run 'log-cli.sh' for usage information"
      return 1
      ;;
  esac
}

main "$@"
