import React, { useState, useEffect, useContext } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { apiClient } from "../services/api";
import { ThemeContext } from "../context/ThemeContext";

const AdminAnalytics = ({ adminDepartment }) => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [trends, setTrends] = useState([]);
  const [metrics, setMetrics] = useState({ avg_resolution_time: 0 });
  const [insights, setInsights] = useState({ top_categories: [], high_severity: 0, status_distribution: {} });
  
  // Filters
  const [severity, setSeverity] = useState("");
  const [filteredCount, setFilteredCount] = useState(0);

  // Fetch Dashboard Data
  const fetchDashboardData = async () => {
    try {
      const params = `?category=${adminDepartment}&severity=${severity}`;
      const [trendsRes, metricsRes, insightsRes, complaintsRes] = await Promise.all([
        apiClient(`/api/admin/trends${params}`),
        apiClient(`/api/admin/metrics${params}`),
        apiClient(`/api/admin/insights${params}`),
        apiClient(`/api/admin/complaints${params}`)
      ]);

      setTrends(await trendsRes.json());
      setMetrics(await metricsRes.json());
      setInsights(await insightsRes.json());
      
      const complaints = await complaintsRes.json();
      setFilteredCount(complaints.length);

    } catch (err) {
      console.error("Failed to fetch analytics", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [adminDepartment, severity]);

  const COLORS = isDark
    ? ["#e4e4e7", "#fbbf24", "#34d399", "#f87171"]
    : ["#0c7cd5", "#f59e0b", "#2e7d32", "#c62828"];

  const statusData = Object.keys(insights.status_distribution).map(key => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: insights.status_distribution[key]
  }));

  return (
    <div className="mb-5">
      {/* Filters */}
      <div className="card shadow-sm border-0 mb-4 p-3" style={{ borderRadius: "12px" }}>
        <div className="row g-3 align-items-center">
          <div className="col-auto">
            <span className="fw-bold" style={{ color: "var(--heading-color)" }}>
              <h5 className="mb-0 ms-2">
                <i className="bi bi-graph-up me-2" style={{ color: isDark ? "#e4e4e7" : "var(--brand-blue)" }}></i>
                {adminDepartment ? `${adminDepartment} Analytics` : 'Overall Analytics'}
              </h5>
            </span>
          </div>
          <div className="col-md-3">
            <select className="form-select form-select-sm" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="">All Severities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="col-md-6 text-end text-muted" style={{ fontSize: "0.85rem" }}>
            Showing {filteredCount} records for {adminDepartment}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="row g-3 mb-4 row-cols-2 row-cols-md-5">
        <div className="col">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: `4px solid ${isDark ? "#e4e4e7" : "#001a4d"}` }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Total Grievances</div>
            <h3 className="fw-bold mb-0" style={{ color: isDark ? "#fafafa" : "#001a4d" }}>{filteredCount}</h3>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #f59e0b" }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Avg Resolution Time</div>
            <h3 className="fw-bold mb-0" style={{ color: "#f59e0b" }}>{metrics.avg_resolution_time} hrs</h3>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: `4px solid ${isDark ? "#34d399" : "#2e7d32"}` }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>User Satisfaction</div>
            <h3 className="fw-bold mb-0" style={{ color: isDark ? "#34d399" : "#2e7d32" }}>
              {metrics.avg_satisfaction ? `${metrics.avg_satisfaction} / 5` : "N/A"}
              {metrics.avg_satisfaction && <span className="text-warning ms-2" style={{ fontSize: "1.5rem", lineHeight: "1" }}>★</span>}
            </h3>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: `4px solid ${isDark ? "#f87171" : "#c62828"}` }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>High/Critical Risk</div>
            <h3 className="fw-bold mb-0" style={{ color: isDark ? "#f87171" : "#c62828" }}>{insights.high_severity}</h3>
          </div>
        </div>
        <div className="col">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: `4px solid ${isDark ? "#a1a1aa" : "#0c7cd5"}` }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Pending Cases</div>
            <h3 className="fw-bold mb-0" style={{ color: isDark ? "#d4d4d8" : "#0c7cd5" }}>
              {(insights.status_distribution.open || 0) + (insights.status_distribution.investigating || 0)}
            </h3>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="row g-3">
        <div className="col-md-8">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h6 className="fw-bold mb-3" style={{ color: "var(--heading-color)" }}>Complaint Volume Trends</h6>
            <div style={{ height: "250px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: isDark ? "#a1a1aa" : "#64748b" }} stroke={isDark ? "rgba(255,255,255,0.12)" : "#cbd5e1"} />
                  <YAxis tick={{ fontSize: 12, fill: isDark ? "#a1a1aa" : "#64748b" }} stroke={isDark ? "rgba(255,255,255,0.12)" : "#cbd5e1"} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#121215" : "#ffffff",
                      borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0",
                      color: isDark ? "#fafafa" : "#0f172a",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.35)"
                    }}
                    itemStyle={{ color: isDark ? "#fafafa" : "#0f172a" }}
                  />
                  <Line type="monotone" dataKey="count" stroke={isDark ? "#e4e4e7" : "#001a4d"} strokeWidth={3} dot={{ r: 4, fill: isDark ? "#fafafa" : "#001a4d" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h6 className="fw-bold mb-3" style={{ color: "var(--heading-color)" }}>Status Distribution</h6>
            <div style={{ height: "200px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#121215" : "#ffffff",
                      borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0",
                      color: isDark ? "#fafafa" : "#0f172a",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.35)"
                    }}
                    itemStyle={{ color: isDark ? "#fafafa" : "#0f172a" }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px", color: isDark ? "#a1a1aa" : "#64748b" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default AdminAnalytics;
