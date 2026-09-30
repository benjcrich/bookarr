import { useEffect, useState } from "react";
import { bookarrApi, type DownloadJob } from "../api/client";

export function AdminDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bookarrApi
      .downloads()
      .then(setJobs)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Downloads</h1>
      <p className="page-lead">
        Download pipeline jobs. Client adapters (qBittorrent / SABnzbd) are next on the roadmap.
      </p>
      {error && <p className="flash error">{error}</p>}
      <div className="panel">
        <div className="panel-head">
          <h2>Jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="empty">No download jobs yet. Grab a release from Search.</div>
        ) : (
          jobs.map((j) => (
            <div className="row" key={j.id}>
              <div>
                <h3>{j.title}</h3>
                <div className="meta">
                  {j.indexerName ?? "indexer"} · {j.protocol} · {new Date(j.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <span className={`badge ${j.status}`}>{j.status}</span>
              </div>
              <div />
            </div>
          ))
        )}
      </div>
    </>
  );
}
