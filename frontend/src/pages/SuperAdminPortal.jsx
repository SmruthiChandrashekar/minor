import React, { useState, useEffect } from "react";
import { apiClient } from "../services/api";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ─── Colour palette for departments / categories ───────────────────────────
const PALETTE = [
  "#001a4d", "#0c7cd5", "#f59e0b", "#2e7d32",
  "#c62828", "#6a0dad", "#00838f", "#e65100",
  "#4527a0", "#558b2f"
];

// ─── Custom tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const { name, value } = payload[0];
    return (
      <div style={{
        background: "#fff", border: "1px solid #e2e8f0",
        borderRadius: 8, padding: "8px 14px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)", fontSize: 13
      }}>
        <div style={{ fontWeight: 600, color: "#001a4d" }}>{name}</div>
        <div style={{ color: "#64748b" }}>{value} grievance{value !== 1 ? "s" : ""}</div>
      </div>
    );
  }
  return null;
};

// ─── Department Overview Pie (all depts, each slice = dept total) ──────────
const DeptOverviewPie = ({ deptTotals }) => {
  const data = Object.entries(deptTotals).map(([dept, count]) => ({ name: dept, value: count }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="48%"
          innerRadius={65} outerRadius={110}
          paddingAngle={4}
          dataKey="value"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle" iconSize={10}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ─── Per-Department Category Pie ───────────────────────────────────────────
const DeptCategoryPie = ({ dept, categories }) => {
  const data = Object.entries(categories).map(([cat, count]) => ({ name: cat, value: count }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="card shadow-sm border-0 h-100" style={{ borderRadius: 14 }}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 className="fw-bold mb-0" style={{ color: "#001a4d", fontSize: 13 }}>{dept}</h6>
          <span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: 11 }}>
            {total} total
          </span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={38} outerRadius={62}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="mt-1" style={{ fontSize: 11 }}>
          {data.map((d, i) => (
            <div key={i} className="d-flex justify-content-between align-items-center py-1"
              style={{ borderBottom: i < data.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <span className="d-flex align-items-center gap-1">
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: PALETTE[i % PALETTE.length],
                  display: "inline-block", flexShrink: 0
                }} />
                {d.name}
              </span>
              <span className="fw-semibold text-muted">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────
const SuperAdminPortal = () => {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  // Dashboard state
  const [distData, setDistData] = useState([]);
  const [distLoading, setDistLoading] = useState(true);

  // Invite Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({
    name: "", email: "", password: "", role: "hr", department: "HR"
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, logsRes] = await Promise.all([
        apiClient("/api/admin/users"),
        apiClient("/api/admin/audit-logs")
      ]);
      setUsers(await usersRes.json());
      setLogs(await logsRes.json());
    } catch (err) {
      console.error(err);
      alert("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDistribution = async () => {
    try {
      setDistLoading(true);
      const res = await apiClient("/api/admin/dept-category-distribution");
      const data = await res.json();
      setDistData(data);
    } catch (err) {
      console.error("Failed to load distribution data", err);
    } finally {
      setDistLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDistribution();
  }, []);

  // Build structured object: { dept: { category: count } }
  const deptMap = {};
  distData.forEach(({ department, category, count }) => {
    if (!deptMap[department]) deptMap[department] = {};
    deptMap[department][category] = (deptMap[department][category] || 0) + count;
  });
  const deptTotals = Object.fromEntries(
    Object.entries(deptMap).map(([d, cats]) => [d, Object.values(cats).reduce((a, b) => a + b, 0)])
  );
  const totalGrievances = Object.values(deptTotals).reduce((a, b) => a + b, 0);

  const handleToggleStatus = async (user) => {
    if (!window.confirm(`Are you sure you want to ${user.is_active ? "deactivate" : "activate"} ${user.name}?`)) return;
    try {
      const res = await apiClient(`/api/admin/users/${user.user_id}/status`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !user.is_active })
      });
      if (res.ok) fetchData();
      else alert("Failed to update status.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient("/api/admin/users/invite", {
        method: "POST",
        body: JSON.stringify(inviteData)
      });
      if (res.ok) {
        alert("User invited successfully!");
        setShowInviteModal(false);
        fetchData();
      } else {
        const error = await res.json();
        alert(`Failed to invite: ${error.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold" style={{ color: "#001a4d" }}>Super Admin Portal</h2>
          <p className="text-muted mb-0">Manage staff access, view audit logs, and monitor grievance analytics.</p>
        </div>
        <button
          className="btn btn-primary shadow-sm"
          style={{ backgroundColor: "#001a4d", borderColor: "#001a4d" }}
          onClick={() => setShowInviteModal(true)}
        >
          <i className="bi bi-person-plus-fill me-2" />Invite Staff
        </button>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${tab === "dashboard" ? "active fw-bold" : ""}`} onClick={() => setTab("dashboard")}>
            <i className="bi bi-bar-chart-line me-2" />Dashboard
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "staff" ? "active fw-bold" : ""}`} onClick={() => setTab("staff")}>
            <i className="bi bi-people me-2" />Staff Management
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "audit" ? "active fw-bold" : ""}`} onClick={() => setTab("audit")}>
            <i className="bi bi-journal-text me-2" />Audit Logs
          </button>
        </li>
      </ul>

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        distLoading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : distData.length === 0 ? (
          <div className="text-center py-5 text-muted">No grievance data available yet.</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-3">
                <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #001a4d" }}>
                  <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>Total Grievances</div>
                  <h3 className="fw-bold mb-0" style={{ color: "#001a4d" }}>{totalGrievances}</h3>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #0c7cd5" }}>
                  <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>Departments Active</div>
                  <h3 className="fw-bold mb-0" style={{ color: "#0c7cd5" }}>{Object.keys(deptMap).length}</h3>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #f59e0b" }}>
                  <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>Unique Categories</div>
                  <h3 className="fw-bold mb-0" style={{ color: "#f59e0b" }}>
                    {new Set(distData.map(d => d.category)).size}
                  </h3>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="card shadow-sm border-0 p-3 h-100" style={{ borderLeft: "4px solid #2e7d32" }}>
                  <div className="text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>Staff Members</div>
                  <h3 className="fw-bold mb-0" style={{ color: "#2e7d32" }}>{users.length}</h3>
                </div>
              </div>
            </div>

            {/* Overview Pie + Table */}
            <div className="row g-4 mb-4">
              <div className="col-md-5">
                <div className="card shadow-sm border-0 p-4 h-100" style={{ borderRadius: 14 }}>
                  <h6 className="fw-bold mb-3" style={{ color: "#001a4d" }}>
                    <i className="bi bi-pie-chart-fill me-2" style={{ color: "#0c7cd5" }} />
                    Grievances by Department
                  </h6>
                  <DeptOverviewPie deptTotals={deptTotals} />
                </div>
              </div>
              <div className="col-md-7">
                <div className="card shadow-sm border-0 p-4 h-100" style={{ borderRadius: 14 }}>
                  <h6 className="fw-bold mb-3" style={{ color: "#001a4d" }}>
                    <i className="bi bi-table me-2" style={{ color: "#0c7cd5" }} />
                    Department Breakdown
                  </h6>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                      <thead className="table-light">
                        <tr>
                          <th className="px-3 py-2">Department</th>
                          <th className="py-2">Top Category</th>
                          <th className="py-2 text-center">Total</th>
                          <th className="py-2">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(deptTotals)
                          .sort((a, b) => b[1] - a[1])
                          .map(([dept, total], i) => {
                            const cats = deptMap[dept];
                            const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
                            const pct = Math.round((total / totalGrievances) * 100);
                            return (
                              <tr key={dept}>
                                <td className="px-3 fw-semibold">
                                  <span className="me-2" style={{
                                    width: 10, height: 10, borderRadius: "50%",
                                    backgroundColor: PALETTE[i % PALETTE.length],
                                    display: "inline-block"
                                  }} />
                                  {dept}
                                </td>
                                <td><span className="badge bg-light text-dark border">{topCat}</span></td>
                                <td className="text-center fw-bold">{total}</td>
                                <td>
                                  <div className="d-flex align-items-center gap-2">
                                    <div className="progress flex-grow-1" style={{ height: 6, borderRadius: 4 }}>
                                      <div className="progress-bar" role="progressbar"
                                        style={{ width: `${pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                                    </div>
                                    <span style={{ fontSize: 11, minWidth: 28, color: "#64748b" }}>{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Department Category Pies */}
            <div className="card shadow-sm border-0 p-4 mb-4" style={{ borderRadius: 14 }}>
              <h6 className="fw-bold mb-3" style={{ color: "#001a4d" }}>
                <i className="bi bi-diagram-3-fill me-2" style={{ color: "#0c7cd5" }} />
                Grievance Types per Department
              </h6>
              <div className="row g-3">
                {Object.entries(deptMap).map(([dept, cats]) => (
                  <div key={dept} className="col-sm-6 col-md-4 col-lg-3">
                    <DeptCategoryPie dept={dept} categories={cats} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      )}

      {/* ── STAFF MANAGEMENT TAB ── */}
      {tab === "staff" && (
        loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <div className="card shadow-sm border-0 rounded-4">
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="py-3">Email</th>
                      <th className="py-3">Role</th>
                      <th className="py-3">Department</th>
                      <th className="py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan="6" className="text-center py-4 text-muted">No staff found.</td></tr>
                    ) : users.map(u => (
                      <tr key={u.user_id}>
                        <td className="px-4 fw-medium">{u.name}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`badge ${u.role === "super_admin" ? "bg-danger" : "bg-primary"}`}>
                            {u.role.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td>{u.department}</td>
                        <td className="text-center">
                          {u.is_active
                            ? <span className="badge bg-success bg-opacity-10 text-success border border-success">Active</span>
                            : <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary">Deactivated</span>}
                        </td>
                        <td className="px-4 text-end">
                          <button
                            className={`btn btn-sm ${u.is_active ? "btn-outline-danger" : "btn-outline-success"}`}
                            onClick={() => handleToggleStatus(u)}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── AUDIT LOGS TAB ── */}
      {tab === "audit" && (
        loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <div className="card shadow-sm border-0 rounded-4">
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="py-3">Action</th>
                      <th className="py-3">Actor</th>
                      <th className="py-3">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr><td colSpan="4" className="text-center py-4 text-muted">No logs found.</td></tr>
                    ) : logs.map(log => (
                      <tr key={log.log_id}>
                        <td className="px-4 text-muted small">{new Date(log.created_at).toLocaleString()}</td>
                        <td><span className="fw-semibold" style={{ color: "#001a4d" }}>{log.action}</span></td>
                        <td>
                          <div className="fw-medium">{log.actor_name}</div>
                          <div className="small text-muted">{log.actor_role}</div>
                        </td>
                        <td>{log.target_email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow">
              <div className="modal-header border-bottom-0">
                <h5 className="modal-title fw-bold" style={{ color: "#001a4d" }}>Invite New Staff</h5>
                <button type="button" className="btn-close" onClick={() => setShowInviteModal(false)} />
              </div>
              <div className="modal-body px-4">
                <form onSubmit={handleInviteSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Name</label>
                    <input type="text" className="form-control" value={inviteData.name}
                      onChange={e => setInviteData({ ...inviteData, name: e.target.value })} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Email</label>
                    <input type="email" className="form-control" value={inviteData.email}
                      onChange={e => setInviteData({ ...inviteData, email: e.target.value })} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Temporary Password</label>
                    <input type="text" className="form-control" value={inviteData.password}
                      onChange={e => setInviteData({ ...inviteData, password: e.target.value })} required />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-semibold">Role</label>
                      <select className="form-select" value={inviteData.role}
                        onChange={e => setInviteData({ ...inviteData, role: e.target.value })}>
                        <option value="super_admin">Super Admin</option>
                        <option value="hr">HR Representative</option>
                        <option value="safety">Safety Officer</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-semibold">Department</label>
                      <input type="text" className="form-control" value={inviteData.department}
                        onChange={e => setInviteData({ ...inviteData, department: e.target.value })} required />
                    </div>
                  </div>
                  <div className="mt-4 d-flex justify-content-end">
                    <button type="button" className="btn btn-light me-2" onClick={() => setShowInviteModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary"
                      style={{ backgroundColor: "#001a4d", borderColor: "#001a4d" }}>Send Invite</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPortal;
