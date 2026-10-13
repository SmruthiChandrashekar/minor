import React, { useContext, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, Legend,
} from "recharts";
import { ThemeContext } from "../context/ThemeContext";

const DAY = 24 * 60 * 60 * 1000;
const DONE = ["Resolved", "Closed", "Rejected"];

export const isDone = (g) => DONE.includes(g.status);

export const isSlaBreached = (g, now = Date.now()) =>
  !isDone(g) && g.sla_deadline && new Date(g.sla_deadline).getTime() < now;

const wasEscalated = (g) =>
  (g.escalation_history || []).some((h) => h.reason || h.from_tier || h.to_tier);

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

const fmtHours = (h) => {
  if (h == null) return "—";
  if (h < 48) return `${h.toFixed(1)} hrs`;
  return `${(h / 24).toFixed(1)} days`;
};

const SEVERITY_COLORS = { Critical: "#dc2626", High: "#f97316", Medium: "#f59e0b", Low: "#10b981" };

const InsightsPanel = ({ grievances, onFilter }) => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const stats = useMemo(() => {
    const now = Date.now();
    const total = grievances.length;
    const done = grievances.filter(isDone);
    const resolved = grievances.filter((g) => g.status === "Resolved");
    const open = grievances.filter((g) => !isDone(g));
    const breached = open.filter((g) => isSlaBreached(g, now));
    const escalated = grievances.filter(wasEscalated);

    const resTimes = resolved
      .filter((g) => g.updated_at && g.created_at)
      .map((g) => (new Date(g.updated_at) - new Date(g.created_at)) / 3600000)
      .filter((h) => h >= 0);
    const avgRes = resTimes.length ? resTimes.reduce((a, b) => a + b, 0) / resTimes.length : null;
    const avgAge = open.length
      ? open.reduce((a, g) => a + (now - new Date(g.created_at)) / 3600000, 0) / open.length
      : null;

    // SLA compliance: share of tickets with an SLA that are not breached
    const withSla = grievances.filter((g) => g.sla_deadline);
    const slaCompliance = withSla.length
      ? Math.round(((withSla.length - withSla.filter((g) => isSlaBreached(g, now) || (g.escalation_history || []).some((h) => h.reason === "SLA_BREACH")).length) / withSla.length) * 100)
      : null;

    // 14-day created vs closed-out
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * DAY));
    const createdBy = {}, doneBy = {};
    grievances.forEach((g) => {
      const c = dayKey(g.created_at);
      createdBy[c] = (createdBy[c] || 0) + 1;
      if (g.status === "Resolved" && g.updated_at) {
        const r = dayKey(g.updated_at);
        doneBy[r] = (doneBy[r] || 0) + 1;
      }
    });
    const flow = days.map((d) => ({ date: d, label: d.slice(5), Received: createdBy[d] || 0, Resolved: doneBy[d] || 0 }));

    const severity = ["Critical", "High", "Medium", "Low"].map((s) => ({
      name: s, value: grievances.filter((g) => g.severity === s).length,
    }));

    const aging = [
      { name: "< 1 day", min: 0, max: 1 },
      { name: "1–3 days", min: 1, max: 3 },
      { name: "3–7 days", min: 3, max: 7 },
      { name: "7+ days", min: 7, max: Infinity },
    ].map((b) => ({
      name: b.name,
      value: open.filter((g) => {
        const age = (now - new Date(g.created_at)) / DAY;
        return age >= b.min && age < b.max;
      }).length,
    }));

    const catCounts = {};
    grievances.forEach((g) => { if (g.category) catCounts[g.category] = (catCounts[g.category] || 0) + 1; });
    const categories = Object.entries(catCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const tiers = ["L1", "L2", "L3", "HEAD"].map((t) => ({
      name: t, value: open.filter((g) => g.assigned_tier === t).length,
    }));

    return {
      total, resolutionRate: total ? Math.round((resolved.length / total) * 100) : 0,
      doneCount: done.length, openCount: open.length, breached: breached.length,
      escalationRate: total ? Math.round((escalated.length / total) * 100) : 0,
      escalatedCount: escalated.length, avgRes, avgAge, slaCompliance,
      flow, severity, aging, categories, tiers,
    };
  }, [grievances]);

  const axis = isDark ? "#a1a1aa" : "#64748b";
  const grid = isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const tipStyle = {
    backgroundColor: isDark ? "#121215" : "#ffffff",
    borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0",
    color: isDark ? "#fafafa" : "#0f172a",
    borderRadius: 8,
  };
  const click = onFilter ? { cursor: "pointer" } : undefined;

  const kpis = [
    { label: "Resolution Rate", value: `${stats.resolutionRate}%`, sub: `${stats.doneCount} of ${stats.total} closed out`, color: "#10b981", onClick: () => onFilter?.({ status: "Resolved" }) },
    { label: "SLA Compliance", value: stats.slaCompliance == null ? "N/A" : `${stats.slaCompliance}%`, sub: "tickets within deadline", color: "#0c7cd5" },
    { label: "SLA Breached Now", value: stats.breached, sub: "open past deadline", color: "#dc2626", onClick: () => onFilter?.({ sla: "BREACHED" }) },
    { label: "Avg Resolution Time", value: fmtHours(stats.avgRes), sub: "resolved tickets", color: "#8b5cf6" },
    { label: "Avg Open Age", value: fmtHours(stats.avgAge), sub: `${stats.openCount} open tickets`, color: "#f59e0b", onClick: () => onFilter?.({ status: "PENDING" }) },
    { label: "Escalation Rate", value: `${stats.escalationRate}%`, sub: `${stats.escalatedCount} escalated`, color: "#f97316" },
  ];

  const card = { borderRadius: 14 };
  const Title = ({ children, hint }) => (
    <div className="mb-2">
      <h6 className="fw-bold mb-0">{children}</h6>
      {hint && <small className="text-muted" style={{ fontSize: 11 }}>{hint}</small>}
    </div>
  );

  return (
    <div className="mb-4">
      <div className="d-flex align-items-center mb-3">
        <h5 className="mb-0 fw-bold"><i className="bi bi-activity me-2" />Performance Insights</h5>
        <span className="text-muted ms-3" style={{ fontSize: 12 }}>Derived from {stats.total} grievances in scope</span>
      </div>

      <div className="row g-3 mb-3 row-cols-2 row-cols-md-3 row-cols-xl-6">
        {kpis.map((k) => (
          <div className="col" key={k.label}>
            <div
              className="card shadow-sm border-0 p-3 h-100"
              onClick={k.onClick}
              role={k.onClick ? "button" : undefined}
              style={{ ...card, cursor: k.onClick ? "pointer" : "default" }}
            >
              <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 11 }}>{k.label}</div>
              <div className="fw-bold" style={{ fontSize: 24, color: k.color }}>{k.value}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 p-4 h-100" style={card}>
            <Title hint="Last 14 days — click a day to list those grievances">Received vs Resolved</Title>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={stats.flow}
                  style={click}
                  onClick={(s) => s?.activeLabel && onFilter?.({ date: stats.flow.find((f) => f.label === s.activeLabel)?.date })}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axis }} stroke={grid} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axis }} stroke={grid} />
                  <Tooltip contentStyle={tipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Received" stroke="#0c7cd5" fill="#0c7cd5" fillOpacity={0.15} strokeWidth={2} />
                  <Line type="monotone" dataKey="Resolved" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card shadow-sm border-0 p-4 h-100" style={card}>
            <Title hint="Click a bar to filter by severity">Severity Breakdown</Title>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.severity} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={grid} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: axis }} stroke={grid} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: axis }} stroke={grid} width={60} />
                  <Tooltip contentStyle={tipStyle} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} style={click} onClick={(d) => onFilter?.({ severity: d.name })}>
                    {stats.severity.map((s) => <Cell key={s.name} fill={SEVERITY_COLORS[s.name]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        {[
          { title: "Open Ticket Aging", hint: "How long unresolved tickets have waited", data: stats.aging, color: "#f59e0b" },
          { title: "Open Workload by Tier", hint: "Click a bar to open that queue", data: stats.tiers, color: "#8b5cf6", onBar: (d) => onFilter?.({ tier: d.name }) },
          { title: "Top Categories", hint: "Click a bar to filter by category", data: stats.categories, color: "#0c7cd5", onBar: (d) => onFilter?.({ category: d.name }) },
        ].map((c) => (
          <div className="col-lg-4" key={c.title}>
            <div className="card shadow-sm border-0 p-4 h-100" style={card}>
              <Title hint={c.hint}>{c.title}</Title>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={c.data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: axis }} stroke={grid} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axis }} stroke={grid} />
                    <Tooltip contentStyle={tipStyle} cursor={{ fill: "transparent" }} />
                    <Bar dataKey="value" fill={c.color} radius={[6, 6, 0, 0]} style={c.onBar ? click : undefined} onClick={c.onBar} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InsightsPanel;
