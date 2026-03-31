#!/usr/bin/env bash

# ==========================================
# Axios Supply Chain Compromise Sweeper
# Targets: axios@1.14.1, axios@0.30.4, plain-crypto-js
# ==========================================

# Text formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Cross-platform sed flag for in-place editing
sedi=('-i')
case "$(uname)" in
  Darwin*) sedi=('-i' '') ;;
esac

# Flags
DRY_RUN=0
FOUND_COMPROMISE=0
FOUND_RAT=0

print_help() {
    echo -e "${CYAN}${BOLD}Axios Supply Chain Compromise Sweeper${NC}"
    echo -e "Scans the current directory and subdirectories for compromised axios versions,"
    echo -e "removes the malicious plain-crypto-js package, and checks the OS for RAT artifacts.\n"
    echo -e "${BOLD}Usage:${NC} $0 [OPTIONS]"
    echo -e "\n${BOLD}Options:${NC}"
    echo -e "  -h, --help      Show this help message and exit"
    echo -e "  -d, --dry-run   Report findings without modifying or deleting files"
    echo -e "\n${BOLD}What it does:${NC}"
    echo -e "  1. Scans all package.json files for axios 1.14.1 and 0.30.4."
    echo -e "  2. Downgrades affected axios versions to 1.14.0 or 0.30.3 in package.json."
    echo -e "  3. Scans for and removes node_modules/plain-crypto-js directories."
    echo -e "  4. Scans for known lockfiles containing the compromised versions."
    echo -e "  5. Checks the OS (/tmp, /Library/Caches, %PROGRAMDATA%) for dropped RAT binaries."
    echo -e "  6. Cleans npm cache if any modifications are made."
    exit 0
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_crit() { echo -e "${RED}${BOLD}[CRITICAL]${NC} $1"; }
log_succ() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -h|--help) print_help ;;
        -d|--dry-run) DRY_RUN=1 ;;
        *) log_warn "Unknown parameter passed: $1"; print_help ;;
    esac
    shift
done

echo -e "${MAGENTA}${BOLD}=== Starting Axios/RAT Sweep ===${NC}\n"
if [ "$DRY_RUN" -eq 1 ]; then
    log_warn "DRY RUN MODE ENABLED. No files will be modified."
fi

# ==========================================
# 1. NPM Project Scanning & Remediation
# ==========================================
log_info "Scanning for malicious packages in project files..."

# Find plain-crypto-js in node_modules
find . -type d -name "plain-crypto-js" -path "*/node_modules/*" 2>/dev/null | while read -r pdir; do
    FOUND_COMPROMISE=1
    log_crit "Malicious directory found: $pdir"
    if [ "$DRY_RUN" -eq 0 ]; then
        rm -rf "$pdir"
        log_succ "Removed: $pdir"
    fi
done

# Check package.json files
find . -type f -name "package.json" -not -path "*/node_modules/*" 2>/dev/null | while read -r pjson; do
    if grep -q '"axios":.*1\.14\.1' "$pjson"; then
        FOUND_COMPROMISE=1
        log_crit "Compromised axios@1.14.1 found in: $pjson"
        if [ "$DRY_RUN" -eq 0 ]; then
            sed "${sedi[@]}" 's/"axios": *"\([^"]*\)1\.14\.1"/"axios": "\11.14.0"/g' "$pjson"
            log_succ "Downgraded to 1.14.0 in: $pjson"
        fi
    fi
    if grep -q '"axios":.*0\.30\.4' "$pjson"; then
        FOUND_COMPROMISE=1
        log_crit "Compromised axios@0.30.4 found in: $pjson"
        if [ "$DRY_RUN" -eq 0 ]; then
            sed "${sedi[@]}" 's/"axios": *"\([^"]*\)0\.30\.4"/"axios": "\10.30.3"/g' "$pjson"
            log_succ "Downgraded to 0.30.3 in: $pjson"
        fi
    fi
done

# Check Lockfiles
find . -type f \( -name "package-lock.json" -o -name "yarn.lock" -o -name "pnpm-lock.yaml" \) -not -path "*/node_modules/*" 2>/dev/null | while read -r lfile; do
    if grep -qE 'axios@(1\.14\.1|0\.30\.4)|plain-crypto-js' "$lfile"; then
        FOUND_COMPROMISE=1
        log_crit "Compromised version trace found in lockfile: $lfile"
        if [ "$DRY_RUN" -eq 0 ]; then
            rm -f "$lfile"
            log_succ "Deleted contaminated lockfile: $lfile (Please run your package manager install command to regenerate)"
        fi
    fi
done

# ==========================================
# 2. OS Level RAT Artifact Scanning
# ==========================================
echo ""
log_info "Scanning Operating System for known RAT artifacts..."

OS_TYPE="$(uname -s)"
case "$OS_TYPE" in
    Linux*)
        if [ -f "/tmp/ld.py" ]; then
            FOUND_RAT=1
            log_crit "Linux RAT Artifact Found: /tmp/ld.py"
            if [ "$DRY_RUN" -eq 0 ]; then
                pkill -f "/tmp/ld.py" 2>/dev/null
                rm -f "/tmp/ld.py"
                log_succ "Killed process and removed /tmp/ld.py"
            fi
        fi
        ;;
    Darwin*)
        if [ -f "/Library/Caches/com.apple.act.mond" ]; then
            FOUND_RAT=1
            log_crit "macOS RAT Artifact Found: /Library/Caches/com.apple.act.mond"
            if [ "$DRY_RUN" -eq 0 ]; then
                pkill -f "com.apple.act.mond" 2>/dev/null
                rm -f "/Library/Caches/com.apple.act.mond"
                log_succ "Killed process and removed /Library/Caches/com.apple.act.mond"
            fi
        fi
        ;;
    MINGW*|CYGWIN*|MSYS*)
        # Handling Windows environments via Git Bash
        PROGRAM_DATA_PATH="/c/ProgramData"
        if [ -f "$PROGRAM_DATA_PATH/wt.exe" ]; then
            FOUND_RAT=1
            log_crit "Windows RAT Artifact Found: $PROGRAM_DATA_PATH/wt.exe"
            if [ "$DRY_RUN" -eq 0 ]; then rm -f "$PROGRAM_DATA_PATH/wt.exe" && log_succ "Removed wt.exe"; fi
        fi
        if [ -f "$PROGRAM_DATA_PATH/system.bat" ]; then
            FOUND_RAT=1
            log_crit "Windows Persistence Artifact Found: $PROGRAM_DATA_PATH/system.bat"
            if [ "$DRY_RUN" -eq 0 ]; then rm -f "$PROGRAM_DATA_PATH/system.bat" && log_succ "Removed system.bat"; fi
        fi
        ;;
    *)
        log_warn "Unrecognized OS for specific RAT checks: $OS_TYPE"
        ;;
esac

# WSL-specific check for Windows artifacts
if grep -qE "(Microsoft|WSL)" /proc/version &> /dev/null; then
    WSL_PDATA="/mnt/c/ProgramData"
    if [ -f "$WSL_PDATA/wt.exe" ] || [ -f "$WSL_PDATA/system.bat" ]; then
        FOUND_RAT=1
        log_crit "Windows RAT Artifacts found via WSL in $WSL_PDATA!"
        if [ "$DRY_RUN" -eq 0 ]; then 
            rm -f "$WSL_PDATA/wt.exe" "$WSL_PDATA/system.bat" 2>/dev/null
            log_succ "Removed Windows artifacts via WSL"
        fi
    fi
fi

# ==========================================
# 3. Final Reporting & Instructions
# ==========================================
echo ""
if [ "$FOUND_COMPROMISE" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    log_info "Cleaning npm cache..."
    npm cache clean --force
fi

if [ "$FOUND_RAT" -eq 1 ]; then
    echo -e "\n${RED}${BOLD}==================== 🚨 SYSTEM COMPROMISED 🚨 ====================${NC}"
    echo -e "${RED}OS-level RAT artifacts were discovered on this machine.${NC}"
    echo -e "While this script deleted the known dropped payloads, you MUST assume the attacker had code execution."
    echo -e "\n${BOLD}Immediate actions required (per Huntress guidance):${NC}"
    echo -e "  1. ${YELLOW}Do not consider this machine clean.${NC} Rebuild it from a known-good image."
    echo -e "  2. ${YELLOW}Rotate ALL secrets${NC} accessible from this machine (npm tokens, SSH keys,"
    echo -e "     AWS/Cloud keys, .env values, OAuth tokens, API keys)."
    echo -e "  3. Block C2 IP ${BOLD}142.11.206.73${NC} and domain ${BOLD}sfrclak.com${NC} at your network edge."
    echo -e "${RED}==================================================================${NC}\n"
    exit 1
elif [ "$FOUND_COMPROMISE" -eq 1 ]; then
    echo -e "\n${YELLOW}${BOLD}=== WARNING: Malicious Dependencies Found ===${NC}"
    echo -e "The compromised packages were found in your project files and removed."
    echo -e "If you ran 'npm install', 'yarn', or executed code while these were present,"
    echo -e "the postinstall script may have executed. Please manually verify network traffic"
    echo -e "and consider rotating any project-level secrets.\n"
    exit 2
else
    echo -e "\n${GREEN}${BOLD}=== Clean! ===${NC}"
    echo -e "No traces of compromised axios versions, plain-crypto-js, or known RAT artifacts found.\n"
    exit 0
fi