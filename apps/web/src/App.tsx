import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminDownloads } from "./pages/AdminDownloads";
import { AdminLibrary } from "./pages/AdminLibrary";
import { AdminRequests } from "./pages/AdminRequests";
import { AdminSearch } from "./pages/AdminSearch";
import { AdminSettings } from "./pages/AdminSettings";
import { Home } from "./pages/Home";
import { RequestHome } from "./pages/RequestHome";
import { RequestMine } from "./pages/RequestMine";

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">Bookarr</p>
        <p className="brand-sub">Audiobook automation</p>
        <nav className="nav">
          <NavLink to="/admin" end>
            Dashboard
          </NavLink>
          <NavLink to="/admin/library">Library</NavLink>
          <NavLink to="/admin/requests">Requests</NavLink>
          <NavLink to="/admin/search">Search / Grab</NavLink>
          <NavLink to="/admin/downloads">Downloads</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
          <NavLink to="/request">Request UI →</NavLink>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function RequestShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">Bookarr</p>
        <p className="brand-sub">Request audiobooks</p>
        <nav className="nav">
          <NavLink to="/request" end>
            Search & request
          </NavLink>
          <NavLink to="/request/mine">My requests</NavLink>
          <NavLink to="/admin">Admin →</NavLink>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/admin"
        element={
          <AdminShell>
            <AdminDashboard />
          </AdminShell>
        }
      />
      <Route
        path="/admin/library"
        element={
          <AdminShell>
            <AdminLibrary />
          </AdminShell>
        }
      />
      <Route
        path="/admin/requests"
        element={
          <AdminShell>
            <AdminRequests />
          </AdminShell>
        }
      />
      <Route
        path="/admin/search"
        element={
          <AdminShell>
            <AdminSearch />
          </AdminShell>
        }
      />
      <Route
        path="/admin/downloads"
        element={
          <AdminShell>
            <AdminDownloads />
          </AdminShell>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminShell>
            <AdminSettings />
          </AdminShell>
        }
      />
      <Route
        path="/request"
        element={
          <RequestShell>
            <RequestHome />
          </RequestShell>
        }
      />
      <Route
        path="/request/mine"
        element={
          <RequestShell>
            <RequestMine />
          </RequestShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
