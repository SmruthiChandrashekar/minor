-- Run this script in your Supabase SQL Editor to create the Analytics functions

-- 1. Get Complaint Trends
CREATE OR REPLACE FUNCTION get_admin_trends(p_category text DEFAULT NULL, p_severity text DEFAULT NULL)
RETURNS TABLE(date text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT DATE(created_at)::text as date, COUNT(*) as count
  FROM public.grievances
  WHERE (p_category IS NULL OR category = p_category)
    AND (p_severity IS NULL OR severity = p_severity)
  GROUP BY DATE(created_at)
  ORDER BY date ASC;
END;
$$ LANGUAGE plpgsql;

-- 2. Get Average Resolution Time (in hours)
CREATE OR REPLACE FUNCTION get_admin_metrics(p_category text DEFAULT NULL, p_severity text DEFAULT NULL)
RETURNS TABLE(avg_resolution_time numeric) AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric, 2), 0) as avg_resolution_time
  FROM public.grievances
  WHERE status = 'Resolved'
    AND (p_category IS NULL OR category = p_category)
    AND (p_severity IS NULL OR severity = p_severity);
END;
$$ LANGUAGE plpgsql;

-- 3. Get Top Categories
CREATE OR REPLACE FUNCTION get_top_categories(p_category text DEFAULT NULL, p_severity text DEFAULT NULL)
RETURNS TABLE(category text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT g.category, COUNT(*) as count
  FROM public.grievances g
  WHERE (p_category IS NULL OR g.category = p_category)
    AND (p_severity IS NULL OR g.severity = p_severity)
  GROUP BY g.category
  ORDER BY count DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- 4. Get Status Distribution
CREATE OR REPLACE FUNCTION get_status_distribution(p_category text DEFAULT NULL, p_severity text DEFAULT NULL)
RETURNS TABLE(status text, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT g.status, COUNT(*) as count
  FROM public.grievances g
  WHERE (p_category IS NULL OR g.category = p_category)
    AND (p_severity IS NULL OR g.severity = p_severity)
  GROUP BY g.status;
END;
$$ LANGUAGE plpgsql;
