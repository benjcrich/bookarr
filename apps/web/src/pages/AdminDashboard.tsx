import { useEffect, useState } from "react";
import { bookarrApi, type Stats } from "../api/client";

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [prowlarr, setProwlarr] = useState<{ mode: string; detail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bookarrApi
      .health()
      .then((h) => {
        setStats(h.stats);
        setProwlarr(h.prowlarr);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-lead">
        Library overview, pending requests, and Prowlarr connectivity for Bookarr.
      </p>
      {error && <p className="flash error">{error}</p>}
      {prowlarr && (
        <p className="flash">
          Prowlarr mode: <strong>{prowlarr.mode}</strong> — {prowlarr.detail}
        </p>
      )}
      {stats && (
        <div className="grid-stats">
          <div className="stat">
            <strong>{stats.books}</strong>
            <span>Audiobooks</span>
          </div>
          <div className="stat">
            <strong>{stats.wanted}</strong>
            <span>Wanted</span>
          </div>
          <div className="stat">
            <strong>{stats.pendingRequests}</strong>
            <span>Pending requests</span>
          </div>
          <div className="stat">
            <strong>{stats.downloads}</strong>
            <span>Download jobs</span>
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-head">
          <h2>Pipeline</h2>
        </div>
        <div className="empty">
          Request → approve → mark wanted/monitored → Prowlarr search → grab → download client
          (hook) → library import (next).
        </div>
      </div>
    </>
  );
}
