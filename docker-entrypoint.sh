#!/bin/sh
# Bookarr entrypoint: ensure /data (and library root) are writable, then drop privileges.
# Supports PUID/PGID like *arr apps. Starts as root in the image; drops to `node`.
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${BOOKARR_DATA_DIR:-/data}"
LIBRARY_ROOT="${BOOKARR_LIBRARY_ROOT:-/data/audiobooks}"
# Set BOOKARR_CHOWN_DATA=recursive to chown -R /data (slow on huge bind-mounted libraries)
CHOWN_MODE="${BOOKARR_CHOWN_DATA:-top}"

log() {
  echo "INFO  bookarr.entrypoint $*"
}

warn() {
  echo "WARN  bookarr.entrypoint $*" >&2
}

fix_uid_gid() {
  # Align the built-in node user/group with host PUID/PGID when requested.
  if [ "$(id -u node 2>/dev/null || echo x)" != "$PUID" ] || [ "$(id -g node 2>/dev/null || echo x)" != "$PGID" ]; then
    if command -v groupmod >/dev/null 2>&1 && command -v usermod >/dev/null 2>&1; then
      groupmod -o -g "$PGID" node 2>/dev/null || true
      usermod -o -u "$PUID" -g "$PGID" node 2>/dev/null || true
      log "aligned node user to PUID=$PUID PGID=$PGID"
    else
      warn "usermod/groupmod unavailable; running as image uid (expect 1000)"
    fi
  fi
}

ensure_dir() {
  dir="$1"
  mkdir -p "$dir" 2>/dev/null || true
  if [ ! -d "$dir" ]; then
    warn "could not create directory path=$dir"
    return 1
  fi
  chown "$PUID:$PGID" "$dir" 2>/dev/null || warn "chown failed path=$dir (bind mount may be immutable)"
  chmod u+rwx "$dir" 2>/dev/null || true
}

fix_data_permissions() {
  ensure_dir "$DATA_DIR"
  ensure_dir "$LIBRARY_ROOT"

  # Top-level files under /data (SQLite DB, WAL, etc.) — keep contents, fix ownership only
  if [ -d "$DATA_DIR" ]; then
    if [ "$CHOWN_MODE" = "recursive" ] || [ "$CHOWN_MODE" = "true" ] || [ "$CHOWN_MODE" = "1" ]; then
      log "chown recursive path=$DATA_DIR owner=$PUID:$PGID"
      chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || warn "recursive chown failed path=$DATA_DIR"
    else
      # Non-recursive: fix mount root + immediate children (DB files) without walking a large library tree
      for entry in "$DATA_DIR"/* "$DATA_DIR"/.[!.]*; do
        [ -e "$entry" ] || continue
        # Skip the library root tree when it lives under /data — only fix the directory itself
        if [ "$entry" = "$LIBRARY_ROOT" ]; then
          chown "$PUID:$PGID" "$entry" 2>/dev/null || true
          continue
        fi
        case "$entry" in
          */audiobooks)
            chown "$PUID:$PGID" "$entry" 2>/dev/null || true
            ;;
          *)
            chown -R "$PUID:$PGID" "$entry" 2>/dev/null || chown "$PUID:$PGID" "$entry" 2>/dev/null || true
            ;;
        esac
      done
    fi
  fi

  # Quick writability probe as the target user (best-effort)
  probe="$LIBRARY_ROOT/.bookarr-write-test"
  if runuser -u node -- sh -c "touch '$probe' && rm -f '$probe'" 2>/dev/null; then
    log "library root writable path=$LIBRARY_ROOT uid=$PUID"
  else
    warn "library root not writable by app user path=$LIBRARY_ROOT uid=$PUID — imports will fail with EACCES. Fix host ownership or set PUID/PGID to the volume owner. Named volume tip: recreate or chown the volume; bind-mount tip: chown the host path to PUID=$PUID."
  fi
}

drop_and_exec() {
  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u node -- "$@"
  fi
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups -- "$@"
  fi
  warn "runuser/setpriv missing; exec as current user"
  exec "$@"
}

if [ "$(id -u)" = "0" ]; then
  log "running as root; preparing data dirs then dropping to node (PUID=$PUID PGID=$PGID)"
  fix_uid_gid
  fix_data_permissions
  drop_and_exec "$@"
fi

# Already non-root (e.g. overridden user) — just run
log "running as uid=$(id -u) (skipping chown)"
exec "$@"
