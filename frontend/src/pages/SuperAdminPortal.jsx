import React, { useState, useEffect } from "react";
import { apiClient } from "../services/api";

const SuperAdminPortal = () => {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("staff");

  // Invite Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({
    name: "",
    email: "",
    password: "",
    role: "hr",
    department: "HR"
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

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (user) => {
    if (!window.confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} ${user.name}?`)) return;
    try {
      const res = await apiClient(`/api/admin/users/${user.user_id}/status`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !user.is_active })
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to update status.");
      }
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
          <p className="text-muted mb-0">Manage staff access and view system audit logs.</p>
        </div>
        <div>
          <button
            className="btn btn-primary shadow-sm"
            style={{ backgroundColor: "#001a4d", borderColor: "#001a4d" }}
            onClick={() => setShowInviteModal(true)}
          >
            <i className="bi bi-person-plus-fill me-2"></i>Invite Staff
          </button>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${tab === "staff" ? "active fw-bold" : ""}`} onClick={() => setTab("staff")}>
            <i className="bi bi-people me-2"></i>Staff Management
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === "audit" ? "active fw-bold" : ""}`} onClick={() => setTab("audit")}>
            <i className="bi bi-journal-text me-2"></i>Audit Logs
          </button>
        </li>
      </ul>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : tab === "staff" ? (
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
                    <tr>
                      <td colSpan="6" className="text-center py-4 text-muted">No staff found.</td>
                    </tr>
                  ) : users.map(u => (
                    <tr key={u.user_id}>
                      <td className="px-4 fw-medium">{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`badge ${
                          u.role === 'super_admin' ? 'bg-danger' : 'bg-primary'
                        }`}>
                          {u.role.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td>{u.department}</td>
                      <td className="text-center">
                        {u.is_active ? (
                          <span className="badge bg-success bg-opacity-10 text-success border border-success">Active</span>
                        ) : (
                          <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary">Deactivated</span>
                        )}
                      </td>
                      <td className="px-4 text-end">
                        <button
                          className={`btn btn-sm ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-muted">No logs found.</td>
                    </tr>
                  ) : logs.map(log => (
                    <tr key={log.log_id}>
                      <td className="px-4 text-muted small">{new Date(log.created_at).toLocaleString()}</td>
                      <td><span className="fw-semibold" style={{ color: "#001a4d" }}>{log.action}</span></td>
                      <td>
                        <div className="fw-medium">{log.actor_name}</div>
                        <div className="small text-muted">{log.actor_role}</div>
                      </td>
                      <td>{log.target_email || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow">
              <div className="modal-header border-bottom-0">
                <h5 className="modal-title fw-bold" style={{ color: "#001a4d" }}>Invite New Staff</h5>
                <button type="button" className="btn-close" onClick={() => setShowInviteModal(false)}></button>
              </div>
              <div className="modal-body px-4">
                <form onSubmit={handleInviteSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Name</label>
                    <input type="text" className="form-control" value={inviteData.name} onChange={e => setInviteData({...inviteData, name: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Email</label>
                    <input type="email" className="form-control" value={inviteData.email} onChange={e => setInviteData({...inviteData, email: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Temporary Password</label>
                    <input type="text" className="form-control" value={inviteData.password} onChange={e => setInviteData({...inviteData, password: e.target.value})} required />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-semibold">Role</label>
                      <select className="form-select" value={inviteData.role} onChange={e => setInviteData({...inviteData, role: e.target.value})}>
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label fw-semibold">Department</label>
                      <select className="form-select" value={inviteData.department} onChange={e => setInviteData({...inviteData, department: e.target.value})} required>
                        <option value="">Select Department</option>
                        <option value="ESG">ESG</option>
                        <option value="IC">IC</option>
                        <option value="HR">HR</option>
                        <option value="CSD">CSD</option>
                        <option value="CRM">CRM</option>
                        <option value="Investors">Investors</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 d-flex justify-content-end">
                    <button type="button" className="btn btn-light me-2" onClick={() => setShowInviteModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ backgroundColor: "#001a4d", borderColor: "#001a4d" }}>Send Invite</button>
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
