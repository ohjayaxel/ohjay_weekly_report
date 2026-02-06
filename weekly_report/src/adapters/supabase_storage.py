"""
Supabase Storage adapter for raw weekly report files (qlik, dema_spend, dema_gm2, shopify).
Used so production (e.g. Railway) can run without local disk: upload to Storage on upload,
and materialize from Storage when loading/sync.
"""

import io
from pathlib import Path
from typing import List, Tuple, Optional
from loguru import logger

from weekly_report.src.adapters.supabase_client import get_supabase_client


RAW_DATA_BUCKET = "raw-data"

# File types we store in Storage (budget is in DB table budget_files)
STORAGE_FILE_TYPES = ("qlik", "dema_spend", "dema_gm2", "shopify")


def sanitize_storage_filename(filename: str) -> str:
    """
    Make filename safe for Supabase Storage (S3-compatible keys).
    Replaces å/ä/ö with a/a/o, spaces with underscore, strips other unsafe chars.
    """
    if not filename or not filename.strip():
        return "file"
    s = filename.strip()
    replacements = (
        ("å", "a"), ("ä", "a"), ("ö", "o"),
        ("Å", "A"), ("Ä", "A"), ("Ö", "O"),
    )
    for old, new in replacements:
        s = s.replace(old, new)
    s = s.replace(" ", "_")
    safe = "".join(c for c in s if c.isalnum() or c in "-_.")
    if not safe:
        return "file"
    # Ensure we keep extension (e.g. .xlsx, .csv)
    if "." in safe and not safe.startswith("."):
        return safe
    return safe


def _ensure_bucket() -> bool:
    """Create raw-data bucket if it does not exist. Returns True if bucket is available."""
    supabase = get_supabase_client()
    if not supabase:
        return False
    try:
        supabase.storage.create_bucket(RAW_DATA_BUCKET, options={"public": "false"})
        logger.info(f"Created Storage bucket: {RAW_DATA_BUCKET}")
        return True
    except Exception as e:
        # Bucket may already exist
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower() or "Bucket already exists" in str(e):
            return True
        logger.warning(f"Could not ensure bucket {RAW_DATA_BUCKET}: {e}")
        return False


def upload_raw_file(week: str, file_type: str, local_path: Path, filename: str) -> bool:
    """
    Upload a raw data file to Supabase Storage at {week}/{file_type}/{filename}.
    Returns True on success. Use upload_raw_file_bytes when you have bytes in memory.
    """
    if not local_path.exists():
        logger.warning(f"Upload path does not exist: {local_path}")
        return False
    data = local_path.read_bytes()
    ok, _ = upload_raw_file_bytes(week, file_type, data, filename)
    return ok


def upload_raw_file_bytes(week: str, file_type: str, data: bytes, filename: str) -> Tuple[bool, Optional[str]]:
    """
    Upload raw data from memory to Supabase Storage at {week}/{file_type}/{filename}.
    Use this in production (e.g. Railway) to avoid writing to local disk.
    Returns (True, None) on success, (False, error_message) on failure.
    """
    if file_type not in STORAGE_FILE_TYPES:
        logger.debug(f"Skip Storage upload for file_type={file_type}")
        return False, None
    supabase = get_supabase_client()
    if not supabase:
        return False, "Supabase client not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    if not _ensure_bucket():
        logger.warning("Bucket creation failed or skipped; attempting upload anyway")
    safe_name = sanitize_storage_filename(filename)
    storage_path = f"{week}/{file_type}/{safe_name}"
    try:
        # Supabase Python client expects path, bytes, or file path – not BytesIO
        supabase.storage.from_(RAW_DATA_BUCKET).upload(
            path=storage_path,
            file=data,
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )
        logger.info(f"Uploaded to Storage: {storage_path}")
        return True, None
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Storage upload failed for {storage_path}: {e}")
        if "Bucket not found" in err_msg or "not found" in err_msg.lower():
            err_msg = (
                "Bucket 'raw-data' not found in Supabase. Create it in Dashboard: Storage → New bucket, name: raw-data, private."
            )
        elif "413" in err_msg or "exceeded the maximum allowed size" in err_msg or "Payload too large" in err_msg or "file size" in err_msg.lower():
            err_msg = (
                "Filen är för stor för Supabase Storage (standardgräns 50 MB). "
                "Öka gränsen i Supabase Dashboard: Storage → bucket 'raw-data' → inställningar → File size limit, "
                "eller exportera Qlik-data som en mindre fil (t.ex. mindre datumintervall)."
            )
        return False, err_msg


def list_weeks_in_storage() -> List[str]:
    """
    List week identifiers (e.g. 2026-05) that have at least one raw file in Storage.
    Used so "Copy data from" only shows weeks we can actually load.
    """
    supabase = get_supabase_client()
    if not supabase:
        return []
    out: List[str] = []
    try:
        resp = supabase.storage.from_(RAW_DATA_BUCKET).list("")
        top = getattr(resp, "data", resp) if resp is not None else []
        if not top or not isinstance(top, (list, tuple)):
            return []
        for item in top:
            name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
            if not name or name.startswith("."):
                continue
            # Only include if this week has at least one file (so we can actually use it as source)
            if list_week_files(name):
                out.append(name)
    except Exception as e:
        logger.debug(f"Storage list weeks: {e}")
    return out


def list_week_files(week: str) -> List[Tuple[str, str]]:
    """
    List all files in Storage for the given week.
    Returns list of (file_type, filename) e.g. [("qlik", "sales.csv"), ...].
    """
    entries, _ = list_week_files_with_metadata(week)
    return entries


def list_week_files_with_metadata(week: str) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str, Optional[str]]]]:
    """
    List all files in Storage for the given week, with optional updated_at per file.
    Returns (simple list of (file_type, filename), list of (file_type, filename, updated_at_iso)).
    """
    supabase = get_supabase_client()
    if not supabase:
        return [], []
    out_simple: List[Tuple[str, str]] = []
    out_meta: List[Tuple[str, str, Optional[str]]] = []
    try:
        resp = supabase.storage.from_(RAW_DATA_BUCKET).list(week)
        top = getattr(resp, "data", resp) if resp is not None else []
        if not top or not isinstance(top, (list, tuple)):
            return [], []
        for item in top:
            name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
            if not name or name.startswith("."):
                continue
            sub_path = f"{week}/{name}"
            try:
                files_resp = supabase.storage.from_(RAW_DATA_BUCKET).list(sub_path)
                files = getattr(files_resp, "data", files_resp) if files_resp is not None else []
            except Exception:
                out_simple.append((name, name))
                out_meta.append((name, name, None))
                continue
            if not files or not isinstance(files, (list, tuple)):
                continue
            for f in files:
                fname = f.get("name") if isinstance(f, dict) else getattr(f, "name", None)
                if not fname or fname.startswith("."):
                    continue
                updated_at = None
                if isinstance(f, dict):
                    updated_at = f.get("updated_at") or f.get("created_at")
                else:
                    updated_at = getattr(f, "updated_at", None) or getattr(f, "created_at", None)
                if isinstance(updated_at, str) and "T" in updated_at:
                    pass  # already ISO
                elif hasattr(updated_at, "isoformat"):
                    updated_at = updated_at.isoformat() if updated_at else None
                out_simple.append((name, fname))
                out_meta.append((name, fname, updated_at))
    except Exception as e:
        logger.debug(f"Storage list for week {week}: {e}")
    return out_simple, out_meta


def download_week_to_path(week: str, data_root: Path) -> bool:
    """
    Download all raw files for the given week from Storage into data_root/raw/week/.
    Creates data_root/raw/week/{file_type}/ and writes files there.
    Returns True if at least one file was downloaded.
    """
    supabase = get_supabase_client()
    if not supabase:
        return False
    entries = list_week_files(week)
    if not entries:
        return False
    base = data_root / "raw" / week
    base.mkdir(parents=True, exist_ok=True)
    count = 0
    for file_type, filename in entries:
        storage_path = f"{week}/{file_type}/{filename}"
        dest_dir = base / file_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / filename
        try:
            data = supabase.storage.from_(RAW_DATA_BUCKET).download(storage_path)
            if data is None:
                continue
            dest_file.write_bytes(data if isinstance(data, bytes) else bytes(data))
            count += 1
            logger.info(f"Downloaded from Storage: {storage_path} -> {dest_file}")
        except Exception as e:
            logger.warning(f"Failed to download {storage_path}: {e}")
    return count > 0


def ensure_week_raw_data(
    week: str,
    data_root: Path,
    *,
    report_week: Optional[str] = None,
) -> Path:
    """
    Ensure raw data for the week is available on disk. If Supabase Storage is
    configured, always refresh from Storage first so new uploads (e.g. qlik) are
    present. Otherwise uses existing data_root/raw/week if present.
    Raises FileNotFoundError if neither local data nor Storage has the data.
    report_week: when set (alias case), error message explains which week to upload for.
    """
    raw_week_path = data_root / "raw" / week
    supabase = get_supabase_client()
    # When Storage is available, always sync from Storage so we have the latest
    # (e.g. qlik uploaded after a previous sync that only had dema/shopify).
    if supabase and list_week_files(week):
        download_week_to_path(week, data_root)
    elif raw_week_path.exists():
        for sub in ("qlik", "dema_spend", "dema_gm2", "shopify"):
            sub_path = raw_week_path / sub
            if sub_path.is_dir() and any(sub_path.iterdir()):
                logger.debug(f"Using existing raw data for week {week} at {raw_week_path}")
                break
        else:
            # No Storage or empty Storage and no usable local data
            pass
    else:
        # No local path and we didn't download (no Storage or empty)
        if not download_week_to_path(week, data_root):
            pass  # fall through to error below
    if not raw_week_path.exists() or not any(raw_week_path.rglob("*.*")):
        if report_week and report_week != week:
            msg = (
                f"Rapporten för vecka {report_week} använder data från vecka {week} (koppling). "
                f"Ladda upp råfiler (qlik, dema_spend, dema_gm2, shopify) för vecka {week} under Data-filen — inte för {report_week}."
            )
        else:
            msg = (
                f"No raw data for week {week}: not on disk and none in Supabase Storage. "
                "Upload files for this week first."
            )
        raise FileNotFoundError(msg)
    return raw_week_path
