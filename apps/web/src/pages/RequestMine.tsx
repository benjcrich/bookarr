import { useEffect, useState } from "react";
import { bookarrApi, type BookRequest } from "../api/client";

export function RequestMine() {
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const name = localStorage.getItem("bookarr.requester") || "";

  useEffect(() => {
    bookarrApi
      .requests()
      .then((all) => setRequests(name ? all.filter((r) => r.requesterName === name) : all))
      .catch((e: Error) => setError(e.message));
  }, [name]);

  return (
    <>
      <h1 className="page-title">My requests</h1>
      <p className="page-lead">
        {name ? `Showing requests from ${name}.` : "Showing recent requests (set your name when requesting)."}
      </p>
      {error && <p className="flash error">{error}</p>}
      <div className="panel">
        <div className="panel-head">
          <h2>History</h2>
        </div>
        {requests.length === 0 ? (
          <div className="empty">No requests yet.</div>
        ) : (
          requests.map((r) => (
            <div className="row" key={r.id}>
              <div>
                <h3>{r.title}</h3>
                <div className="meta">
                  {r.authorName} · {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </div>
              <div className="meta">{r.denyReason ?? ""}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
