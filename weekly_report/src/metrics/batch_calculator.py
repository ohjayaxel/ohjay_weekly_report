"""Unified batch calculator for all metrics using shared data loading."""

from typing import Dict, Any
from pathlib import Path
from loguru import logger

from weekly_report.src.metrics.table1 import load_all_raw_data, calculate_table1_for_periods_with_ytd
from weekly_report.src.metrics.markets import calculate_top_markets_for_weeks
from weekly_report.src.metrics.online_kpis import calculate_online_kpis_for_weeks
from weekly_report.src.metrics.contribution import calculate_contribution_for_weeks
from weekly_report.src.metrics.gender_sales import calculate_gender_sales_for_weeks
from weekly_report.src.metrics.men_category_sales import calculate_men_category_sales_for_weeks
from weekly_report.src.metrics.women_category_sales import calculate_women_category_sales_for_weeks
from weekly_report.src.metrics.category_sales import calculate_category_sales_for_weeks
from weekly_report.src.metrics.top_products import calculate_top_products_for_weeks
from weekly_report.src.metrics.top_products_gender import calculate_top_products_by_gender_for_weeks
from weekly_report.src.metrics.sessions_per_country import calculate_sessions_per_country_for_weeks
from weekly_report.src.metrics.conversion_per_country import calculate_conversion_per_country_for_weeks
from weekly_report.src.metrics.new_customers_per_country import calculate_new_customers_per_country_for_weeks
from weekly_report.src.metrics.returning_customers_per_country import calculate_returning_customers_per_country_for_weeks
from weekly_report.src.metrics.aov_new_customers_per_country import calculate_aov_new_customers_per_country_for_weeks
from weekly_report.src.metrics.aov_returning_customers_per_country import calculate_aov_returning_customers_per_country_for_weeks
from weekly_report.src.metrics.marketing_spend_per_country import calculate_marketing_spend_per_country_for_weeks
from weekly_report.src.metrics.ncac_per_country import calculate_ncac_per_country_for_weeks
from weekly_report.src.metrics.contribution_new_per_country import calculate_contribution_new_per_country_for_weeks
from weekly_report.src.metrics.contribution_new_total_per_country import calculate_contribution_new_total_per_country_for_weeks
from weekly_report.src.metrics.contribution_returning_per_country import calculate_contribution_returning_per_country_for_weeks
from weekly_report.src.metrics.contribution_returning_total_per_country import calculate_contribution_returning_total_per_country_for_weeks
from weekly_report.src.metrics.total_contribution_per_country import calculate_total_contribution_per_country_for_weeks
from weekly_report.src.periods.calculator import get_periods_for_week


def calculate_all_metrics(
    data_week: str,
    data_root: Path,
    num_weeks: int = 8,
    report_week: str | None = None,
) -> Dict[str, Any]:
    """
    Calculate all metrics in a single batch using shared data loading.
    
    Args:
        data_week: ISO week whose raw data to load (data_root/raw/data_week).
        data_root: Root data directory.
        num_weeks: Number of weeks to analyze (default: 8).
        report_week: If set (e.g. when aliasing), periods and labels use this week;
            data is still loaded from data_week. Use for "use week 5 files, report for week 4".
        
    Returns:
        Dictionary containing all calculated metrics.
    """
    if report_week is None:
        report_week = data_week
    
    logger.info(f"Starting unified batch calculation (data: {data_week}, report: {report_week})")
    
    # Periods for the report week (so "actual" = report_week, etc.)
    periods = get_periods_for_week(report_week)
    
    results = {
        'periods': periods,
        'metrics': {},
        'markets': {},
        'kpis': {},
        'contribution': {},
        'gender_sales': {},
        'men_category_sales': {},
        'women_category_sales': {},
        'category_sales': {},
        'products_new': {},
        'products_gender': {},
        'sessions_per_country': {},
        'conversion_per_country': {},
        'new_customers_per_country': {},
        'returning_customers_per_country': {},
        'aov_new_customers_per_country': {},
        'aov_returning_customers_per_country': {},
        'marketing_spend_per_country': {},
        'ncac_per_country': {},
        'contribution_new_per_country': {},
        'contribution_new_total_per_country': {},
        'contribution_returning_per_country': {},
        'contribution_returning_total_per_country': {},
        'total_contribution_per_country': {}
    }
    
    try:
        # 1. Calculate periods and table1 metrics (WITH YTD) – periods for report_week, load from data_week when aliasing
        logger.info("Calculating periods and table1 metrics with YTD...")
        metrics_data = calculate_table1_for_periods_with_ytd(
            periods, data_root, data_week=(data_week if report_week != data_week else None)
        )
        results['metrics'] = metrics_data
        
        # 2. Calculate top markets (load from data_week path)
        logger.info("Calculating top markets...")
        markets_data = calculate_top_markets_for_weeks(data_week, num_weeks, data_root)
        results['markets'] = markets_data
        
        # 3–23: all load from data_week path
        logger.info("Calculating online KPIs...")
        results['kpis'] = calculate_online_kpis_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating contribution...")
        results['contribution'] = calculate_contribution_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating gender sales...")
        results['gender_sales'] = calculate_gender_sales_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating men category sales...")
        results['men_category_sales'] = calculate_men_category_sales_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating women category sales...")
        results['women_category_sales'] = calculate_women_category_sales_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating category sales...")
        results['category_sales'] = calculate_category_sales_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating top products...")
        results['products_new'] = calculate_top_products_for_weeks(data_week, 1, data_root)
        products_gender_men = calculate_top_products_by_gender_for_weeks(data_week, 1, data_root, 'men')
        products_gender_women = calculate_top_products_by_gender_for_weeks(data_week, 1, data_root, 'women')
        results['products_gender'] = {'men': products_gender_men, 'women': products_gender_women}
        logger.info("Calculating sessions per country...")
        results['sessions_per_country'] = calculate_sessions_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating conversion per country...")
        results['conversion_per_country'] = calculate_conversion_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating new customers per country...")
        results['new_customers_per_country'] = calculate_new_customers_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating returning customers per country...")
        results['returning_customers_per_country'] = calculate_returning_customers_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating AOV new customers per country...")
        results['aov_new_customers_per_country'] = calculate_aov_new_customers_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating AOV returning customers per country...")
        results['aov_returning_customers_per_country'] = calculate_aov_returning_customers_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating marketing spend per country...")
        results['marketing_spend_per_country'] = calculate_marketing_spend_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating nCAC per country...")
        results['ncac_per_country'] = calculate_ncac_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating contribution new per country...")
        results['contribution_new_per_country'] = calculate_contribution_new_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating contribution new total per country...")
        results['contribution_new_total_per_country'] = calculate_contribution_new_total_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating contribution returning per country...")
        results['contribution_returning_per_country'] = calculate_contribution_returning_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating contribution returning total per country...")
        results['contribution_returning_total_per_country'] = calculate_contribution_returning_total_per_country_for_weeks(data_week, num_weeks, data_root)
        logger.info("Calculating total contribution per country...")
        results['total_contribution_per_country'] = calculate_total_contribution_per_country_for_weeks(data_week, num_weeks, data_root)
        
        # When reporting for a different week than data, set latest_week in period_info to report_week
        if report_week != data_week:
            for key in list(results.keys()):
                val = results.get(key)
                if isinstance(val, dict) and 'period_info' in val and isinstance(val['period_info'], dict):
                    results[key] = {**val, 'period_info': {**val['period_info'], 'latest_week': report_week}}
        
        logger.info(f"Successfully completed batch calculation for {report_week}")
        
    except Exception as e:
        logger.error(f"Error during batch calculation: {e}")
        raise
    
    return results

