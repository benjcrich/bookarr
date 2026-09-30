import { useEffect, useState } from "react";
import { bookarrApi, type BookRequest } from "../api/client";

export function AdminRequests() {
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(f = filter) {
    const data = await bookarrApi.requests(f === "pending" ? "pending" : undefined);
    setRequests(data);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function approve(id: number) {
    setError(null);
    try {
      await bookarrApi.approveRequest(id);
      setMessage("Approved — added to library and search/grab pipeline triggered.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deny(id: number) {
    setError(null);
    try {
      await bookarrApi.denyRequest(id, "Not approved");
      setMessage("Request denied.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1 className="page-title">Requests</h1>
      <p className="page-lead">Approve or deny end-user audiobook requests.</p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}
      <div className="panel">
        <div className="panel-head">
          <h2>Queue</h2>
          <div className="actions">
            <button
              className="btn"
              type="button"
              onClick={async () => {
                setFilter("pending");
                await load("pending");
              }}
            >
              Pending
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                setFilter("all");
                await load("all");
              }}
            >
              All
            </button>
          </div>
        </div>
        {requests.length === 0 ? (
          <div className="empty">No requests.</div>
        ) : (
          requests.map((r) => (
            <div className="row" key={r.id}>
              <div>
                <h3>{r.title}</h3>
                <div className="meta">
                  {r.authorName} · requested by {r.requesterName}
                </div>
              </div>
              <div>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </div>
              <div className="actions">
                {r.status === "pending" && (
                  <>
                    <button className="btn ok" type="button" onClick={() => approve(r.id)}>
                      Approve
                    </button>
                    <button className="btn danger" type="button" onClick={() => deny(r.id)}>
                      Deny
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
