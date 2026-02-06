"""Resolve requested week to the week whose data files to use (alias support)."""

from typing import Dict
from loguru import logger


def resolve_data_week(base_week: str) -> str:
    """Return the week whose data files to use. If target_week has an alias, return source_week; else base_week."""
    try:
        from weekly_report.src.adapters.supabase_client import get_supabase_client
        supabase = get_supabase_client()
        if not supabase:
            return base_week
        r = supabase.table("week_data_aliases").select("source_week").eq("target_week", base_week).limit(1).execute()
        if r.data and len(r.data) > 0:
            return r.data[0]["source_week"]
    except Exception as e:
        logger.debug(f"resolve_data_week({base_week}): {e}")
    return base_week


def get_week_aliases() -> Dict[str, str]:
    """Return dict target_week -> source_week from Supabase."""
    try:
        from weekly_report.src.adapters.supabase_client import get_supabase_client
        supabase = get_supabase_client()
        if not supabase:
            return {}
        r = supabase.table("week_data_aliases").select("target_week, source_week").execute()
        return {row["target_week"]: row["source_week"] for row in (r.data or [])}
    except Exception as e:
        logger.debug(f"get_week_aliases: {e}")
        return {}
