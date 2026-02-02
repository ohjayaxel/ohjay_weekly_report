"""Budget and actuals compute: same shape as /api/budget-general and /api/actuals-* for sync and routes."""

from typing import Any, Dict
from datetime import datetime
import pandas as pd
from loguru import logger

from weekly_report.src.config import load_config


def _parse_number(value: Any) -> float:
    """Robust number parser for budget values with locale artifacts."""
    try:
        if pd.isna(value):
            return float('nan')
        if isinstance(value, (int, float)):
            return float(value)
        s = str(value).strip()
        if s == '':
            return float('nan')
        if s.startswith('(') and s.endswith(')'):
            s = '-' + s[1:-1]
        s = s.replace(' ', '').replace('%', '')
        if ',' in s and '.' in s:
            s = s.replace(',', '')
        elif ',' in s and '.' not in s:
            parts = s.split(',')
            if all(len(p) == 3 for p in parts[1:]):
                s = ''.join(parts)
            else:
                s = s.replace(',', '.')
        return float(s)
    except Exception:
        return float('nan')


def compute_budget_general(week: str) -> Dict[str, Any]:
    """
    Aggregate budget metrics across all markets by Month.
    Same shape as /api/budget-general for map_budget_general_to_rows.
    Returns {"error": "..."} on failure so sync can skip and continue.
    """
    try:
        config = load_config(week=week)
        from weekly_report.src.adapters.budget import load_data
        df = load_data(config.raw_data_path, base_week=week)
        if df.empty:
            return {"error": "Budget file is empty"}

        df.columns = df.columns.str.strip()
        if "Month" in df.columns:
            df["Month"] = df["Month"].astype(str).str.strip()
        if "Market" in df.columns:
            df["Market"] = df["Market"].astype(str).str.strip()

        if "Market" in df.columns:
            total_aliases = {"total", "all", "all markets", "grand total", "totals"}
            df = df[~df["Market"].str.lower().isin(total_aliases)]
            df = df[df["Market"].str.len() > 0]

        dimension_cols = {"Month", "Market", "_source_file", "_source_type"}
        existing_dimension_cols = [c for c in df.columns if c in dimension_cols]
        value_df = df.drop(columns=[c for c in existing_dimension_cols if c in df.columns], errors='ignore').copy()
        for col in value_df.columns:
            value_df[col] = value_df[col].map(_parse_number)
        numeric_df = value_df

        def derive_gross(d: pd.DataFrame, net_col: str, returns_col: str, gross_col: str) -> None:
            if net_col in d.columns and returns_col in d.columns:
                try:
                    d[gross_col] = d[net_col] - d[returns_col]
                except Exception:
                    pass
        derive_gross(numeric_df, 'Returning Net Revenue', 'Returning Returns', 'Returning Gross Revenue')
        derive_gross(numeric_df, 'New Net Revenue', 'New Returns', 'New Gross Revenue')

        if "Month" not in df.columns:
            return {"error": "Budget file missing 'Month' column"}

        df_grouped = pd.concat([df[["Month"]], numeric_df], axis=1).groupby("Month", as_index=False).sum(numeric_only=True)
        try:
            df_grouped["__month_dt"] = pd.to_datetime(df_grouped["Month"], format="%B %Y", errors="coerce")
        except Exception:
            df_grouped["__month_dt"] = pd.to_datetime(df_grouped["Month"], errors="coerce")
        df_grouped = df_grouped.sort_values(["__month_dt", "Month"], ascending=[True, True]).drop(columns=["__month_dt"])
        months_order = df_grouped["Month"].tolist()

        now = datetime.now()
        def parse_month_str(m: str):
            try:
                return datetime.strptime(m, "%B %Y")
            except Exception:
                try:
                    return datetime.fromisoformat(m)
                except Exception:
                    return None
        month_parsed = {m: parse_month_str(m) for m in months_order}

        whitelist = [
            'Returning Customers', 'Share of Returning Customers', 'Returning Gross Revenue', 'Returning Returns',
            'Returning Net Revenue', 'Returning Cost of Goods Sold', 'Returning Orders', 'Returning Order Frequency',
            'Returning AOV', 'Returning Revenue per Customer',
            'New Customers', 'Share of New Customers', 'New Gross Revenue', 'New Returns', 'New Net Revenue',
            'New Cost of Goods Sold', 'New Orders', 'New Order Frequency', 'New AOV', 'New Revenue per Customer',
            'Total Customers', 'Total Orders', 'Total AOV', 'Revenue per Customer', 'Order Frequency', 'Total Gross Revenue',
        ]
        all_numeric_cols = [c for c in df_grouped.columns if c != "Month"]
        metric_cols = [c for c in whitelist if c in all_numeric_cols]
        desired_order = [
            "Returning Customers", "Share of Returning Customers", "Returning Gross Revenue", "Returning Returns",
            "Returning Net Revenue", "Returning Cost of Goods Sold", "Returning Orders", "Returning Order Frequency",
            "Returning AOV", "Returning Revenue per Customer",
            "New Customers", "Share of New Customers", "New Gross Revenue", "New Returns", "New Net Revenue",
            "New Cost of Goods Sold", "New Orders", "New Order Frequency", "New AOV", "New Revenue per Customer",
        ]
        priority_index = {name.lower(): i for i, name in enumerate(desired_order)}
        def metric_key(name: str):
            idx = priority_index.get(name.lower())
            return (0, idx) if idx is not None else (1, name.lower())
        metric_cols = sorted(metric_cols, key=metric_key)

        table = {}
        totals = {}
        ytd_totals = {}
        customer_by_metric = {}
        display_name_by_metric = {}
        for metric in metric_cols:
            metric_lower = metric.lower()
            if metric_lower.startswith('new '):
                customer_by_metric[metric] = 'New'
            elif metric_lower.startswith('returning '):
                customer_by_metric[metric] = 'Returning'
            else:
                customer_by_metric[metric] = ''
            if metric_lower.startswith('share of returning customers'):
                display_name_by_metric[metric] = 'Share of total %'
                customer_by_metric[metric] = 'Returning'
            elif metric_lower.startswith('share of new customers'):
                display_name_by_metric[metric] = 'Share of total %'
                customer_by_metric[metric] = 'New'
            else:
                display_name_by_metric[metric] = metric
            by_month = {}
            total_val = 0.0
            for _, row in df_grouped.iterrows():
                m = row["Month"]
                val = float(row[metric]) if pd.notna(row[metric]) else 0.0
                if val == float('inf') or val == float('-inf'):
                    val = 0.0
                by_month[m] = val
                total_val += val
            table[metric] = by_month
            totals[metric] = total_val
            ytd_val = 0.0
            for m, v in by_month.items():
                mp = month_parsed.get(m)
                if mp is not None and (mp.year < now.year or (mp.year == now.year and mp.month <= now.month)):
                    ytd_val += v
            ytd_totals[metric] = ytd_val

        return {
            "week": week,
            "months": months_order,
            "metrics": metric_cols,
            "table": table,
            "totals": totals,
            "ytd_totals": ytd_totals,
            "customer_by_metric": customer_by_metric,
            "display_name_by_metric": display_name_by_metric,
        }
    except Exception as e:
        logger.warning(f"compute_budget_general failed: {e}")
        return {"error": str(e)}


def compute_actuals_general(week: str) -> Dict[str, Any]:
    """Aggregate actuals across all markets by Month (same shape as budget-general). Not implemented yet."""
    return {"error": "Actuals general not implemented"}


def compute_actuals_markets_detailed(week: str) -> Dict[str, Any]:
    """Actuals per Market and Month. Not implemented yet."""
    return {"error": "Actuals markets detailed not implemented"}
