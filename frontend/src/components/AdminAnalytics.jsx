import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";
import { apiClient } from "../services/api";

const AdminAnalytics = ({ adminDepartment }) => {
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

  const COLORS = ["#0c7cd5", "#f59e0b", "#2e7d32", "#c62828"];
  const statusData = Object.keys(insights.status_distribution).map(key => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: insights.status_distribution[key]
  }));

  return (
    <div className="mb-5">
      {/* Filters */}
      <div className="card shadow-sm border-0 mb-4 p-3 bg-white" style={{ borderRadius: "12px" }}>
        <div className="row g-3 align-items-center">
          <div className="col-auto">
            <span className="fw-bold" style={{ color: "#001a4d" }}>
              <h5 className="mb-0 ms-2"><i className="bi bi-graph-up text-primary me-2"></i>{adminDepartment ? `${adminDepartment} Analytics` : 'Overall Analytics'}</h5>
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
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #001a4d" }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Total Grievances</div>
            <h3 className="fw-bold mb-0" style={{ color: "#001a4d" }}>{filteredCount}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #f59e0b" }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Avg Resolution Time</div>
            <h3 className="fw-bold mb-0" style={{ color: "#f59e0b" }}>{metrics.avg_resolution_time} hrs</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #c62828" }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>High/Critical Risk</div>
            <h3 className="fw-bold mb-0" style={{ color: "#c62828" }}>{insights.high_severity}</h3>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #0c7cd5" }}>
            <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.75rem" }}>Pending Cases</div>
            <h3 className="fw-bold mb-0" style={{ color: "#0c7cd5" }}>
              {(insights.status_distribution.open || 0) + (insights.status_distribution.investigating || 0)}
            </h3>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="row g-3">
        <div className="col-md-8">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h6 className="fw-bold mb-3" style={{ color: "#001a4d" }}>Complaint Volume Trends</h6>
            <div style={{ height: "250px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} allowDecimals={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="count" stroke="#001a4d" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card shadow-sm border-0 p-4 h-100">
            <h6 className="fw-bold mb-3" style={{ color: "#001a4d" }}>Status Distribution</h6>
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
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: "12px"}} />
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
